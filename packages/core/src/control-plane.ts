import crypto from "node:crypto";
import {
  AuthorizationWitnessSchema,InterpositionPostureSchema,OperationMandateSchema,
  type AuthorizationWitness,type InterpositionMode,type InterpositionPosture,type InterpositionRoute,type OperationMandate
} from "@cieav/contracts/control-plane";
import type {ExecutionProposal,FormalAuthorizationDecision} from "@cieav/contracts/execution-fabric";
import {digest} from "./execution-fabric.js";

const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value as Record<string,unknown>).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(",")}}`:JSON.stringify(value)??"undefined";

export function evaluateInterpositionPosture(mode:InterpositionMode,routes:InterpositionRoute[]):InterpositionPosture{
  const active=routes.filter(r=>r.enabled),consequence=active.filter(r=>r.consequenceCapable),reasons:string[]=[];
  if(mode!=="OBSERVE"&&!consequence.length)reasons.push("No consequence-capable route is registered through CIEAV.");
  for(const route of consequence){
    if(!route.managedByCieav)reasons.push(`Consequence route ${route.id} is outside CIEAV mediation.`);
    if(route.directAccessDeclared)reasons.push(`Consequence route ${route.id} declares a direct bypass path.`);
    if(route.credentialExposure==="AGENT_VISIBLE")reasons.push(`Consequence route ${route.id} exposes credentials to the agent.`);
  }
  const ready=mode==="OBSERVE"?true:mode==="GOVERNED"?consequence.some(r=>r.managedByCieav)&&!consequence.some(r=>r.managedByCieav&&r.credentialExposure==="AGENT_VISIBLE"):reasons.length===0&&consequence.length>0;
  const evaluatedAt=new Date().toISOString(),unsigned={version:1 as const,mode,routes,ready,reasons:[...new Set(reasons)],evaluatedAt};
  return InterpositionPostureSchema.parse({...unsigned,digest:digest(unsigned)});
}

export function createAuthorizationWitness(decision:FormalAuthorizationDecision):AuthorizationWitness{
  const unsigned={version:1 as const,proposalId:"00000000-0000-0000-0000-000000000000",graphDigest:decision.graphDigest,decision:decision.decision,matchedEdgeIds:decision.matchedEdgeIds,evidenceRefs:decision.evidenceRefs,evaluatedAt:decision.evaluatedAt};
  return AuthorizationWitnessSchema.parse({...unsigned,witnessDigest:digest(unsigned)});
}

export function createAuthorizationWitnessForProposal(proposalId:string,decision:FormalAuthorizationDecision):AuthorizationWitness{
  const unsigned={version:1 as const,proposalId,graphDigest:decision.graphDigest,decision:decision.decision,matchedEdgeIds:decision.matchedEdgeIds,evidenceRefs:decision.evidenceRefs,evaluatedAt:decision.evaluatedAt};
  return AuthorizationWitnessSchema.parse({...unsigned,witnessDigest:digest(unsigned)});
}

export type MandateUnsigned=Omit<OperationMandate,"id"|"status"|"consumedAt"|"signatureAlgorithm"|"signature">;
export function mandateSignature(secret:string,unsigned:MandateUnsigned,id:string){
  return crypto.createHmac("sha256",secret).update(`cieav-operation-mandate-v1\n${id}\n${canonical(unsigned)}`).digest("base64url");
}
export function issueOperationMandate(secret:string,input:Omit<MandateUnsigned,"maxUses">):OperationMandate{
  if(secret.length<32)throw new Error("operation_mandate_secret_too_weak");
  if(Date.parse(input.expiresAt)<=Date.parse(input.issuedAt))throw new Error("operation_mandate_expiry_invalid");
  const id=crypto.randomUUID(),unsigned={...input,maxUses:1 as const},signature=mandateSignature(secret,unsigned,id);
  return OperationMandateSchema.parse({...unsigned,id,status:"ISSUED",signatureAlgorithm:"HMAC-SHA256",signature});
}
export function verifyOperationMandate(secret:string,mandate:OperationMandate){
  const {id,status,consumedAt,signatureAlgorithm,signature,...unsigned}=mandate;
  if(signatureAlgorithm!=="HMAC-SHA256"||secret.length<32)return false;
  const expected=mandateSignature(secret,unsigned,id);
  return signature.length===expected.length&&crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected))&&status!=="INVALIDATED";
}

export function operationRouteDigest(proposal:ExecutionProposal){
  return digest({toolId:proposal.toolId,protocol:proposal.protocol,operation:proposal.operation,target:proposal.target??null,normalizedArgumentsDigest:proposal.normalizedArgumentsDigest});
}
