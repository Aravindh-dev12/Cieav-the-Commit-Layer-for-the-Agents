import crypto from "node:crypto";
import {describe,expect,it} from "vitest";
import {TPM_ALG_RSASSA,TPM_ALG_SHA256,TPM_GENERATED_VALUE,TPM_ST_ATTEST_QUOTE} from "./linux-tpm2-attestation.js";
import {verifyLinuxTpm2FirmwareLogQuote} from "./linux-tpm2-measured-boot.js";

const u16be=n=>{const b=Buffer.alloc(2);b.writeUInt16BE(n);return b},u32be=n=>{const b=Buffer.alloc(4);b.writeUInt32BE(n);return b},u64be=n=>{const b=Buffer.alloc(8);b.writeBigUInt64BE(BigInt(n));return b},sized=b=>Buffer.concat([u16be(b.length),b]);
const u16le=n=>{const b=Buffer.alloc(2);b.writeUInt16LE(n);return b},u32le=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b};
function descriptor(){const body=Buffer.concat([Buffer.from("Spec ID Event03\0","ascii"),u32le(0),Buffer.from([0,2,0,2]),u32le(1),u16le(TPM_ALG_SHA256),u16le(32),Buffer.from([0])]);return Buffer.concat([u32le(0),u32le(3),Buffer.alloc(20),u32le(body.length),body])}
function event(pcr,digest){const data=Buffer.from(`pcr-${pcr}`);return Buffer.concat([u32le(pcr),u32le(0x80000001),u32le(1),u16le(TPM_ALG_SHA256),digest,u32le(data.length),data])}
function pcrValue(digest){return crypto.createHash("sha256").update(Buffer.alloc(32)).update(digest).digest()}
function quote(nonce,pcrDigest){const select=Buffer.from([0x81,0,0]);return Buffer.concat([u32be(TPM_GENERATED_VALUE),u16be(TPM_ST_ATTEST_QUOTE),sized(Buffer.alloc(0)),sized(nonce),u64be(1),u32be(0),u32be(0),Buffer.from([1]),u64be(1),u32be(1),u16be(TPM_ALG_SHA256),Buffer.from([select.length]),select,sized(pcrDigest)])}
function tpmSignature(sig){return Buffer.concat([u16be(TPM_ALG_RSASSA),u16be(TPM_ALG_SHA256),sized(sig)])}

describe("Linux TPM2 firmware event-log binding",()=>{
  it("authenticates the quote and requires TCG event-log replay to reproduce quoted PCR state",()=>{const nonce=crypto.randomBytes(32),d0=crypto.randomBytes(32),d7=crypto.randomBytes(32),log=Buffer.concat([descriptor(),event(0,d0),event(7,d7)]),quotedPcrDigest=crypto.createHash("sha256").update(Buffer.concat([pcrValue(d0),pcrValue(d7)])).digest(),rawQuote=quote(nonce,quotedPcrDigest),{publicKey,privateKey}=crypto.generateKeyPairSync("rsa",{modulusLength:2048}),signature=tpmSignature(crypto.sign("sha256",rawQuote,{key:privateKey,padding:crypto.constants.RSA_PKCS1_PADDING})),result=verifyLinuxTpm2FirmwareLogQuote({rawQuote,rawSignature:signature,expectedNonce:nonce,akPublicJwk:publicKey.export({format:"jwk"}),eventLog:log});expect(result.eventCount).toBe(2);expect(result.quote.pcrSelections[0]?.selectedPcrs).toEqual([0,7]);expect(result.replayedPcrs.size).toBe(2)});
  it("rejects a firmware log whose replay no longer matches the signed quote",()=>{const nonce=crypto.randomBytes(32),d0=crypto.randomBytes(32),d7=crypto.randomBytes(32),quoted=crypto.createHash("sha256").update(Buffer.concat([pcrValue(d0),pcrValue(d7)])).digest(),rawQuote=quote(nonce,quoted),{publicKey,privateKey}=crypto.generateKeyPairSync("rsa",{modulusLength:2048}),signature=tpmSignature(crypto.sign("sha256",rawQuote,{key:privateKey,padding:crypto.constants.RSA_PKCS1_PADDING})),tampered=Buffer.concat([descriptor(),event(0,crypto.randomBytes(32)),event(7,d7)]);expect(()=>verifyLinuxTpm2FirmwareLogQuote({rawQuote,rawSignature:signature,expectedNonce:nonce,akPublicJwk:publicKey.export({format:"jwk"}),eventLog:tampered})).toThrow("quote_pcr_digest_mismatch")});
});
