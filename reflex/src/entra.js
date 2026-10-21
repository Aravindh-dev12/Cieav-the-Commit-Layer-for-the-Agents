import { createPublicKey, createVerify } from 'node:crypto';

const b64 = (s) => Buffer.from(s, 'base64url');
const RANK = ['public', 'internal', 'restricted'];

// Verifies an Entra ID (Azure AD) RS256 access token against the tenant's published signing keys.
export function verifyJwt(token, keys, { aud, iss }) {
  const [h, p, s] = token.split('.');
  if (!s) throw new Error('malformed token');
  const head = JSON.parse(b64(h)), key = keys[head.kid];
  if (head.alg !== 'RS256' || !key) throw new Error('unknown key or algorithm');
  if (!createVerify('RSA-SHA256').update(`${h}.${p}`).verify(key, b64(s))) throw new Error('bad signature');
  const c = JSON.parse(b64(p)), now = Date.now() / 1000;
  if (!(c.exp > now) || (c.nbf && c.nbf > now) || c.aud !== aud || c.iss !== iss) throw new Error('claims rejected');
  return c;
}

// Group membership -> roles and clearance. Unmapped users get no roles and public clearance (fail closed).
export function userFromClaims(c, groupMap = {}) {
  const hit = (c.groups || []).map((g) => groupMap[g]).filter(Boolean);
  return {
    name: c.preferred_username || c.oid || 'unknown',
    roles: [...new Set(hit.flatMap((x) => x.roles || (x.role ? [x.role] : [])))],
    clearance: hit.reduce((m, x) => (RANK.indexOf(x.clearance) > RANK.indexOf(m) ? x.clearance : m), 'public'),
  };
}

export async function loadKeys(url) {
  const { keys } = await (await fetch(url)).json();
  return Object.fromEntries(keys.map((k) => [k.kid, createPublicKey({ key: k, format: 'jwk' })]));
}
