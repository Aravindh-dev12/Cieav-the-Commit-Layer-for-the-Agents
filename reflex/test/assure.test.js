import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createApp } from '../src/app.js';

test('lint, simulation-earned trust, unattended gate, outcomes, export round trip', async () => {
  const srv = createApp({ apiKey: 'admin-key-1' }).listen(0), base = `http://127.0.0.1:${srv.address().port}`;
  const H = { 'x-api-key': 'admin-key-1', 'content-type': 'application/json' };
  const j = (p, body) => fetch(base + p, { headers: H, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) }).then((r) => r.json());
  try {
    const sample = JSON.parse(readFileSync('public/sample.json', 'utf8'));
    const good = await j('/api/traces', sample);
    const bad = await j('/api/traces', { prompt: 'sloppy send', steps: [
      { app: 'a', action: 'click', class: 'execute', check: { contains: 'ok' } }, { app: 'a', action: 'send', class: 'send' }] });

    assert.equal((await j(`/api/procedures/${bad.id}/lint`)).violations[0].rule, 'risky-step-needs-check');
    const sb = await j(`/api/procedures/${bad.id}/simulate`, {});
    assert.equal(sb.trusted, false); // lint failure blocks trust

    const rejected = await fetch(base + '/api/runs', { method: 'POST', headers: H, body: JSON.stringify({ procedureId: good.id, unattended: true }) });
    assert.equal(rejected.status, 409); // not yet trusted
    const sg = await j(`/api/procedures/${good.id}/simulate`, {});
    assert.equal(sg.trusted, true);
    assert.equal(sg.scenarios.length, 4); // happy path + a fault at each of the 3 checked steps
    assert.ok(sg.scenarios.every((s) => s.pass));

    let run = await j('/api/runs', { procedureId: good.id, unattended: true, params: { week: 'W44' } });
    assert.equal(run.status, 'awaiting_approval'); // unattended still cannot send without a human
    run = await j(`/api/runs/${run.id}/approve`, { decision: 'approve' });
    assert.equal(run.status, 'done');

    const o = (await j('/api/outcomes')).find((x) => x.procedure === good.id);
    assert.deepEqual([o.completed, o.model_free_rate, o.target_met, o.trusted, o.minutes_saved], [1, 1, true, true, 5]);

    const exported = await j(`/api/procedures/${good.id}/export`);
    assert.equal((await j('/api/traces', exported)).duplicate, true); // no lock-in: it round-trips
  } finally { srv.close(); }
});
