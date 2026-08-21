import crypto from "node:crypto";
import {describe,expect,it} from "vitest";
import {LinuxTpm2BootPolicySchema,verifyLinuxTpm2BootPolicy} from "./linux-tpm2-boot-policy.js";
import {linuxTpm2PcrKey,TPM_ALG_SHA256,TPM_GENERATED_VALUE,TPM_ST_ATTEST_QUOTE} from "./linux-tpm2-attestation.js";
import type {LinuxTpm2FirmwareLogBinding} from "./linux-tpm2-measured-boot.js";

const NOW=Date.parse("2026-08-21T08:30:00Z");
function binding(pcr7=crypto.randomBytes(32),selected=[7]):LinuxTpm2FirmwareLogBinding{return{quote:{format:"TPMS_ATTEST",signedData:Buffer.alloc(1),magic:TPM_GENERATED_VALUE,qualifiedSigner:Buffer.alloc(0),extraData:Buffer.alloc(32),clock:1n,resetCount:0,restartCount:0,safe:true,firmwareVersion:1n,type:"QUOTE",attestType:TPM_ST_ATTEST_QUOTE,pcrSelections:[{hashAlgorithm:TPM_ALG_SHA256,select:Buffer.from([0x80,0,0]),selectedPcrs:selected}],pcrDigest:Buffer.alloc(32)},eventCount:10,platformClass:0,specVersion:{major:2,minor:0,errata:0,uintnSize:2},replayedPcrs:new Map([[linuxTpm2PcrKey(TPM_ALG_SHA256,7),pcr7]])}}
function policy(digest:string){return{id:"ubuntu-24.04-reference-1",version:1 as const,platform:"LINUX" as const,profile:"UEFI_SECURE_BOOT_REFERENCE" as const,validFrom:"2026-08-20T00:00:00.000Z",validTo:"2026-09-20T00:00:00.000Z",requireSecureBootPolicyPcr7:true,rules:[{hashAlgorithm:TPM_ALG_SHA256,pcrIndex:7,allowedDigests:[digest]}]}}

describe("Linux TPM2 boot reference policy",()=>{
  it("accepts a quoted/replayed PCR only when it matches an active reference policy",()=>{const pcr=crypto.randomBytes(32),result=verifyLinuxTpm2BootPolicy(binding(pcr),policy(pcr.toString("hex")),NOW);expect(result.verification).toBe("REFERENCE_PCR_POLICY_VERIFIED");expect(result.secureBootPolicyPcr7Covered).toBe(true);expect(result.matchedRules).toBe(1);expect(result.policyDigest).toMatch(/^[0-9a-f]{64}$/)});
  it("fails closed when a quoted PCR differs from all approved reference values",()=>{const pcr=crypto.randomBytes(32);expect(()=>verifyLinuxTpm2BootPolicy(binding(pcr),policy(crypto.randomBytes(32).toString("hex")),NOW)).toThrow("pcr_reference_mismatch")});
  it("requires policy PCRs to be part of the signed quote selection",()=>{const pcr=crypto.randomBytes(32);expect(()=>verifyLinuxTpm2BootPolicy(binding(pcr,[0]),policy(pcr.toString("hex")),NOW)).toThrow("required_pcr_not_quoted")});
  it("requires PCR 7 coverage when Secure Boot policy coverage is requested",()=>{expect(()=>LinuxTpm2BootPolicySchema.parse({...policy(Buffer.alloc(32).toString("hex")),rules:[{hashAlgorithm:TPM_ALG_SHA256,pcrIndex:4,allowedDigests:[Buffer.alloc(32).toString("hex")]}]})).toThrow("PCR 7 reference is required")});
  it("rejects expired policy and malformed digest sizes",()=>{const pcr=crypto.randomBytes(32);expect(()=>verifyLinuxTpm2BootPolicy(binding(pcr),{...policy(pcr.toString("hex")),validTo:"2026-08-21T08:00:00.000Z"},NOW)).toThrow("policy_expired");expect(()=>verifyLinuxTpm2BootPolicy(binding(pcr),policy("00"),NOW)).toThrow("policy_digest_size")});
});
