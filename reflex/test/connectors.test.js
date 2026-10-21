import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

const users = [
  { key: 'alice-key-1', name: 'alice', roles: ['engineer'], clearance: 'internal' },
  { key: 'editor-key-1', name: 'ed', roles: ['editor'], clearance: 'internal' },
];
const jh = (k) => ({ 'x-api-key': k, 'content-type': 'application/json' });

async function harness(env, routes) {
  const realFetch = globalThis.fetch, calls = [];
  Object.assign(process.env, env);
  globalThis.fetch = (u, o = {}) => {
    for (const [prefix, fn] of Object.entries(routes)) if (String(u).startsWith(prefix)) { calls.push({ url: String(u), ...o }); return Promise.resolve(fn(String(u), o)); }
    return realFetch(u, o);
  };
  const srv = createApp({ apiKey: 'admin-key-1', users }).listen(0), base = `http://127.0.0.1:${srv.address().port}`;
  return { base, calls, done: () => { globalThis.fetch = realFetch; srv.close(); for (const k of Object.keys(env)) delete process.env[k]; } };
}

test('GitLab push re-indexes changed docs, versioned and idempotent', async () => {
  let content = 'Every merge request needs one approval.';
  const t = await harness({ GITLAB_URL: 'https://gitlab.test', GITLAB_TOKEN: 'glpat-x', GITLAB_WEBHOOK_TOKEN: 'hook-secret-1' }, { 'https://gitlab.test': () => new Response(content) });
  const push = (ref = 'refs/heads/main') => fetch(t.base + '/hooks/gitlab', { method: 'POST', headers: { 'x-gitlab-token': 'hook-secret-1', 'content-type': 'application/json' },
    body: JSON.stringify({ object_kind: 'push', ref, after: 'abc123', user_username: 'dev1', project: { id: 7, path_with_namespace: 'eng/req', default_branch: 'main', web_url: 'https://gitlab.test/eng/req' },
      commits: [{ added: ['docs/a.md', 'src/x.js'], modified: [] }] }) }).then((r) => r.json());
  try {
    assert.equal((await fetch(t.base + '/hooks/gitlab', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 401);
    assert.equal((await push()).processed[0].version, 1);
    assert.equal((await push()).processed[0].unchanged, true);
    content = 'Every merge request needs two approvals.';
    assert.equal((await push()).processed[0].version, 2);
    assert.ok((await push('refs/heads/feature')).ignored);
    assert.equal(t.calls[0].headers['PRIVATE-TOKEN'], 'glpat-x');
    assert.match(t.calls[0].url, /files\/docs%2Fa\.md\/raw\?ref=abc123/); // only docs/ files are fetched
  } finally { t.done(); }
});

test('pull connector maps classifications and fails closed on unknown ones', async () => {
  const source = { name: 'waypoint', url: 'https://wp.test/api/reqs', token_env: 'WP_TOKEN', items_path: 'items',
    map: { doc_key: 'id', title: 'name', body: 'text', level: 'cls' }, level_map: { Internal: 'internal' } };
  const t = await harness({ PULL_SOURCES: JSON.stringify([source]), WP_TOKEN: 'tok' }, { 'https://wp.test': () => Response.json({ items: [
    { id: 'R1', name: 'Req 1', text: 'Mast shall deploy in 40 s.', cls: 'Internal' }, { id: 'R2', name: 'Req 2', text: 'Secret thing.', cls: 'Mystery' }] }) });
  try {
    const r = await (await fetch(t.base + '/api/sync/waypoint', { method: 'POST', headers: jh('admin-key-1') })).json();
    assert.equal(r.count, 2);
    assert.equal(t.calls[0].headers.authorization, 'Bearer tok');
    const seen = (await (await fetch(t.base + '/api/docs', { headers: jh('alice-key-1') })).json()).map((d) => d.doc_key);
    assert.deepEqual(seen, ['waypoint:R1']); // R2 had an unknown classification, so it is restricted
    assert.equal((await fetch(t.base + '/api/sync/waypoint', { method: 'POST', headers: jh('alice-key-1') })).status, 403);
  } finally { t.done(); }
});

test('documents wait for approval; approver must differ from requester', async () => {
  const t = await harness({ REQUIRE_APPROVAL: '1', APPROVAL_FLOW_URL: 'https://flow.test/trigger', APPROVAL_SECRET: 'flow-secret-1', PUBLIC_URL: 'https://reflex.test' }, { 'https://flow.test': () => new Response('{}') });
  const decide = (id, body, secret = 'flow-secret-1') => fetch(`${t.base}/hooks/approval/${id}`, { method: 'POST', headers: { 'x-flow-secret': secret, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const sub = await (await fetch(t.base + '/api/docs', { method: 'POST', headers: jh('editor-key-1'), body: JSON.stringify({ doc_key: 'SPEC-9', body: 'Release candidate spec.' }) })).json();
    assert.equal(sub.pending, true);
    assert.equal(JSON.parse(t.calls[0].body).callback, `https://reflex.test/hooks/approval/${sub.id}`); // flow gets a callback URL
    const visible = async () => (await (await fetch(t.base + '/api/docs', { headers: jh('alice-key-1') })).json()).length;
    assert.equal(await visible(), 0); // not searchable while pending
    assert.equal((await decide(sub.id, { decision: 'approve', approver: 'boss' }, 'wrong')).status, 401);
    assert.equal((await decide(sub.id, { decision: 'approve', approver: 'ed' })).status, 403); // no self-approval
    const ok = await (await decide(sub.id, { decision: 'approve', approver: 'boss@co.test' })).json();
    assert.equal(ok.status, 'approved');
    assert.equal(await visible(), 1);
    assert.equal((await decide(sub.id, { decision: 'reject', approver: 'boss@co.test' })).status, 409); // already decided
  } finally { t.done(); }
});

test('per-user hourly question limit', async () => {
  const t = await harness({ ASK_LIMIT_PER_HOUR: '2' }, {});
  const ask = () => fetch(t.base + '/api/ask', { method: 'POST', headers: jh('alice-key-1'), body: JSON.stringify({ question: 'anything' }) }).then((r) => r.status);
  try { assert.deepEqual([await ask(), await ask(), await ask()], [200, 200, 429]); } finally { t.done(); }
});
