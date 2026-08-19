import crypto from "node:crypto";
import type {EffectDescriptor,IntentConstraints,IntentContract} from "@cieav/contracts/reality";
import {
  AutonomyCandidateSchema,
  ExpectedConsequenceSchema,
  IntentAttenuationWitnessSchema,
  IntentRealityProfileSchema,
  RealityBoundCommitPermitSchema,
  RealityStateWitnessSchema,
  type AuthoritySafetyReplay,
  type AutonomyCandidate,
  type ExpectedConsequence,
  type IntentAttenuationWitness,
  type IntentRealityProfile,
  type RealityBoundCommitPermit,
  type RealityStateWitness
} from "@cieav/contracts/intent-reality";

const riskRank:Record<string,number>={LOW:0,MEDIUM:1,HIGH:2,CRITICAL:3};

export function canonicalIntentReality(value:unknown):string{
  if(Array.isArray(value))return`[${value.map(canonicalIntentReality).join(",")}]`;
  if(value&&typeof value==="object"){
    const object=value as Record<string,unknown>;
    return`{${Object.keys(object).sort().map(key=>`${JSON.stringify(key)}:${canonicalIntentReality(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function hashIntentReality(value:unknown){return crypto.createHash("sha256").update(canonicalIntentReality(value)).digest("hex")}

export function createRealityStateWitness(facts:Record<string,unknown>,source:string,observedAt=new Date().toISOString(),trust:"TRUSTED_LOCAL_OBSERVER"|"TRUSTED_ADAPTER"|"HUMAN_ATTESTATION"="TRUSTED_LOCAL_OBSERVER",observerId?:string):RealityStateWitness{
  const entries=Object.entries(facts).sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>({key,valueHash:hashIntentReality(value)}));
  if(!entries.length)throw new Error("reality_state_requires_facts");
  return RealityStateWitnessSchema.parse({id:crypto.randomUUID(),observedAt,source,trust,...(observerId?{observerId}:{}),facts:entries,stateHash:hashIntentReality(entries)});
}

export function verifyRealityStateWitness(witness:RealityStateWitness){
  const parsed=RealityStateWitnessSchema.parse(witness),facts=[...parsed.facts].sort((a,b)=>a.key.localeCompare(b.key));
  return parsed.stateHash===hashIntentReality(facts);
}

export function createExpectedConsequence(input:Omit<ExpectedConsequence,"consequenceHash">):ExpectedConsequence{
  const base={summary:input.summary,effect:input.effect,postconditions:input.postconditions,proofKinds:input.proofKinds};
  return ExpectedConsequenceSchema.parse({...base,consequenceHash:hashIntentReality(base)});
}

export function verifyExpectedConsequence(expected:ExpectedConsequence){
  const parsed=ExpectedConsequenceSchema.parse(expected),base={summary:parsed.summary,effect:parsed.effect,postconditions:parsed.postconditions,proofKinds:parsed.proofKinds};
  return parsed.consequenceHash===hashIntentReality(base);
}

function normalizedMetadata(effect:EffectDescriptor){
  const source=effect.metadata??{},keys=["businessObjectId","resourceId","invoiceId","orderId","transactionId","messageThreadId","idempotencyDomain"];
  return Object.fromEntries(keys.filter(key=>Object.prototype.hasOwnProperty.call(source,key)).map(key=>[key,source[key]]));
}

export function semanticEffectKey(effect:EffectDescriptor){
  const semanticOperation=typeof effect.metadata?.cieavSemanticEffect==="string"?String(effect.metadata.cieavSemanticEffect).trim().toLowerCase():effect.operation.trim().toLowerCase();
  return hashIntentReality({
    class:effect.class,
    operation:semanticOperation,
    target:effect.target?.trim().toLowerCase(),
    amount:effect.amount?{currency:effect.amount.currency,value:effect.amount.value}:undefined,
    recipients:[...effect.recipients].map(x=>x.trim().toLowerCase()).sort(),
    dataCategories:[...effect.dataCategories].sort(),
    metadata:normalizedMetadata(effect)
  });
}

export function intentContractHash(intent:IntentContract){
  return hashIntentReality({id:intent.id,owner:intent.owner,goal:intent.goal,expiresAt:intent.expiresAt,status:intent.status,constraints:intent.constraints,completionCriteria:intent.completionCriteria});
}

export function intentConstraintsHash(constraints:IntentConstraints){return hashIntentReality(constraints)}

function setIsSubset(child:string[],parent:string[]){const p=new Set(parent);return child.every(value=>p.has(value))}
function setIsSuperset(child:string[],parent:string[]){const c=new Set(child);return parent.every(value=>c.has(value))}
function targetSubset(child:string[],parent:string[]){return !parent.length||child.every(value=>parent.includes(value))}

export function attenuationIssues(parent:IntentConstraints,child:IntentConstraints):string[]{
  const issues:string[]=[];
  if(riskRank[child.maxRisk]>riskRank[parent.maxRisk])issues.push("maxRisk widened");
  if(parent.allowedActionTypes.length&&(!child.allowedActionTypes.length||!setIsSubset(child.allowedActionTypes,parent.allowedActionTypes)))issues.push("allowedActionTypes widened");
  if(!setIsSuperset(child.deniedActionTypes,parent.deniedActionTypes))issues.push("deniedActionTypes weakened");
  if(parent.allowedTargets.length&&(!child.allowedTargets.length||!targetSubset(child.allowedTargets,parent.allowedTargets)))issues.push("allowedTargets widened");
  if(!setIsSuperset(child.deniedTargets,parent.deniedTargets))issues.push("deniedTargets weakened");
  if(!setIsSubset(child.allowedDataCategories,parent.allowedDataCategories))issues.push("allowedDataCategories widened");
  if(child.allowExternalRecipients&&!parent.allowExternalRecipients)issues.push("external recipient authority widened");
  if(child.maxDelegationDepth>parent.maxDelegationDepth)issues.push("delegation depth widened");
  if(parent.requireIndependentVerification&&!child.requireIndependentVerification)issues.push("independent verification disabled");
  if(parent.maxAmount){
    if(!child.maxAmount)issues.push("financial ceiling removed");
    else if(child.maxAmount.currency!==parent.maxAmount.currency||child.maxAmount.value>parent.maxAmount.value)issues.push("financial ceiling widened");
  }
  if(parent.humanApprovalAtOrAbove){
    if(!child.humanApprovalAtOrAbove)issues.push("human approval threshold removed");
    else if(riskRank[child.humanApprovalAtOrAbove]>riskRank[parent.humanApprovalAtOrAbove])issues.push("human approval threshold weakened");
  }
  return issues;
}

export function isStrictlyAttenuated(parent:IntentConstraints,child:IntentConstraints){return attenuationIssues(parent,child).length===0}

export function createIntentAttenuationWitness(input:{rootIntentId:string;parentWitnessId?:string;parentConstraints:IntentConstraints;childConstraints:IntentConstraints},secret:string,issuedAt=new Date().toISOString()):IntentAttenuationWitness{
  if(secret.length<32)throw new Error("intent_reality_secret_too_weak");
  const issues=attenuationIssues(input.parentConstraints,input.childConstraints);if(issues.length)throw new Error(`delegation_widens_authority:${issues.join(",")}`);
  const removedActionTypes=input.parentConstraints.allowedActionTypes.filter(x=>!input.childConstraints.allowedActionTypes.includes(x));
  const removedTargets=input.parentConstraints.allowedTargets.filter(x=>!input.childConstraints.allowedTargets.includes(x));
  const removedDataCategories=input.parentConstraints.allowedDataCategories.filter(x=>!input.childConstraints.allowedDataCategories.includes(x));
  const unsigned={
    id:crypto.randomUUID(),rootIntentId:input.rootIntentId,...(input.parentWitnessId?{parentWitnessId:input.parentWitnessId}:{}),
    parentScopeHash:intentConstraintsHash(input.parentConstraints),childScopeHash:intentConstraintsHash(input.childConstraints),
    parentConstraints:input.parentConstraints,childConstraints:input.childConstraints,
    authorityDelta:{removedActionTypes,removedTargets,removedDataCategories,maxRiskFrom:input.parentConstraints.maxRisk,maxRiskTo:input.childConstraints.maxRisk,externalRecipientsFrom:input.parentConstraints.allowExternalRecipients,externalRecipientsTo:input.childConstraints.allowExternalRecipients,maxDelegationDepthFrom:input.parentConstraints.maxDelegationDepth,maxDelegationDepthTo:input.childConstraints.maxDelegationDepth,addedAuthority:false as const},
    issuedAt,signatureAlgorithm:"HMAC-SHA256" as const
  };
  const signature=crypto.createHmac("sha256",secret).update(canonicalIntentReality(unsigned)).digest("base64url");
  return IntentAttenuationWitnessSchema.parse({...unsigned,signature});
}

export function verifyIntentAttenuationWitness(witness:IntentAttenuationWitness,secret:string){
  try{
    const parsed=IntentAttenuationWitnessSchema.parse(witness),{signature,...unsigned}=parsed;
    if(attenuationIssues(parsed.parentConstraints,parsed.childConstraints).length)return false;
    if(parsed.parentScopeHash!==intentConstraintsHash(parsed.parentConstraints)||parsed.childScopeHash!==intentConstraintsHash(parsed.childConstraints))return false;
    const expected=crypto.createHmac("sha256",secret).update(canonicalIntentReality(unsigned)).digest("base64url");
    return signature.length===expected.length&&crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected));
  }catch{return false}
}

export function defaultIntentRealityProfile(intentId:string,updatedAt=new Date().toISOString()):IntentRealityProfile{
  return IntentRealityProfileSchema.parse({intentId,updatedAt});
}

export function createRealityBoundCommit(input:{taskId:string;intent:IntentContract;proposal:{id:string;intentId:string;actor:any;effect:EffectDescriptor};preState:RealityStateWitness;expected:ExpectedConsequence;attenuationWitnessId?:string;ttlSeconds?:number},secret:string,issuedAt=new Date()):RealityBoundCommitPermit{
  if(secret.length<32)throw new Error("intent_reality_secret_too_weak");
  if(input.proposal.intentId!==input.intent.id)throw new Error("proposal_intent_mismatch");
  if(!verifyRealityStateWitness(input.preState))throw new Error("invalid_pre_state_witness");
  if(!verifyExpectedConsequence(input.expected))throw new Error("expected_consequence_hash_invalid");
  if(input.expected.effect.class!==input.proposal.effect.class||semanticEffectKey(input.expected.effect)!==semanticEffectKey(input.proposal.effect))throw new Error("expected_consequence_effect_mismatch");
  const ttl=Math.max(5,Math.min(120,input.ttlSeconds??30)),unsigned={
    id:crypto.randomUUID(),taskId:input.taskId,intentId:input.intent.id,proposalId:input.proposal.id,subject:input.proposal.actor,effect:input.proposal.effect,
    effectKey:semanticEffectKey(input.proposal.effect),rootIntentHash:intentContractHash(input.intent),...(input.attenuationWitnessId?{attenuationWitnessId:input.attenuationWitnessId}:{}),
    preStateHash:input.preState.stateHash,expectedConsequenceHash:input.expected.consequenceHash,proofKinds:input.expected.proofKinds,
    issuedAt:issuedAt.toISOString(),expiresAt:new Date(issuedAt.getTime()+ttl*1000).toISOString(),maxUses:1 as const,signatureAlgorithm:"HMAC-SHA256" as const
  };
  const signature=crypto.createHmac("sha256",secret).update(canonicalIntentReality(unsigned)).digest("base64url");
  return RealityBoundCommitPermitSchema.parse({...unsigned,signature});
}

export function verifyRealityBoundCommit(permit:RealityBoundCommitPermit,currentState:RealityStateWitness,secret:string,now=Date.now()):{ok:true}|{ok:false;reason:string}{
  try{
    const parsed=RealityBoundCommitPermitSchema.parse(permit),{signature,...unsigned}=parsed;
    if(Date.parse(parsed.expiresAt)<=now)return{ok:false,reason:"permit_expired"};
    if(!verifyRealityStateWitness(currentState))return{ok:false,reason:"current_state_witness_invalid"};
    if(parsed.preStateHash!==currentState.stateHash)return{ok:false,reason:"reality_changed_since_authorization"};
    const expected=crypto.createHmac("sha256",secret).update(canonicalIntentReality(unsigned)).digest("base64url");
    if(signature.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return{ok:false,reason:"permit_signature_invalid"};
    return{ok:true};
  }catch{return{ok:false,reason:"permit_invalid"}}
}

export function nextConsequenceDrift(current:number,delta:number,budget:number){
  const cumulative=Math.max(0,current)+Math.max(0,Math.min(1,delta)),limit=Math.max(0,Math.min(1,budget));
  return{cumulative,budget:limit,allowed:cumulative<=limit};
}

export function autonomyDirection(current:IntentConstraints,candidate:IntentConstraints):"EXPAND"|"CONTRACT"{
  const candidateWithinCurrent=isStrictlyAttenuated(current,candidate),currentWithinCandidate=isStrictlyAttenuated(candidate,current);
  if(candidateWithinCurrent&&!currentWithinCandidate)return"CONTRACT";
  if(currentWithinCandidate&&!candidateWithinCurrent)return"EXPAND";
  if(candidateWithinCurrent&&currentWithinCandidate)return"CONTRACT";
  throw new Error("mixed_authority_change_requires_separate_candidates");
}

export function autonomyExpansionReplaySafe(replay:AuthoritySafetyReplay,minimumVerifiedActions:number){
  return replay.verifiedExpectedOutcomes>=minimumVerifiedActions&&replay.deniedWouldBecomeAutonomous===0&&replay.disprovenWouldBecomeAutonomous===0&&replay.unknownWouldBecomeAutonomous===0&&replay.highCriticalWouldBecomeAutonomous===0;
}

export function createAutonomyCandidate(input:{scopeDeviceId:string;intentId:string;currentConstraints:IntentConstraints;candidateConstraints:IntentConstraints;replay:AuthoritySafetyReplay;reason:string},minimumVerifiedActions:number,createdAt=new Date().toISOString()):AutonomyCandidate{
  const direction=autonomyDirection(input.currentConstraints,input.candidateConstraints);
  if(direction==="EXPAND"&&!autonomyExpansionReplaySafe(input.replay,minimumVerifiedActions))throw new Error("autonomy_expansion_safety_replay_failed");
  return AutonomyCandidateSchema.parse({id:crypto.randomUUID(),scopeDeviceId:input.scopeDeviceId,intentId:input.intentId,direction,currentConstraints:input.currentConstraints,candidateConstraints:input.candidateConstraints,candidateHash:intentConstraintsHash(input.candidateConstraints),replay:input.replay,reason:input.reason,state:direction==="CONTRACT"?"AUTO_CONTRACTED":"CANDIDATE",createdAt});
}
