import crypto from "node:crypto";
import {ApprovalActivationCapabilitySchema,ApprovalActivationPayloadSchema,type ApprovalActivationCapability,type ApprovalActivationDecision,type ApprovalChallenge} from "@cieav/contracts/approval";
import {ActionProposalSchema,type ActionProposal} from "@cieav/contracts/reality";

const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value as Record<string,unknown>).sort().map(key=>`${JSON.stringify(key)}:${canonical((value as Record<string,unknown>)[key])}`).join(",")}}`:JSON.stringify(value);
const safeEqual=(a:string,b:string)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&crypto.timingSafeEqual(x,y)};

export function approvalProposalDigest(raw:ActionProposal){const proposal=ActionProposalSchema.parse(raw);return crypto.createHash("sha256").update(canonical(proposal)).digest("hex")}

function activationNonce(secret:string,deviceId:string,challengeId:string,proposalDigest:string){return crypto.createHmac("sha256",secret).update(`cieav-native-approval-nonce-v1\0${deviceId}\0${challengeId}\0${proposalDigest}`).digest("hex")}
function activationMac(secret:string,payload:unknown){return crypto.createHmac("sha256",secret).update("cieav-native-approval-activation-v1\0").update(canonical(payload)).digest("base64url")}

export function createApprovalActivationCapability(input:{secret:string;deviceId:string;challenge:ApprovalChallenge;proposal:ActionProposal;decision:ApprovalActivationDecision}):ApprovalActivationCapability{
  if(input.secret.length<32)throw new Error("native_approval_secret_too_weak");
  const proposal=ActionProposalSchema.parse(input.proposal),digest=approvalProposalDigest(proposal);
  if(input.challenge.proposalId!==proposal.id||input.challenge.intentId!==proposal.intentId||input.challenge.risk!==proposal.risk)throw new Error("native_approval_challenge_binding_mismatch");
  const payload=ApprovalActivationPayloadSchema.parse({version:"CIEAV_NATIVE_APPROVAL_ACTIVATION_V1",challengeId:input.challenge.id,deviceId:input.deviceId,requestId:proposal.requestId,proposalId:proposal.id,proposalDigest:digest,principalId:proposal.actor.id,resource:proposal.effect.target||proposal.actionType,risk:proposal.risk,decision:input.decision,expiresAt:input.challenge.expiresAt,nonce:activationNonce(input.secret,input.deviceId,input.challenge.id,digest),authority:false,executionAuthorityIssued:false});
  return ApprovalActivationCapabilitySchema.parse({payload,mac:activationMac(input.secret,payload)});
}

export function verifyApprovalActivationCapability(input:{secret:string;capability:unknown;deviceId:string;challenge:ApprovalChallenge;proposal:ActionProposal;now?:string}){
  if(input.secret.length<32)throw new Error("native_approval_secret_too_weak");
  const capability=ApprovalActivationCapabilitySchema.parse(input.capability),proposal=ActionProposalSchema.parse(input.proposal),expected=createApprovalActivationCapability({secret:input.secret,deviceId:input.deviceId,challenge:input.challenge,proposal,decision:capability.payload.decision});
  if(!safeEqual(capability.mac,expected.mac))throw new Error("native_approval_activation_mac_invalid");
  const a=capability.payload,b=expected.payload;
  for(const key of ["challengeId","deviceId","requestId","proposalId","proposalDigest","principalId","resource","risk","decision","expiresAt","nonce"] as const)if(a[key]!==b[key])throw new Error(`native_approval_activation_binding_mismatch:${key}`);
  const now=Date.parse(input.now??new Date().toISOString());if(!Number.isFinite(now)||Date.parse(a.expiresAt)<=now)throw new Error("native_approval_activation_expired");
  if(a.authority!==false||a.executionAuthorityIssued!==false)throw new Error("native_approval_activation_claimed_authority");
  return capability;
}
