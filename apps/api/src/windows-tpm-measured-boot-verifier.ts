import crypto from "node:crypto";
import {TPM_ALG_SHA1,TPM_ALG_SHA256,TPM_ALG_SHA384,TPM_ALG_SHA512,parseWindowsPlatformClaim,parseWindowsWbcl,replaySrtmPcrs,serializePcrTable} from "./windows-tpm-measured-boot.js";

function fail(code:string):never{throw new Error(`windows_tpm_measured_boot_${code}`)}
function digestSizeForAlgorithm(algorithmId:number){switch(algorithmId){case TPM_ALG_SHA1:return 20;case TPM_ALG_SHA256:return 32;case TPM_ALG_SHA384:return 48;case TPM_ALG_SHA512:return 64;default:fail("pcr_binding_unsupported_algorithm")}}

export type VerifiedWindowsPcrReplayBinding={
  pcrAlgorithm:number;
  pcrMask:number;
  pcrTable:Buffer;
  pcrTableSha256:string;
  quote:Buffer;
  signature:Buffer;
  eventLogSha256:string;
};

export function verifyWindowsPlatformPcrReplay(platformClaim:Buffer,wbcl:Buffer,pcrMask:number):VerifiedWindowsPcrReplayBinding{
  const claim=parseWindowsPlatformClaim(platformClaim),parsedLog=parseWindowsWbcl(wbcl),digestSize=digestSizeForAlgorithm(claim.pcrAlg),replayed=replaySrtmPcrs(parsedLog,claim.pcrAlg,pcrMask),pcrTable=serializePcrTable(replayed,pcrMask,digestSize);
  if(claim.pcrs.length!==pcrTable.length||!crypto.timingSafeEqual(claim.pcrs,pcrTable))fail("platform_claim_pcr_replay_mismatch");
  return{pcrAlgorithm:claim.pcrAlg,pcrMask,pcrTable,pcrTableSha256:crypto.createHash("sha256").update(pcrTable).digest("hex"),quote:claim.quote,signature:claim.signature,eventLogSha256:crypto.createHash("sha256").update(wbcl).digest("hex")};
}
