import crypto from "node:crypto";
import {z} from "zod";
import {linuxTpm2PcrKey,TPM_ALG_SHA1,TPM_ALG_SHA256,TPM_ALG_SHA384,TPM_ALG_SHA512} from "./linux-tpm2-attestation.js";
import type {LinuxTpm2FirmwareLogBinding} from "./linux-tpm2-measured-boot.js";

const DigestSchema=z.string().regex(/^[0-9a-f]+$/);
const PcrRuleSchema=z.object({hashAlgorithm:z.union([z.literal(TPM_ALG_SHA1),z.literal(TPM_ALG_SHA256),z.literal(TPM_ALG_SHA384),z.literal(TPM_ALG_SHA512)]),pcrIndex:z.number().int().min(0).max(15),allowedDigests:z.array(DigestSchema).min(1).max(128)}).strict();
export const LinuxTpm2BootPolicySchema=z.object({id:z.string().regex(/^[A-Za-z0-9._-]{1,160}$/),version:z.literal(1),platform:z.literal("LINUX"),profile:z.enum(["UEFI_SECURE_BOOT_REFERENCE","CUSTOM_REFERENCE"]),validFrom:z.string().datetime(),validTo:z.string().datetime(),requireSecureBootPolicyPcr7:z.boolean().default(true),rules:z.array(PcrRuleSchema).min(1).max(64)}).strict().superRefine((value,ctx)=>{const seen=new Set<string>();for(const rule of value.rules){const key=`${rule.hashAlgorithm}:${rule.pcrIndex}`;if(seen.has(key))ctx.addIssue({code:z.ZodIssueCode.custom,message:`duplicate PCR rule ${key}`});seen.add(key)}if(value.requireSecureBootPolicyPcr7&&!value.rules.some(r=>r.pcrIndex===7))ctx.addIssue({code:z.ZodIssueCode.custom,message:"PCR 7 reference is required for Secure Boot policy"})});
export type LinuxTpm2BootPolicy=z.infer<typeof LinuxTpm2BootPolicySchema>;
export type LinuxTpm2BootPolicyResult={policyId:string;policyVersion:1;profile:LinuxTpm2BootPolicy["profile"];verification:"REFERENCE_PCR_POLICY_VERIFIED";secureBootPolicyPcr7Covered:boolean;matchedRules:number;policyDigest:string;verifiedAt:string};

const DIGEST_BYTES=new Map<number,number>([[TPM_ALG_SHA1,20],[TPM_ALG_SHA256,32],[TPM_ALG_SHA384,48],[TPM_ALG_SHA512,64]]);
function fail(code:string):never{throw new Error(`linux_tpm2_boot_policy_${code}`)}
function canonical(value:unknown):string{return Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value as Record<string,unknown>).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(",")}}`:JSON.stringify(value)??"undefined"}
function safeEqual(a:Buffer,b:Buffer){return a.length===b.length&&crypto.timingSafeEqual(a,b)}

export function verifyLinuxTpm2BootPolicy(binding:LinuxTpm2FirmwareLogBinding,rawPolicy:unknown,now=Date.now()):LinuxTpm2BootPolicyResult{
  const policy=LinuxTpm2BootPolicySchema.parse(rawPolicy),validFrom=Date.parse(policy.validFrom),validTo=Date.parse(policy.validTo);if(validFrom>now)fail("policy_not_yet_valid");if(validTo<=now)fail("policy_expired");if(validTo<=validFrom)fail("policy_time_range");
  const selected=new Set<string>();for(const selection of binding.quote.pcrSelections)for(const pcr of selection.selectedPcrs)selected.add(linuxTpm2PcrKey(selection.hashAlgorithm,pcr));
  for(const rule of policy.rules){const key=linuxTpm2PcrKey(rule.hashAlgorithm,rule.pcrIndex);if(!selected.has(key))fail("required_pcr_not_quoted");const actual=binding.replayedPcrs.get(key);if(!actual)fail("required_pcr_missing");const expectedBytes=DIGEST_BYTES.get(rule.hashAlgorithm);if(expectedBytes===undefined||actual.length!==expectedBytes)fail("required_pcr_size");let matched=false;for(const digest of rule.allowedDigests){if(digest.length!==expectedBytes*2)fail("policy_digest_size");let candidate:Buffer;try{candidate=Buffer.from(digest,"hex")}catch{fail("policy_digest_encoding")};if(safeEqual(actual,candidate)){matched=true;break}}if(!matched)fail("pcr_reference_mismatch")}
  const policyDigest=crypto.createHash("sha256").update(canonical(policy)).digest("hex");return{policyId:policy.id,policyVersion:1,profile:policy.profile,verification:"REFERENCE_PCR_POLICY_VERIFIED",secureBootPolicyPcr7Covered:policy.rules.some(r=>r.pcrIndex===7),matchedRules:policy.rules.length,policyDigest,verifiedAt:new Date(now).toISOString()};
}
