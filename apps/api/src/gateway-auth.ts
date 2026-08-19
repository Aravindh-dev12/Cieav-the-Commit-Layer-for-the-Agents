import crypto from "node:crypto";

export function gatewayBearerDigest(token:string):string{
  if(typeof token!=="string"||token.length<1||token.length>4096)throw new Error("gateway_bearer_invalid");
  return crypto.createHash("sha256").update(token,"utf8").digest("hex");
}

export function verifyGatewayAuthorization(authorization:string|undefined,digest:string|undefined):boolean{
  if(!digest||!/^[0-9a-f]{64}$/.test(digest)||typeof authorization!=="string"||!authorization.startsWith("Bearer "))return false;
  const token=authorization.slice(7);if(!token||token.length>4096)return false;
  const actual=Buffer.from(gatewayBearerDigest(token),"hex"),expected=Buffer.from(digest,"hex");
  return actual.length===expected.length&&crypto.timingSafeEqual(actual,expected);
}
