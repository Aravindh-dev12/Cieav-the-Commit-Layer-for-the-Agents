import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createApp } from '../src/app.js';

const KEYS = { admin: 'admin-key-1', alice: 'alice-key-1', bob: 'bob-key-0001' };
const users = [
  { key: KEYS.alice, name: 'alice', roles: ['engineer'], clearance: 'internal' },
  { key: KEYS.bob, name: 'bob', roles: ['contractor'], clearance: 'public' },
];
const docs = [
  { doc_key: 'REQ-PWR-001', title: 'Power requirement', body: 'The lander power subsystem shall provide a regulated 28 V bus during lunar night. Battery depth of discharge shall not exceed 60 percent.' },
  { doc_key: 'GIT-WORKFLOW', title: 'Git workflow', body: 'Every merge request needs one approving review and a passing pipeline. The main branch is a protected branch.' },
  { doc_key: 'ITAR-GUID-7', title: 'Nozzle guidance', level: 'restricted', roles: ['export_cleared'], body: 'Propulsion nozzle thermal margin shall be at least 15 percent at peak burn.' },
  { doc_key: 'PUBLIC-FAQ', title: 'FAQ', level: 'public', body: 'We build hardware for the Moon.' },
];

test('versioned, permission-aware retrieval passes the regression set', async () => {
  const srv = createApp({ apiKey: KEYS.admin, users }).listen(0);
  const b = `http://127.0.0.1:${srv.address().port}`;
  const call = (who, path, body) => fetch(b + path, { headers: { 'x-api-key': KEYS[who], 'content-type': 'application/json' }, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) });
  try {
    for (const d of docs) assert.equal((await call('admin', '/api/docs', d)).status, 201);
    assert.equal((await call('alice', '/api/docs', docs[0])).status, 403); // only editors ingest
    assert.equal((await (await call('admin', '/api/docs', docs[0])).json()).unchanged, true); // idempotent
    const v2 = await (await call('admin', '/api/docs', { ...docs[0], body: docs[0].body.replace('60', '50') })).json();
    assert.equal(v2.version, 2); // the changed requirement supersedes v1

    const cases = JSON.parse(readFileSync('eval/cases.json', 'utf8'));
    let hits = 0, refusals = 0, wantHit = 0, wantRefuse = 0;
    for (const c of cases) {
      const r = await (await call(c.as, '/api/ask', { question: c.q })).json();
      if (c.expect) {
        wantHit++;
        if (r.citations[0]?.doc_key === c.expect && (!c.contains || r.answer.includes(c.contains)) && (!c.absent || !r.answer.includes(c.absent))) hits++;
      } else { wantRefuse++; if (r.refused && !r.citations.length) refusals++; }
    }
    assert.equal(hits, wantHit, 'retrieval accuracy'); // also proves the latest version wins
    assert.equal(refusals, wantRefuse, 'every unanswerable or forbidden question is refused');

    const visible = (await (await call('alice', '/api/docs')).json()).map((d) => d.doc_key);
    assert.ok(!visible.includes('ITAR-GUID-7')); // restricted doc is invisible, not just unanswerable
    assert.equal((await (await call('admin', '/api/activity/verify')).json()).ok, true);
  } finally { srv.close(); }
});
