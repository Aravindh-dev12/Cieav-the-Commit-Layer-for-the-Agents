import { timingSafeEqual } from 'node:crypto';
import { ingest, remoteIngest } from './knowledge.js';
import { log } from './log.js';

const err = (m, status) => Object.assign(new Error(m), { status });
export const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
const store = (db, payload, actor) => (process.env.RAG_URL ? remoteIngest(db, payload, actor) : ingest(db, payload, actor));

// Every document write goes through here. With REQUIRE_APPROVAL=1 it waits for a human decision
// (e.g. a multi-stage Power Automate flow) and is invisible to search until approved.
export async function submit(db, payload, actor) {
  if (process.env.REQUIRE_APPROVAL !== '1') return store(db, payload, actor);
  const id = db.prepare('INSERT INTO pending_docs(doc_key,payload,status,requested_by,created_at) VALUES(?,?,?,?,?)')
    .run(payload.doc_key, JSON.stringify(payload), 'pending', actor, Date.now()).lastInsertRowid;
  log(db, actor, 'approval.doc_requested', { id, doc: payload.doc_key });
  if (process.env.APPROVAL_FLOW_URL) { // Power Automate "When an HTTP request is received" trigger
    try {
      await fetch(process.env.APPROVAL_FLOW_URL, {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ id, doc_key: payload.doc_key, title: payload.title, level: payload.level || 'internal', requested_by: actor,
          callback: `${process.env.PUBLIC_URL || ''}/hooks/approval/${id}` }),
      });
    } catch { log(db, 'system', 'approval.flow_unreachable', { id }); }
  }
  return { pending: true, id };
}

export async function decide(db, id, decision, approver) {
  const p = db.prepare('SELECT * FROM pending_docs WHERE id=?').get(id);
  if (!p) throw err('not found', 404);
  if (p.status !== 'pending') throw err('already decided', 409);
  if (approver === p.requested_by) throw err('approver must differ from the requester', 403); // segregation of duties
  db.prepare('UPDATE pending_docs SET status=?, decided_by=? WHERE id=?').run(decision === 'approve' ? 'approved' : 'rejected', approver, id);
  log(db, approver, 'approval.doc_' + decision, { id, doc: p.doc_key });
  return decision === 'approve' ? { status: 'approved', ...(await store(db, JSON.parse(p.payload), approver)) } : { status: 'rejected' };
}

export async function gitlabPush(db, body) {
  const p = body.project;
  if (body.object_kind !== 'push' || !p) return { ignored: 'not a push event' };
  if (body.ref !== `refs/heads/${p.default_branch}`) return { ignored: 'not the default branch' };
  const re = new RegExp(process.env.DOC_PATHS || '^docs/.+\\.(md|txt)$');
  const files = [...new Set((body.commits || []).flatMap((c) => [...(c.added || []), ...(c.modified || [])]))].filter((f) => re.test(f)).slice(0, 50);
  const processed = [];
  for (const f of files) {
    const r = await fetch(`${process.env.GITLAB_URL}/api/v4/projects/${p.id}/repository/files/${encodeURIComponent(f)}/raw?ref=${body.after}`,
      { headers: { 'PRIVATE-TOKEN': process.env.GITLAB_TOKEN || '' }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) { processed.push({ file: f, error: r.status }); continue; }
    const text = await r.text();
    if (text.length > 500000) { processed.push({ file: f, error: 'too large' }); continue; }
    processed.push({ file: f, ...(await submit(db, {
      doc_key: `gitlab:${p.path_with_namespace}:${f}`, title: f, body: text, level: process.env.GITLAB_DEFAULT_LEVEL || 'internal',
      source: `${p.web_url}/-/blob/${body.after}/${f}` }, `gitlab:${body.user_username || 'webhook'}`)) });
  }
  return { processed };
}

// Config-driven pull connector for any JSON API (Waypoint exports, Dynamics 365 Dataverse OData, ...).
// PULL_SOURCES=[{name,url,token_env,items_path,map:{doc_key,title,body,level},level_map,default_level}]
export async function pull(db, name, actor) {
  const src = JSON.parse(process.env.PULL_SOURCES || '[]').find((s) => s.name === name);
  if (!src) throw err('unknown source', 404);
  const r = await fetch(src.url, { headers: src.token_env ? { authorization: 'Bearer ' + (process.env[src.token_env] || '') } : {}, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw err('source returned ' + r.status, 502);
  let items = await r.json();
  for (const k of (src.items_path || '').split('.').filter(Boolean)) items = items?.[k];
  if (!Array.isArray(items)) throw err('items_path did not resolve to a list', 502);
  const m = src.map, results = [];
  for (const it of items.slice(0, 500)) {
    const key = it[m.doc_key], body = it[m.body];
    if (!key || typeof body !== 'string' || !body.trim()) continue;
    const raw = m.level ? it[m.level] : undefined;
    const level = raw == null ? (src.default_level || 'internal') : (src.level_map?.[raw] ?? 'restricted'); // unknown classification fails closed
    results.push(await submit(db, { doc_key: `${name}:${key}`, title: String(it[m.title] || key), body, level, source: src.url }, actor));
  }
  return { source: name, count: results.length, results };
}
