import crypto from "node:crypto";
import {describe,expect,it} from "vitest";
import {EV_NO_ACTION,NCRYPT_PLATFORM_ATTEST_MAGIC,TPM_ALG_SHA256} from "./windows-tpm-measured-boot.js";
import {verifyWindowsPlatformPcrReplay} from "./windows-tpm-measured-boot-verifier.js";

function descriptor(){const body=Buffer.alloc(33);Buffer.from("Spec ID Event03\0","ascii").copy(body,0);body.writeUInt32LE(0,16);body[20]=0;body[21]=2;body[22]=0;body[23]=2;body.writeUInt32LE(1,24);body.writeUInt16LE(TPM_ALG_SHA256,28);body.writeUInt16LE(32,30);body[32]=0;const event=Buffer.alloc(32+body.length);event.writeUInt32LE(0,0);event.writeUInt32LE(EV_NO_ACTION,4);event.fill(0,8,28);event.writeUInt32LE(body.length,28);body.copy(event,32);return event}
function event2(pcr:number,digest:Buffer){const data=Buffer.from("boot-event"),b=Buffer.alloc(12+2+digest.length+4+data.length);let o=0;b.writeUInt32LE(pcr,o);o+=4;b.writeUInt32LE(0x80000001,o);o+=4;b.writeUInt32LE(1,o);o+=4;b.writeUInt16LE(TPM_ALG_SHA256,o);o+=2;digest.copy(b,o);o+=digest.length;b.writeUInt32LE(data.length,o);o+=4;data.copy(b,o);return b}
function claim(pcrs:Buffer){const signature=Buffer.from([1,2]),quote=Buffer.from([3,4,5]),b=Buffer.alloc(24+signature.length+quote.length+pcrs.length);b.writeUInt32LE(NCRYPT_PLATFORM_ATTEST_MAGIC,0);b.writeUInt32LE(0,4);b.writeUInt32LE(TPM_ALG_SHA256,8);b.writeUInt32LE(signature.length,12);b.writeUInt32LE(quote.length,16);b.writeUInt32LE(pcrs.length,20);let o=24;signature.copy(b,o);o+=signature.length;quote.copy(b,o);o+=quote.length;pcrs.copy(b,o);return b}

describe("Windows measured-boot PCR binding",()=>{
  it("binds the platform claim PCR table to deterministic WBCL replay",()=>{const digest=crypto.randomBytes(32),wbcl=Buffer.concat([descriptor(),event2(7,digest)]),expected=crypto.createHash("sha256").update(Buffer.alloc(32)).update(digest).digest(),result=verifyWindowsPlatformPcrReplay(claim(expected),wbcl,1<<7);expect(result.pcrAlgorithm).toBe(TPM_ALG_SHA256);expect(result.pcrTable).toEqual(expected);expect(result.pcrTableSha256).toBe(crypto.createHash("sha256").update(expected).digest("hex"));expect(result.eventLogSha256).toBe(crypto.createHash("sha256").update(wbcl).digest("hex"))});
  it("fails closed when the claim PCR table differs from replay",()=>{const digest=crypto.randomBytes(32),wbcl=Buffer.concat([descriptor(),event2(7,digest)]),wrong=Buffer.alloc(32,0x5a);expect(()=>verifyWindowsPlatformPcrReplay(claim(wrong),wbcl,1<<7)).toThrow("windows_tpm_measured_boot_platform_claim_pcr_replay_mismatch")});
});
