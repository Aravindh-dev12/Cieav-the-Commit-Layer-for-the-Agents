import crypto from "node:crypto";
import type {ActionManifest, RiskLevel} from "@cieav/contracts";
import type {ActionProposal, AuthorityDecision, CieavPrincipal, CommitPermit, ConsequenceAssessment, EffectClass, IntentConstraints, IntentContract, Money, ProofEvidenceKind} from "@cieav/contracts/reality";

const riskRank:Record<RiskLevel,number>={LOW:0,MEDIUM:1,HIGH:2,CRITICAL:3};
const now=()=>new Date().toISOString();
function includesTarget(values:string[],target?:string){if(!target)return false;const t=target.toLowerCase();return values.some(v=>t===v.toLowerCase()||t.endsWith(`.${v.toLowerCase()}`)||t.includes(v.toLowerCase()))}
function hasDisallowedData(constraints:IntentConstraints,categories:string[]){const allowed=new Set<string>(constraints.allowedDataCategories);return categories.some(c=>c!=="NONE"&&!allowed.has(c))}

export function actionManifestEffect(manifest:ActionManifest,amount?:Money){
  const t=manifest.actionType;let cls:EffectClass="OTHER";
  if(t.startsWith("financial."))cls="FINANCIAL";
  else if(t.includes("publish"))cls="PUBLISH";
  else if(t.includes("upload"))cls="DATA_TRANSFER";
  else if(t.includes("delete"))cls="DELETE";
  else if(t.includes("access")||t.includes("permission")||t.includes("grant"))cls="ACCESS";
  else if(t.includes("submit")||t.includes("send")||t.includes("message"))cls="COMMUNICATE";
  else if(t.includes("navigation")||t.includes("read"))cls="READ";
  else if(t.includes("execute")||t.includes("deploy")||t.includes("merge"))cls="EXECUTE";
  else cls="MUTATE";
  return {class:cls,operation:t,...(manifest.target?{target:manifest.target}:{}),...(amount?{amount}:{}),recipients:manifest.recipients,dataCategories:manifest.dataCategories,reversibility:manifest.reversibility,metadata:{summary:manifest.summary}};
}

export function createIntentContract(input:{owner:CieavPrincipal;goal:string;constraints:IntentConstraints;completionCriteria:string[];expiresAt?:string;contextLabels?:Record<string,string>}):IntentContract{
  return {id:crypto.randomUUID(),owner:input.owner,goal:input.goal,createdAt:now(),...(input.expiresAt?{expiresAt:input.expiresAt}:{}),status:"ACTIVE",constraints:input.constraints,completionCriteria:input.completionCriteria,contextLabels:input.contextLabels??{}};
}

export function proposalFromManifest(intentId:string,actor:CieavPrincipal,manifest:ActionManifest,delegationChain:CieavPrincipal[]=[],amount?:Money):ActionProposal{
  return {id:crypto.randomUUID(),intentId,requestId:manifest.requestId,actor,delegationChain,actionType:manifest.actionType,summary:manifest.summary,risk:manifest.risk,effect:actionManifestEffect(manifest,amount),requestedAt:now()};
}

export function assessConsequences(proposal:ActionProposal):ConsequenceAssessment{
  const direct=[proposal.summary,...(proposal.effect.target?[`Target: ${proposal.effect.target}`]:[]),...(proposal.effect.amount?[`Financial exposure: ${proposal.effect.amount.currency} ${proposal.effect.amount.value}`]:[])];
  const second:string[]=[],warnings:string[]=[],plan:ProofEvidenceKind[]=[];
  if(proposal.effect.class==="FINANCIAL"){second.push("Funds, authorization holds, refunds, fees, or duplicate charges may persist beyond the immediate tool call.");plan.push("PAYMENT","API_READBACK","EXTERNAL_RECEIPT")}
  if(proposal.effect.class==="COMMUNICATE"||proposal.effect.class==="PUBLISH"){second.push("Recipients may copy, forward, cache, or act on disclosed information.");plan.push("EMAIL","API_READBACK","DOM_STATE")}
  if(proposal.effect.class==="ACCESS"||proposal.effect.class==="IDENTITY"){second.push("Downstream systems may retain cached access or copied data after revocation.");plan.push("API_READBACK","DATABASE","TELEMETRY")}
  if(proposal.effect.class==="DELETE"){second.push("Dependent references, workflows, links, and historical context may break or become unrecoverable.");plan.push("API_READBACK","FILESYSTEM","DATABASE")}
  if(proposal.effect.class==="EXECUTE"){second.push("Execution may trigger dependent automation or production changes outside the initiating system.");plan.push("TELEMETRY","API_READBACK","TOOL_RESULT")}
  if(proposal.effect.reversibility==="IRREVERSIBLE"||proposal.effect.reversibility==="UNKNOWN")warnings.push("Recovery is unavailable or not yet verified.");
  return {directEffects:direct.slice(0,30),secondOrderEffects:second,blastRadius:proposal.risk,confidence:.72,verificationRequired:proposal.risk!=="LOW"||proposal.effect.reversibility!=="REVERSIBLE",verificationPlan:[...new Set(plan)].slice(0,20),warnings};
}

