import express from 'express';
import helmet from 'helmet';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { open } from './db.js';
import { extract } from './extract.js';
import { recall } from './recall.js';
import { log, verify } from './log.js';
import { submit, decide, gitlabPush, pull, safeEq } from './connectors.js';
import { lint, simulate, outcomes } from './assure.js';
import { verifyJwt, userFromClaims } from './entra.js';
import { ingest, listDocs, ask, remoteIngest, remoteFile, remoteUsage } from './knowledge.js';
import { provider, setUsageSink } from './models.js';
import { validate, seed, runPipeline, step, getPR } from './pipeline.js';
import { start, decideApproval, decideRepair, getRun } from './replay.js';

export function createApp({ dbPath = ':memory:', apiKey, users = [], entra = null } = {}) {
  if (!apiKey || apiKey.length < 8) throw new Error('API_KEY must be set (8+ chars)');
  const db = open(dbPath), app = express(), hits = new Map();
  const parse = (r) => r && { ...r, steps: JSON.parse(r.steps), manifest: JSON.parse(r.manifest) };

  seed(db);
  setUsageSink((u) => db.prepare('INSERT INTO model_usage(ts,model,input,output) VALUES(?,?,?,?)').run(Date.now(), u.model, u.input, u.output));
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: { ...helmet.contentSecurityPolicy.getDefaultDirectives(),
    'connect-src': ["'self'", 'https://login.microsoftonline.com'] } } })); // allow MSAL token calls
  app.use(express.json({ limit: '1mb' }));
  app.use(express.static(fileURLToPath(new URL('../public', import.meta.url))));
  app.get('/api/health', (_q, r) => r.json({ ok: true }));

  // Public, secret-authenticated hooks: GitLab push events and the approval flow's callback.
  app.get('/config.json', (_q, r) => r.json({ sso: entra ? { clientId: process.env.ENTRA_CLIENT_ID, tenant: process.env.ENTRA_TENANT_ID, scope: `${entra.aud}/.default` } : null }));
  app.post('/hooks/gitlab', async (q, r) => {
    if (!process.env.GITLAB_WEBHOOK_TOKEN || !safeEq(q.get('x-gitlab-token') || '', process.env.GITLAB_WEBHOOK_TOKEN)) return r.status(401).json({ error: 'unauthorized' });
    r.json(await gitlabPush(db, q.body));
  });
  app.post('/hooks/approval/:id', async (q, r) => {
    if (!process.env.APPROVAL_SECRET || !safeEq(q.get('x-flow-secret') || '', process.env.APPROVAL_SECRET)) return r.status(401).json({ error: 'unauthorized' });
    const { decision, approver } = q.body || {};
    if (!['approve', 'reject'].includes(decision) || !approver) return r.status(400).json({ error: 'decision and approver required' });
    r.json(await decide(db, Number(q.params.id), decision, String(approver)));
  });

  app.use('/api', (req, res, next) => { // rate limit: 300 req/min/ip
    const now = Date.now(), h = (hits.get(req.ip) || []).filter((t) => now - t < 60000);
    h.push(now); hits.set(req.ip, h);
    return h.length > 300 ? res.status(429).json({ error: 'rate limited' }) : next();
  });
  const roster = [{ key: apiKey, name: 'admin', roles: ['admin'], clearance: 'restricted' }, ...users];
  app.use('/api', async (req, res, next) => { // auth: Entra ID bearer token, or an API key mapped to a user
    const bearer = /^Bearer (.+)$/.exec(req.get('authorization') || '')?.[1];
    if (bearer) {
      if (!entra) return res.status(401).json({ error: 'SSO not configured' });
      try { req.user = userFromClaims(verifyJwt(bearer, entra.keys, entra), entra.groupMap); return next(); }
      catch { return res.status(401).json({ error: 'invalid token' }); }
    }
    const k = Buffer.from(req.get('x-api-key') || '');
    let who = null;
    for (const u of roster) { const a = Buffer.from(u.key); if (a.length === k.length && timingSafeEqual(a, k)) who = u; }
    if (!who) return res.status(401).json({ error: 'unauthorized' });
    req.user = { name: who.name, roles: who.roles || [], clearance: who.clearance || 'public' };
    next();
  });

  app.post('/api/traces', (req, res) => {
    const t = req.body;
    if (!t?.prompt || !Array.isArray(t.steps) || !t.steps.length) return res.status(400).json({ error: 'prompt and steps[] required' });
    const p = extract(t);
    const dup = db.prepare('SELECT id FROM procedures WHERE trace_hash=?').get(p.hash);
    if (dup) return res.json({ id: dup.id, duplicate: true });
    const text = [p.title, ...p.steps.map((s) => `${s.app} ${s.action} ${s.target.name || ''}`)].join(' ');
    const id = db.prepare('INSERT INTO procedures(title,text,status,trace_hash,verifier,manifest,steps,created_at) VALUES(?,?,?,?,?,?,?,?)')
      .run(p.title, text, p.status, p.hash, p.verifier, JSON.stringify(p.manifest), JSON.stringify(p.steps), Date.now()).lastInsertRowid;
    log(db, 'user', 'procedure.created', { id, status: p.status });
    res.status(201).json({ id, status: p.status, verifier: p.verifier });
  });
  app.get('/api/procedures', (_q, r) => r.json(db.prepare('SELECT * FROM procedures ORDER BY id DESC').all().map(parse)));
  app.get('/api/procedures/:id', (q, r) => {
    const p = parse(db.prepare('SELECT * FROM procedures WHERE id=?').get(q.params.id));
    return p ? r.json(p) : r.status(404).json({ error: 'not found' });
  });
  const rawProc = (id) => db.prepare('SELECT * FROM procedures WHERE id=?').get(id);
  app.get('/api/procedures/:id/lint', (q, r) => { const p = parse(rawProc(q.params.id)); return p ? r.json(lint(p)) : r.status(404).json({ error: 'not found' }); });
  // Portable, lock-in-free export: POSTing it back to /api/traces round-trips to the same procedure.
  app.get('/api/procedures/:id/export', (q, r) => {
    const p = parse(rawProc(q.params.id));
    return p ? r.json({ prompt: p.title, steps: p.steps.map(({ n, ...rest }) => rest) }) : r.status(404).json({ error: 'not found' });
  });
  app.post('/api/procedures/:id/simulate', async (q, r) => {
    if (!q.user.roles.some((x) => ['admin', 'editor'].includes(x))) return r.status(403).json({ error: 'editor role required' });
    const row = rawProc(q.params.id);
    if (!row) return r.status(404).json({ error: 'not found' });
    const scenarios = await simulate(row, Array.isArray(q.body.scenarios) ? q.body.scenarios : []), l = lint(parse(row));
    const trusted = l.ok && scenarios.every((x) => x.pass); // trust is earned by passing, never granted
    db.prepare('UPDATE procedures SET trusted=? WHERE id=?').run(trusted ? 1 : 0, row.id);
    log(db, q.user.name, trusted ? 'procedure.trusted' : 'procedure.untrusted', { id: row.id });
    r.json({ trusted, lint: l, scenarios });
  });
  app.get('/api/outcomes', (_q, r) => r.json(outcomes(db)));
  app.get('/api/recall', (q, r) => r.json(recall(db, String(q.query.q || ''))));

  app.post('/api/runs', async (req, res) => {
    let id = req.body.procedureId;
    if (!id) {
      const hit = recall(db, String(req.body.query || ''))[0];
      if (!hit || hit.confidence < 0.4) return res.status(404).json({ error: 'no confident match; refine the request' });
      id = hit.id;
    }
    res.status(201).json(await start(db, id, req.body.params || {}, 'user', !!req.body.unattended));
  });
  app.get('/api/runs', (_q, r) => r.json(db.prepare('SELECT id FROM runs ORDER BY id DESC LIMIT 50').all().map((x) => getRun(db, x.id))));
  app.post('/api/runs/:id/approve', async (q, r) => {
    if (!['approve', 'reject'].includes(q.body.decision)) return r.status(400).json({ error: 'decision must be approve or reject' });
    r.json(await decideApproval(db, Number(q.params.id), q.body.decision, 'user'));
  });
  app.post('/api/runs/:id/repair', async (q, r) => {
    if (!['approve', 'reject'].includes(q.body.decision)) return r.status(400).json({ error: 'decision must be approve or reject' });
    r.json(await decideRepair(db, Number(q.params.id), q.body.decision, 'user'));
  });
  app.get('/api/activity', (_q, r) => r.json(db.prepare('SELECT * FROM activity ORDER BY seq DESC LIMIT 200').all()));
  app.get('/api/activity/verify', (_q, r) => r.json(verify(db)));

  const editor = (u) => u.roles.some((x) => ['admin', 'editor'].includes(x));
  app.post('/api/docs', async (q, r) => {
    if (!editor(q.user)) return r.status(403).json({ error: 'editor role required' });
    r.status(201).json(await submit(db, q.body, q.user.name));
  });
  app.get('/api/approvals', (q, r) => {
    if (!editor(q.user)) return r.status(403).json({ error: 'editor role required' });
    r.json(db.prepare("SELECT id,doc_key,status,requested_by,decided_by,created_at FROM pending_docs ORDER BY id DESC LIMIT 100").all());
  });
  app.post('/api/sync/:name', async (q, r) => {
    if (!q.user.roles.includes('admin')) return r.status(403).json({ error: 'admin only' });
    r.json(await pull(db, q.params.name, q.user.name));
  });
  // Raw file upload (PDF, DOCX, Markdown) parsed by the Python service: PUT /api/docs/file?doc_key=..&name=spec.pdf&level=..
  app.put('/api/docs/file', express.raw({ type: '*/*', limit: '25mb' }), async (q, r) => {
    if (!editor(q.user)) return r.status(403).json({ error: 'editor role required' });
    if (!process.env.RAG_URL) return r.status(501).json({ error: 'file parsing needs the RAG service (set RAG_URL)' });
    if (!q.query.doc_key || !Buffer.isBuffer(q.body) || !q.body.length) return r.status(400).json({ error: 'doc_key and a file body are required' });
    r.status(201).json(await remoteFile(db, q.body, q.query, q.user.name));
  });
  app.get('/api/usage', async (q, r) => {
    if (!q.user.roles.includes('admin')) return r.status(403).json({ error: 'admin only' });
    const pin = +process.env.PRICE_IN_PER_MTOK || 0, pout = +process.env.PRICE_OUT_PER_MTOK || 0;
    const models = db.prepare('SELECT model, COUNT(*) calls, SUM(input) input, SUM(output) output FROM model_usage GROUP BY model').all()
      .map((x) => ({ ...x, cost_usd: +((x.input * pin + x.output * pout) / 1e6).toFixed(4) }));
    r.json({ models, retrieval: process.env.RAG_URL ? await remoteUsage() : null });
  });
  app.get('/api/docs', (q, r) => r.json(listDocs(db, q.user)));
  const asks = new Map(); // per-user hourly limit protects model cost
  app.post('/api/ask', async (q, r) => {
    const now = Date.now(), a = (asks.get(q.user.name) || []).filter((t) => now - t < 3600000);
    if (a.length >= (+process.env.ASK_LIMIT_PER_HOUR || 120)) return r.status(429).json({ error: 'hourly question limit reached' });
    a.push(now); asks.set(q.user.name, a);
    r.json(await ask(db, q.user, String(q.body.question || '').slice(0, 1000)));
  });
  app.get('/api/models', (_q, r) => r.json({ provider: provider() }));
  const pipe = (r) => r && { ...r, graph: JSON.parse(r.graph) };
  app.get('/api/pipelines', (_q, r) => r.json(db.prepare('SELECT * FROM pipelines').all().map(pipe)));
  app.post('/api/pipelines', (q, r) => {
    validate(q.body.graph);
    const id = db.prepare('INSERT INTO pipelines(name,graph) VALUES(?,?)').run(String(q.body.name || 'untitled'), JSON.stringify(q.body.graph)).lastInsertRowid;
    r.status(201).json({ id });
  });
  app.put('/api/pipelines/:id', (q, r) => {
    validate(q.body.graph);
    db.prepare('UPDATE pipelines SET graph=? WHERE id=?').run(JSON.stringify(q.body.graph), q.params.id);
    r.json({ ok: true });
  });
  app.post('/api/pipelines/:id/run', async (q, r) => r.status(201).json(await runPipeline(db, Number(q.params.id), q.body.input || {}, q.user)));
  app.get('/api/pipeline-runs', (_q, r) => r.json(db.prepare('SELECT id FROM pipeline_runs ORDER BY id DESC LIMIT 20').all().map((x) => getPR(db, x.id))));
  app.post('/api/pipeline-runs/:id/resume', async (q, r) => r.json(await step(db, Number(q.params.id))));

  app.use((err, _req, res, _next) => { // central error handler
    if (!err.status) console.error(err);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'internal error' });
  });
  return app;
}
