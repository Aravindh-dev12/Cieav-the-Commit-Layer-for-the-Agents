import crypto from "node:crypto";
import {ProofObservationRequestSchema,type ProofObservationRequest,type ProofProviderResult} from "@cieav/contracts";
import type {ProofEvidenceKind} from "@cieav/contracts/reality";
import type {CieavProofApi} from "./proof-api.js";
import type {CieavLocalProofProviderRuntime} from "./proof-provider-runtime.js";

const QUALIFIED_SETTLEMENT_PROVIDERS:Readonly<Record<string,ProofEvidenceKind>>=Object.freeze({
  "cieav.http-proof.v1":"API_READBACK",
  "cieav.filesystem-proof.v1":"FILESYSTEM",
  "cieav.git-proof.v1":"TOOL_RESULT"
});

const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value as Record<string,unknown>).sort().map(key=>`${JSON.stringify(key)}:${canonical((value as Record<string,unknown>)[key])}`).join(",")}}`:JSON.stringify(value)??"undefined";
const sha256=(value:unknown)=>crypto.createHash("sha256").update(canonical(value)).digest("hex");

export type TrustedProofProviderAttachRequest=Omit<ProofObservationRequest,"correlationRefs"|"authority">;

function settlementSignal(result:ProofProviderResult){
  if(!result.conclusive)return"NEUTRAL" as const;
  if(result.proposedOutcome==="SUCCESS")return"SUPPORTS" as const;
  if(result.proposedOutcome==="FAILURE")return"CONTRADICTS" as const;
  return"NEUTRAL" as const;
}

function resultConfidence(result:ProofProviderResult){
  if(!result.observations.length)return 0;
  return Math.max(0,Math.min(1,Math.min(...result.observations.map(observation=>observation.confidence))));
}

/**
 * Converts qualified local provider observations into ProofCase evidence.
 * Provenance is chosen by CIEAV, never by the caller. Generic/unqualified
 * provider registrations are intentionally not trusted by this bridge.
 */
export class CieavTrustedProofProviderBridge{
  constructor(private readonly runtime:CieavLocalProofProviderRuntime,private readonly proofApi:CieavProofApi){}

  async observeAndAttach(deviceId:string,proofCaseId:string,raw:TrustedProofProviderAttachRequest){
    const proofCase=await this.proofApi.store.get(deviceId,proofCaseId);
    if(!proofCase)throw new Error("trusted_proof_case_not_found");

    const request=ProofObservationRequestSchema.parse({
      ...raw,
      correlationRefs:[`proof-case:${proofCase.id}`,`intent:${proofCase.intentId}`],
      authority:false
    });
    if(request.phase==="PRE_STATE")throw new Error("trusted_settlement_proof_requires_post_state_or_reconciliation");

    const standardizedKind=QUALIFIED_SETTLEMENT_PROVIDERS[request.providerId];
    if(!standardizedKind)throw new Error("proof_provider_not_qualified_for_trusted_settlement");

    const result=await this.runtime.observe(request);
    if(result.provider.id!==request.providerId)throw new Error("trusted_proof_provider_identity_mismatch");
    if(result.provider.authority!==false||result.authority!==false||result.mayMintExecutionAuthority!==false)throw new Error("trusted_proof_provider_authority_invariant_violation");
    if(!result.provider.canSettleOutcome)throw new Error("proof_provider_not_settlement_capable");
    if(result.conclusive&&!result.observations.length)throw new Error("conclusive_proof_provider_requires_observation");

    const signal=settlementSignal(result),confidence=resultConfidence(result);
    const detail=result.observations.map(observation=>`${observation.kind}:${observation.summary}`).join("; ");
    const summary=(result.error
      ?`Qualified provider ${result.provider.id} could not conclude settlement: ${result.error}`
      :`Qualified provider ${result.provider.id} returned ${result.conclusive?result.proposedOutcome??"UNKNOWN":"non-conclusive"}${detail?`; ${detail}`:""}`
    ).slice(0,1000);
    const evidenceDigest=sha256({request,result});

    return this.proofApi.observe(deviceId,proofCaseId,{
      kind:standardizedKind,
      signal,
      summary,
      source:`qualified-proof-provider:${result.provider.id}`,
      digest:evidenceDigest,
      confidence
    },"TRUSTED_ADAPTER");
  }
}

export const TRUSTED_PROOF_PROVIDER_BRIDGE_AUTHORITY=false as const;
export const TRUSTED_PROOF_PROVIDER_BRIDGE_MAY_MINT_EXECUTION_AUTHORITY=false as const;