export function evaluateAuthority(intent:IntentContract,proposal:ActionProposal):AuthorityDecision{
  const c=intent.constraints,reasons:string[]=[],matched:string[]=[],allActions=c.allowedActionTypes.includes("*");
  if(intent.status!=="ACTIVE")reasons.push(`Intent is ${intent.status.toLowerCase()}.`);
  if(intent.expiresAt&&Date.parse(intent.expiresAt)<=Date.now())reasons.push("Intent has expired.");
  if(c.deniedActionTypes.includes(proposal.actionType))reasons.push("Action type is explicitly denied.");
  if(c.allowedActionTypes.length&&!allActions&&!c.allowedActionTypes.includes(proposal.actionType))reasons.push("Action type is outside the allowed action set.");else if(allActions||c.allowedActionTypes.includes(proposal.actionType))matched.push("actionType");
  if(includesTarget(c.deniedTargets,proposal.effect.target))reasons.push("Target is explicitly denied.");
  if(c.allowedTargets.length&&!includesTarget(c.allowedTargets,proposal.effect.target))reasons.push("Target is outside the allowed target set.");else if(c.allowedTargets.length&&includesTarget(c.allowedTargets,proposal.effect.target))matched.push("target");
  if(riskRank[proposal.risk]>riskRank[c.maxRisk])reasons.push(`Risk ${proposal.risk} exceeds maximum ${c.maxRisk}.`);else matched.push("risk");
  if(proposal.delegationChain.length>c.maxDelegationDepth)reasons.push("Delegation depth exceeds the intent contract.");else matched.push("delegationDepth");
  if(!c.allowExternalRecipients&&proposal.effect.recipients.length)reasons.push("External recipients are not authorized.");
  if(hasDisallowedData(c,proposal.effect.dataCategories))reasons.push("Action contains data categories outside the intent contract.");else matched.push("dataCategories");
  if(c.maxAmount&&proposal.effect.amount){if(c.maxAmount.currency!==proposal.effect.amount.currency||proposal.effect.amount.value>c.maxAmount.value)reasons.push("Requested financial amount exceeds the authorized limit.");else matched.push("amount")}
  if(reasons.length)return{decision:"BLOCK",reasons,humanApprovalRequired:false,matchedConstraints:matched,evaluatedAt:now()};
  const threshold=c.humanApprovalAtOrAbove;
  if(threshold&&riskRank[proposal.risk]>=riskRank[threshold])return{decision:"ASK",reasons:[`Risk ${proposal.risk} requires human approval under the intent contract.`],humanApprovalRequired:true,matchedConstraints:matched,evaluatedAt:now()};
  return{decision:"ALLOW",reasons:["Proposal is within the active intent contract."],humanApprovalRequired:false,matchedConstraints:matched,evaluatedAt:now()};
}

function canonical(value:unknown):string{if(Array.isArray(value))return`[${value.map(canonical).join(",")}]`;if(value&&typeof value==="object"){const o=value as Record<string,unknown>;return`{${Object.keys(o).sort().map(k=>`${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;}return JSON.stringify(value)}
export function proposalScopeHash(proposal:ActionProposal){return crypto.createHash("sha256").update(canonical({intentId:proposal.intentId,proposalId:proposal.id,actor:proposal.actor,effect:proposal.effect,actionType:proposal.actionType})).digest("hex")}
export function issueCommitPermit(proposal:ActionProposal,secret:string,ttlSeconds=90):CommitPermit{
  if(secret.length<32)throw new Error("CIEAV permit signing secret is too weak");
  const issued=new Date(),expires=new Date(issued.getTime()+Math.max(5,Math.min(300,ttlSeconds))*1000),base={id:crypto.randomUUID(),proposalId:proposal.id,intentId:proposal.intentId,subject:proposal.actor,effect:proposal.effect,scopeHash:proposalScopeHash(proposal),issuedAt:issued.toISOString(),expiresAt:expires.toISOString(),maxUses:1 as const,signatureAlgorithm:"HMAC-SHA256" as const};
  return{...base,signature:crypto.createHmac("sha256",secret).update(canonical(base)).digest("base64url")};
}
export function verifyCommitPermit(permit:CommitPermit,proposal:ActionProposal,secret:string){if(permit.signatureAlgorithm!=="HMAC-SHA256"||Date.parse(permit.expiresAt)<=Date.now()||permit.maxUses!==1)return false;if(permit.proposalId!==proposal.id||permit.intentId!==proposal.intentId||permit.scopeHash!==proposalScopeHash(proposal))return false;const{signature,...unsigned}=permit,expected=crypto.createHmac("sha256",secret).update(canonical(unsigned)).digest("base64url");if(signature.length!==expected.length)return false;try{return crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected))}catch{return false}}
