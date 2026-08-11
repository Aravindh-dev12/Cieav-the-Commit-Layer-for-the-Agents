import crypto from "node:crypto";

const encoder = new TextEncoder();
function b64url(input: Buffer | string): string { return Buffer.from(input).toString("base64url"); }
function signPart(part: string, secret: string): string { return crypto.createHmac("sha256", secret).update(part).digest("base64url"); }
export interface TokenPayload { sub: string; installId: string; exp: number; iat: number }
export function issueToken(payload: Omit<TokenPayload, "iat" | "exp">, secret: string, ttlSeconds = 60 * 60 * 24 * 365): {token: string; expiresAt: string} {
  const now = Math.floor(Date.now() / 1000); const full: TokenPayload = {...payload, iat: now, exp: now + ttlSeconds};
  const header = b64url(JSON.stringify({alg: "HS256", typ: "JWT"})); const body = b64url(JSON.stringify(full)); const signing = `${header}.${body}`; const sig = signPart(signing, secret);
  return {token: `${signing}.${sig}`, expiresAt: new Date(full.exp * 1000).toISOString()};
}
export function verifyToken(token: string, secret: string): TokenPayload | null {
  const parts = token.split("."); if (parts.length !== 3) return null; const [header, body, sig] = parts; if (!header || !body || !sig) return null;
  const expected = signPart(`${header}.${body}`, secret); const a = encoder.encode(sig); const b = encoder.encode(expected);
  if (a.byteLength !== b.byteLength || !crypto.timingSafeEqual(a, b)) return null;
  try { const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenPayload; if (!payload.sub || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null; return payload; } catch { return null; }
}
export function deviceIdFor(installId: string, secret: string): string { return `dev_${crypto.createHmac("sha256", secret).update(installId).digest("hex").slice(0, 24)}`; }
