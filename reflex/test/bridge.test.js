import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/app.js';

test('Node forwards the verified user to the RAG service and tracks model cost', async () => {
  let seen;
  const rag = http.createServer((q, r) => {
    let body = ''; q.on('data', (d) => (body += d));
    q.on('end', () => {
      seen = { secret: q.headers['x-rag-secret'], body: JSON.parse(body || '{}') };
      r.setHeader('content-type', 'application/json');
      r.end(JSON.stringify(q.url === '/search' ? { hits: [{ text: 'Depth of discharge shall not exceed 50 percent.', doc_key: 'REQ-PWR-001', version: 2, title: 'Power' }] } : { usage: [] }));
    });
  });
  await new Promise((r) => rag.listen(0, r));
  Object.assign(process.env, { RAG_URL: `http://127.0.0.1:${rag.address().port}`, RAG_SECRET: 'shared-secret-1', ANTHROPIC_API_KEY: 'test', PRICE_IN_PER_MTOK: '3', PRICE_OUT_PER_MTOK: '15' });
  const realFetch = globalThis.fetch;
  globalThis.fetch = (u, o) => String(u).startsWith('https://api.anthropic.com')
    ? Promise.resolve(Response.json({ content: [{ type: 'text', text: 'Limit is 50 percent [1]' }], usage: { input_tokens: 1000, output_tokens: 200 } }))
    : realFetch(u, o);
  const srv = createApp({ apiKey: 'admin-key-1', users: [{ key: 'alice-key-1', name: 'alice', roles: ['engineer'], clearance: 'internal' }] }).listen(0);
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const r = await (await fetch(base + '/api/ask', { method: 'POST', headers: { 'x-api-key': 'alice-key-1', 'content-type': 'application/json' }, body: JSON.stringify({ question: 'depth of discharge limit' }) })).json();
    assert.equal(r.citations[0].doc_key, 'REQ-PWR-001');
    assert.equal(r.unverified, false); // the model cited a real source
    assert.equal(seen.secret, 'shared-secret-1');
    assert.deepEqual(seen.body.user, { name: 'alice', roles: ['engineer'], clearance: 'internal' }); // identity comes from Node, not the client
    const u = await (await fetch(base + '/api/usage', { headers: { 'x-api-key': 'admin-key-1' } })).json();
    assert.equal(u.models[0].input, 1000);
    assert.equal(u.models[0].cost_usd, 0.006); // 1000*3/1e6 + 200*15/1e6
    assert.equal((await fetch(base + '/api/usage', { headers: { 'x-api-key': 'alice-key-1' } })).status, 403);
  } finally {
    globalThis.fetch = realFetch; srv.close(); rag.closeAllConnections?.(); rag.close();
    for (const k of ['RAG_URL', 'RAG_SECRET', 'ANTHROPIC_API_KEY', 'PRICE_IN_PER_MTOK', 'PRICE_OUT_PER_MTOK']) delete process.env[k];
  }
});
