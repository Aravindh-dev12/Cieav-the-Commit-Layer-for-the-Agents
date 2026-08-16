import crypto from "node:crypto";
import type {CommitCapability,Commitment,CommitmentEvidence,EffectObservation,EffectProposal,EffectReceipt,EffectSettlement,SignedCommitCapability,ToolDescriptor} from "@cieav/contracts";
import {settleCommitment} from "./commitment.js";

const canonical=(x:unknown):string=>Array.isArray(x)?`[${x.map(canonical).join(",")}]`:x&&typeof x==="object"?`{${Object.keys(x as Record<string,unknown>).sort().map(k=>`${JSON.stringify(k)}:${canonical((x as Record<string,unknown>)[k])}`).join(",")}}`:JSON.stringify(x);
export const sha256Digest=(value:unknown)=>crypto.createHash("sha256").update(canonical(value)).digest("hex");
export const effectInputDigest=(input:unknown)=>sha256Digest(input);
export const effectProposalDigest=(proposal:EffectProposal)=>sha256Digest(proposal);
export const consequenceGraphDigest=(commitment:Pick<Commitment,"consequenceGraph">)=>sha256Digest(commitment.consequenceGraph);
export const proofObligationDigest=(commitment:Pick<Commitment,"proofObligation">)=>sha256Digest(commitment.proofObligation);
export const commitCapabilitySigningPayload=(capability:CommitCapability)=>Buffer.from(canonical(capability),"utf8");
export const authorityKeyId=(publicKeyPem:string)=>crypto.createHash("sha256").update(publicKeyPem.trim()).digest("hex").slice(0,32);

export function verifySignedCommitCapability(signed:SignedCommitCapability,pinnedPublicKeyPem:string,pinnedKeyId=authorityKeyId(pinnedPublicKeyPem)):boolean{
  if(signed.signatureAlgorithm!=="ed25519"||signed.authorityKeyId!==pinnedKeyId)return false;
  try{return crypto.verify(null,commitCapabilitySigningPayload(signed.capability),crypto.createPublicKey(pinnedPublicKeyPem),Buffer.from(signed.signature,"base64url"))}catch{return false}
}

export function buildEffectProposal(input:Omit<EffectProposal,"inputDigest">):EffectProposal{return{...input,inputDigest:effectInputDigest(input.input)}}

export function assertEffectToolBinding(proposal:EffectProposal,tool:ToolDescriptor,catalogDigest:string):void{
  if(!tool.available)throw new Error("effect tool is unavailable");
  if(proposal.toolId!==tool.id||proposal.provider!==tool.provider||proposal.sourceId!==tool.sourceId||proposal.sourceOperation!==tool.sourceOperation)throw new Error("effect proposal is not bound to selected tool descriptor");
  if(proposal.catalogDigest!==catalogDigest)throw new Error("effect proposal catalog digest mismatch");
  if(proposal.inputDigest!==effectInputDigest(proposal.input))throw new Error("effect proposal input digest mismatch");
  if(tool.externalEffect&&!tool.requiresCommitment)throw new Error("external-effect tool descriptor must require commitment");
}

export function assertCommitCapabilityBinding(capability:CommitCapability,proposal:EffectProposal,commitment:Commitment,now=new Date()):void{
  if(commitment.state!=="AUTHORIZED"&&commitment.state!=="RECOVERING")throw new Error("commitment is not authorized for dispatch");
  if(capability.commitmentId!==commitment.id||proposal.commitmentId!==commitment.id)throw new Error("commitment binding mismatch");
  if(capability.proposalDigest!==effectProposalDigest(proposal))throw new Error("commit capability proposal digest mismatch");
  if(capability.consequenceGraphDigest!==proposal.consequenceGraphDigest||proposal.consequenceGraphDigest!==consequenceGraphDigest(commitment))throw new Error("consequence graph digest mismatch");
  if(capability.proofObligationDigest!==proposal.proofObligationDigest||proposal.proofObligationDigest!==proofObligationDigest(commitment))throw new Error("proof obligation digest mismatch");
  if(capability.allowedActionType!==proposal.actionType)throw new Error("commit capability action type mismatch");
  if(capability.allowedTarget!==proposal.target)throw new Error("commit capability target mismatch");
  if(Date.parse(capability.expiresAt)<=now.getTime())throw new Error("commit capability expired");
  if(Date.parse(capability.issuedAt)>now.getTime()+30_000)throw new Error("commit capability issued in the future");
  if(!capability.singleUse)throw new Error("effect dispatch requires single-use capability");
}

export function observationToCommitmentEvidence(observation:EffectObservation):CommitmentEvidence{return{requirementId:observation.requirementId,kind:observation.kind,signal:observation.signal,summary:observation.summary,source:observation.source,confidence:observation.confidence,observedAt:observation.observedAt,actorIndependent:observation.actorIndependent,...(observation.digest?{digest:observation.digest}:{})}}

export function settleEffect(commitment:Commitment,receipt:EffectReceipt,observations:readonly EffectObservation[],settledAt=new Date().toISOString()):EffectSettlement{
  if(receipt.commitmentId!==commitment.id)throw new Error("effect receipt commitment mismatch");
  const evidence=observations.filter(o=>o.commitmentId===commitment.id&&o.requestId===receipt.requestId).map(observationToCommitmentEvidence),settlement=settleCommitment(commitment,evidence,settledAt);
  if(receipt.status==="FAILED"&&settlement.status==="PROVEN")throw new Error("failed effect receipt cannot settle as proven");
  const status=receipt.status==="FAILED"?"DISPROVEN":receipt.status==="UNKNOWN"||receipt.status==="RESERVED"?"UNKNOWN":settlement.status;
  return{requestId:receipt.requestId,commitmentId:commitment.id,status,settledAt,effectReceiptId:receipt.id,evidence,reason:status===settlement.status?settlement.reason:status==="DISPROVEN"?"Effect execution reported failure before desired reality was proven.":"Effect execution remains unsettled or incomplete."};
}
