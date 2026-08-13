import crypto from "node:crypto";
import type { ActionManifest, ActionOutcome, Receipt } from "@cieav/contracts";
import {publicKeyFromEncoded,receiptKeyId,type DeviceReceiptSigner} from "./device-signing.js";

export type ReceiptSigner=string|DeviceReceiptSigner;
function canonical(value: unknown): string { if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; if (value && typeof value === "object") { const obj = value as Record<string, unknown>; return `{${Object.keys(obj).sort().map(k => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(",")}}`; } return JSON.stringify(value); }
function unsignedV3(receipt:Receipt){const{signature:_s,...unsigned}=receipt;return unsigned}
function legacyUnsigned(receipt:Receipt){const{signature:_s,signatureAlgorithm:_a,...unsigned}=receipt;return unsigned}
function legacySignature(receipt:Receipt,secret:string){return crypto.createHmac("sha256",secret).update(canonical(legacyUnsigned(receipt))).digest("base64url")}

export function signReceipt(receipt:Receipt,signer:ReceiptSigner):Receipt{
  if(typeof signer==="string")return{...legacyUnsigned(receipt),signature:legacySignature(receipt,signer),signatureAlgorithm:"HMAC-SHA256"};
  const prepared:Receipt={...receipt,receiptVersion:"3",signatureAlgorithm:"Ed25519",signatureKeyId:signer.keyId,signingPublicKey:signer.publicKeyEncoded};
  const signature=crypto.sign(null,Buffer.from(canonical(unsignedV3(prepared))),signer.privateKey).toString("base64url");
  return{...prepared,signature};
}

export function verifyReceiptPublic(receipt:Receipt):boolean{
  if(receipt.signatureAlgorithm!=="Ed25519"||typeof receipt.signature!=="string"||!receipt.signingPublicKey||!receipt.signatureKeyId)return false;
  try{
    const key=publicKeyFromEncoded(receipt.signingPublicKey);
    if(receiptKeyId(key)!==receipt.signatureKeyId)return false;
    return crypto.verify(null,Buffer.from(canonical(unsignedV3(receipt))),key,Buffer.from(receipt.signature,"base64url"));
  }catch{return false}
}

export function verifyReceipt(receipt:Receipt,signer:ReceiptSigner):boolean{
  if(receipt.signatureAlgorithm==="Ed25519"){
    if(!verifyReceiptPublic(receipt))return false;
    if(typeof signer==="string")return false;
    return receipt.signatureKeyId===signer.keyId&&receipt.signingPublicKey===signer.publicKeyEncoded;
  }
  const secret=typeof signer==="string"?signer:signer.legacySecret;
  if(receipt.signatureAlgorithm!=="HMAC-SHA256"||typeof receipt.signature!=="string")return false;
  const expected=legacySignature(receipt,secret),actual=receipt.signature;if(actual.length!==expected.length)return false;
  try{return crypto.timingSafeEqual(Buffer.from(actual),Buffer.from(expected))}catch{return false}
}

export function createReceipt(deviceId:string,manifest:ActionManifest,source:Receipt["source"],status:"PREVIEWED"|"COMMITTED"|"CANCELLED",signer:ReceiptSigner):Receipt{
  const receipt:Receipt={id:crypto.randomUUID(),deviceId,createdAt:new Date().toISOString(),...(status==="COMMITTED"?{committedAt:new Date().toISOString()}:{}),status,manifest,source,receiptVersion:typeof signer==="string"?"2":"3"};
  return signReceipt(receipt,signer);
}
export function withOutcome(receipt:Receipt,outcome:ActionOutcome,signer:ReceiptSigner):Receipt{return signReceipt({...receipt,outcome,receiptVersion:typeof signer==="string"?"2":"3"},signer)}
