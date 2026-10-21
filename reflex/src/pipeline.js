import { recall } from './recall.js';
import { start, getRun } from './replay.js';
import { complete } from './models.js';
import { log } from './log.js';
import { ask } from './knowledge.js';

const tpl = (s, ctx) => String(s ?? '').replace(/\{\{([\w.]+)\}\}/g, (_, p) => {
  const v = p.split('.').reduce((o, k) => o?.[k], ctx);
  return v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : v;
});

const NODES = {
  trigger: async (_n, ctx) => ({ ...ctx.input }),
  recall: async (n, ctx, db) => {
    const hit = recall(db, tpl(n.config.query ?? '{{trigger.query}}', ctx))[0];
    if (!hit || hit.confidence < 0.4) throw new Error('no confident procedure match');
    return hit;
  },
  procedure: async (n, ctx, db) => {
    let run = ctx[n.id]?.id ? getRun(db, ctx[n.id].id) : null; // resuming after approval
    if (!run) {
      const params = Object.fromEntries(Object.entries(n.config.params || {}).map(([k, v]) => [k, tpl(v, ctx)]));
      run = await start(db, Number(tpl(n.config.procedureId ?? '{{recall.id}}', ctx)), params, 'pipeline');
    }
    if (['awaiting_approval', 'awaiting_repair'].includes(run.status)) return { __pause: true, run };
    if (run.status !== 'done') throw new Error('procedure run ended as ' + run.status);
    return run;
  },
  agent: async (n, ctx) => ({ text: await complete(tpl(n.config.system, ctx), tpl(n.config.prompt, ctx)) }),
  http: async (n, ctx) => {
    const url = new URL(tpl(n.config.url, ctx));
    const allow = (process.env.HTTP_ALLOW || '').split(',').filter(Boolean);
    if (!['http:', 'https:'].includes(url.protocol) || !allow.includes(url.hostname)) throw new Error('host not in HTTP_ALLOW');
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: tpl(n.config.body ?? '{}', ctx), signal: AbortSignal.timeout(15000) });
    return { status: r.status, body: (await r.text()).slice(0, 2000) };
  },
  ask: async (n, ctx, db) => ask(db, ctx.user, tpl(n.config.question ?? '{{trigger.query}}', ctx)),
  log: async (n, ctx, db) => { log(db, 'pipeline', 'pipeline.log', { msg: tpl(n.config.message, ctx) }); return {}; },
};

const bad = (m) => Object.assign(new Error(m), { status: 400 });
export function validate(g) {
  if (!g || !Array.isArray(g.nodes) || !Array.isArray(g.edges)) throw bad('graph needs nodes[] and edges[]');
  const ids = new Set(g.nodes.map((n) => n.id));
  if (ids.size !== g.nodes.length) throw bad('node ids must be unique');
  if (g.nodes.some((n) => !NODES[n.type])) throw bad('unknown node type');
  if (g.edges.some((e) => !ids.has(e.from) || !ids.has(e.to))) throw bad('edge references a missing node');
  order(g);
}

export function order(g) { // topological order; rejects cycles
  const indeg = {}, adj = {};
  g.nodes.forEach((n) => { indeg[n.id] = 0; adj[n.id] = []; });
  g.edges.forEach((e) => { adj[e.from].push(e.to); indeg[e.to]++; });
  const q = g.nodes.filter((n) => !indeg[n.id]).map((n) => n.id), out = [];
  while (q.length) { const x = q.shift(); out.push(x); adj[x].forEach((y) => { if (!--indeg[y]) q.push(y); }); }
  if (out.length !== g.nodes.length) throw bad('pipeline has a cycle');
  return out;
}

export function getPR(db, id) {
  const r = db.prepare('SELECT * FROM pipeline_runs WHERE id=?').get(id);
  return r && { ...r, ctx: JSON.parse(r.ctx), trace: JSON.parse(r.trace) };
}
const save = (db, id, f) => {
  const r = { ...f, updated_at: Date.now() };
  db.prepare(`UPDATE pipeline_runs SET ${Object.keys(r).map((k) => k + '=?').join(',')} WHERE id=?`).run(...Object.values(r), id);
};
const mark = (trace, id, status) => { const t = trace.find((x) => x.id === id); t ? (t.status = status) : trace.push({ id, status }); };

export async function runPipeline(db, pipelineId, input, user) {
  if (!db.prepare('SELECT 1 FROM pipelines WHERE id=?').get(pipelineId)) throw Object.assign(new Error('pipeline not found'), { status: 404 });
  const id = db.prepare('INSERT INTO pipeline_runs(pipeline_id,status,ctx,updated_at) VALUES(?,?,?,?)')
    .run(pipelineId, 'running', JSON.stringify({ input, user }), Date.now()).lastInsertRowid;
  return step(db, id);
}

export async function step(db, rid) {
  const r = getPR(db, rid);
  if (!r) throw Object.assign(new Error('pipeline run not found'), { status: 404 });
  if (!['running', 'paused'].includes(r.status)) return r;
  const g = JSON.parse(db.prepare('SELECT graph FROM pipelines WHERE id=?').get(r.pipeline_id).graph);
  const ord = order(g), by = Object.fromEntries(g.nodes.map((n) => [n.id, n])), { ctx, trace } = r;
  const snap = (f) => save(db, rid, { ...f, ctx: JSON.stringify(ctx), trace: JSON.stringify(trace) });
  for (let i = r.cursor; i < ord.length; i++) {
    const n = by[ord[i]];
    try {
      const out = await NODES[n.type](n, ctx, db);
      if (out?.__pause) { ctx[n.id] = out.run; mark(trace, n.id, 'waiting'); snap({ status: 'paused', cursor: i }); return getPR(db, rid); }
      ctx[n.id] = out; mark(trace, n.id, 'ok');
    } catch (e) {
      mark(trace, n.id, 'failed'); snap({ status: 'failed', cursor: i, error: e.message });
      log(db, 'pipeline', 'pipeline.failed', { rid, node: n.id });
      return getPR(db, rid);
    }
  }
  snap({ status: 'done', cursor: ord.length });
  log(db, 'pipeline', 'pipeline.done', { rid });
  return getPR(db, rid);
}

export function seed(db) {
  if (db.prepare('SELECT COUNT(*) c FROM pipelines').get().c) return;
  const graph = {
    nodes: [
      { id: 'trigger', type: 'trigger', x: 30, y: 70, config: {} },
      { id: 'recall', type: 'recall', x: 230, y: 70, config: { query: '{{trigger.query}}' } },
      { id: 'procedure', type: 'procedure', x: 430, y: 70, config: { procedureId: '{{recall.id}}', params: { week: '{{trigger.week}}' } } },
      { id: 'agent', type: 'agent', x: 630, y: 70, config: { system: 'You write one-sentence run summaries.', prompt: 'Summarize this run result: {{procedure}}' } },
      { id: 'log', type: 'log', x: 830, y: 70, config: { message: '{{agent.text}}' } },
    ],
    edges: [['trigger', 'recall'], ['recall', 'procedure'], ['procedure', 'agent'], ['agent', 'log']].map(([from, to]) => ({ from, to })),
  };
  db.prepare('INSERT INTO pipelines(name,graph) VALUES(?,?)').run('Friday report', JSON.stringify(graph));
}
