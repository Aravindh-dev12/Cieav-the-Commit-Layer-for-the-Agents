import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createApp } from '../src/app.js';

test('trace -> recall -> run -> approval -> verified log', async () => {
  const srv = createApp({ apiKey: 'test-key-123' }).listen(0);
  const b = `http://127.0.0.1:${srv.address().port}`;
  const H = { 'x-api-key': 'test-key-123', 'content-type': 'application/json' };
  const j = (p, o = {}) => fetch(b + p, { headers: H, ...o }).then((r) => r.json());
  try {
    assert.equal((await fetch(b + '/api/procedures')).status, 401);
    const t = JSON.parse(readFileSync('public/sample.json', 'utf8'));
    assert.equal((await j('/api/traces', { method: 'POST', body: JSON.stringify(t) })).status, 'ready');
    assert.equal((await j('/api/traces', { method: 'POST', body: JSON.stringify(t) })).duplicate, true);
    const run = await j('/api/runs', { method: 'POST', body: JSON.stringify({ query: 'friday revenue report', params: { week: 'W42' } }) });
    assert.equal(run.status, 'awaiting_approval'); // the send step is R3
    const done = await j(`/api/runs/${run.id}/approve`, { method: 'POST', body: JSON.stringify({ decision: 'approve' }) });
    assert.equal(done.status, 'done');
    assert.equal(done.llm_calls, 0);
    assert.equal((await j('/api/activity/verify')).ok, true);
    const pl = (await j('/api/pipelines'))[0];
    let pr = await j(`/api/pipelines/${pl.id}/run`, { method: 'POST', body: JSON.stringify({ input: { query: 'friday revenue report', week: 'W43' } }) });
    assert.equal(pr.status, 'paused'); // procedure node waits for the send approval
    await j(`/api/runs/${pr.ctx.procedure.id}/approve`, { method: 'POST', body: JSON.stringify({ decision: 'approve' }) });
    pr = await j(`/api/pipeline-runs/${pr.id}/resume`, { method: 'POST', body: '{}' });
    assert.equal(pr.status, 'done');
    assert.match(pr.ctx.agent.text, /offline/);
    const bad = await fetch(b + '/api/pipelines', { method: 'POST', headers: H, body: JSON.stringify({ graph: { nodes: [{ id: 'a', type: 'log', config: {} }, { id: 'b', type: 'log', config: {} }], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }] } }) });
    assert.equal(bad.status, 400); // cycles rejected
  } finally { srv.close(); }
});
