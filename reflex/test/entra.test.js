import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createSign } from 'node:crypto';
import { createApp } from '../src/app.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const ISS = 'https://login.microsoftonline.com/tenant-1/v2.0', AUD = 'api://reflex';
const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (claims, kid = 'k1') => {
  const head = `${b({ alg: 'RS256', kid })}.${b({ iss: ISS, aud: AUD, exp: Math.floor(Date.now() / 1000) + 600, preferred_username: 'eve@co.test', ...claims })}`;
  return `${head}.${createSign('RSA-SHA256').update(head).sign(privateKey).toString('base64url')}`;
};

test('Entra tokens are verified and groups map to what a user may see', async () => {
  const entra = { keys: { k1: publicKey }, aud: AUD, iss: ISS, groupMap: { 'g-eng': { roles: ['engineer'], clearance: 'internal' } } };
  const srv = createApp({ apiKey: 'admin-key-1', entra }).listen(0);
  const base = `http://127.0.0.1:${srv.address().port}`;
  const get = (h) => fetch(base + '/api/docs', { headers: h });
  try {
    for (const [k, lvl] of [['INT-1', 'internal'], ['PUB-1', 'public'], ['RES-1', 'restricted']])
      await fetch(base + '/api/docs', { method: 'POST', headers: { 'x-api-key': 'admin-key-1', 'content-type': 'application/json' }, body: JSON.stringify({ doc_key: k, body: 'text ' + k, level: lvl }) });
    const keys = async (h) => (await (await get(h)).json()).map((d) => d.doc_key).sort();
    assert.deepEqual(await keys({ authorization: 'Bearer ' + jwt({ groups: ['g-eng'] }) }), ['INT-1', 'PUB-1']);
    assert.deepEqual(await keys({ authorization: 'Bearer ' + jwt({ groups: ['unmapped'] }) }), ['PUB-1']); // fail closed
    const rejected = async (tok) => (await get({ authorization: 'Bearer ' + tok })).status;
    assert.equal(await rejected(jwt({ exp: 1 })), 401); // expired
    assert.equal(await rejected(jwt({ aud: 'api://other' })), 401); // wrong audience
    assert.equal(await rejected(jwt({}, 'unknown-kid')), 401); // unknown signing key
    assert.equal(await rejected(jwt({}).slice(0, -4) + 'AAAA'), 401); // tampered signature
  } finally { srv.close(); }
});
