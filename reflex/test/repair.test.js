import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { setModel } from '../src/models.js';

// Fake desktop driver: the old control name fails, the renamed one works.
const driver = http.createServer((q, r) => {
  let b = ''; q.on('data', (d) => (b += d));
  q.on('end', () => {
    const { step } = JSON.parse(b);
    r.setHeader('content-type', 'application/json');
    r.end(JSON.stringify(step.target.name === 'Export to CSV' ? { ok: true, text: 'ok' } : { ok: false, text: '', ui: ['Export to CSV', 'Print'] }));
  });
});

test('failed step -> agent proposes -> human approves -> procedure patched', async () => {
  await new Promise((r) => driver.listen(0, r));
  process.env.DRIVER_URL = `http://127.0.0.1:${driver.address().port}`;
  const srv = createApp({ apiKey: 'test-key-123' }).listen(0);
  const b = `http://127.0.0.1:${srv.address().port}`;
  const H = { 'x-api-key': 'test-key-123', 'content-type': 'application/json' };
  const j = (p, body) => fetch(b + p, { headers: H, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) }).then((r) => r.json());
  const trace = (app) => ({ prompt: 'export ledger ' + app, steps: [{ app, action: 'click', class: 'execute', target: { name: 'Export' }, check: { contains: 'ok' } }] });
  try {
    setModel(async () => JSON.stringify({ action: 'patch', reason: 'Button was renamed', patch: { target: { name: 'Export to CSV' } } }));
    const p1 = await j('/api/traces', trace('erp'));
    assert.equal((await j(`/api/procedures/${p1.id}/simulate`, {})).trusted, true); // earn trust first
    let run = await j('/api/runs', { procedureId: p1.id });
    assert.equal(run.status, 'awaiting_repair');
    assert.equal(run.llm_calls, 1);
    run = await j(`/api/runs/${run.id}/repair`, { decision: 'approve' });
    assert.equal(run.status, 'done');
    assert.equal((await j(`/api/procedures/${p1.id}`)).steps[0].target.name, 'Export to CSV');
    assert.equal((await j(`/api/procedures/${p1.id}`)).trusted, 0); // a patched procedure must re-earn trust
    assert.equal((await j('/api/activity/verify')).ok, true);

    // A hallucinated target that is not on screen never reaches the human.
    setModel(async () => JSON.stringify({ action: 'patch', patch: { target: { name: 'Delete everything' } } }));
    const p2 = await j('/api/traces', trace('erp2'));
    assert.equal((await j('/api/runs', { procedureId: p2.id })).status, 'handoff');
  } finally { setModel(null); srv.close(); driver.closeAllConnections?.(); driver.close(); }
});
