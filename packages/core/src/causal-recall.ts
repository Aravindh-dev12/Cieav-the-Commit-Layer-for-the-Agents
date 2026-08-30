import crypto from "node:crypto";
import {
  CausalProvenanceLinkSchema,
  CausalRecallEventSchema,
  ConsequenceRecoveryCapabilitySchema,
  ConsequenceRecoveryClosureSchema,
  ProposedRecoveryProgramSchema,
  type CausalDependencyKind,
  type CausalProvenanceLink,
  type CausalRecallEvent,
  type CausalRecallReason,
  type ConsequenceRecoveryCapability,
  type ConsequenceRecoveryClosure,
  type ConsequenceSettlement,
  type ProposedRecoveryProgram
} from "@cieav/contracts";

const canonical=(value:unknown):string=>Array.isArray(value)
  ?`[${value.map(canonical).join(",")}]`
  :value&&typeof value==="object"
    ?`{${Object.keys(value as Record<string,unknown>).sort().map(key=>`${JSON.stringify(key)}:${canonical((value as Record<string,unknown>)[key])}`).join(",")}}`
    :JSON.stringify(value)??"undefined";
export const causalRecallDigest=(value:unknown)=>crypto.createHash("sha256").update(canonical(value)).digest("hex");
const uniq=(values:string[])=>[...new Set(values)].sort();
const intersects=(left:string[],right:Set<string>)=>left.some(value=>right.has(value));

export function makeCausalProvenanceLink(input:{
  sourceRef:string;
  consequenceRef:string;
  kind:CausalDependencyKind;
  upstreamConsequenceRefs?:string[];
  evidenceRefs?:string[];
  createdAt?:Date;
}):CausalProvenanceLink{
  const createdAt=(input.createdAt??new Date()).toISOString(),base={
    version:"CIEAV_CAUSAL_PROVENANCE_LINK_V1" as const,
    sourceRef:input.sourceRef,
    consequenceRef:input.consequenceRef,
    kind:input.kind,
    upstreamConsequenceRefs:uniq(input.upstreamConsequenceRefs??[]),
    evidenceRefs:uniq(input.evidenceRefs??[]),
    createdAt,
    authority:false as const,
    mayMintExecutionAuthority:false as const
  };
  return CausalProvenanceLinkSchema.parse({id:crypto.randomUUID(),...base,basisDigest:causalRecallDigest(base)});
}

export function makeCausalRecallEvent(input:{
  reasonClass:CausalRecallReason;
  invalidatedRefs:string[];
  reason:string;
  evidenceRefs:string[];
  discoveredAt?:Date;
}):CausalRecallEvent{
  const base={
    version:"CIEAV_CAUSAL_RECALL_EVENT_V1" as const,
    reasonClass:input.reasonClass,
    invalidatedRefs:uniq(input.invalidatedRefs),
    reason:input.reason,
    discoveredAt:(input.discoveredAt??new Date()).toISOString(),
    evidenceRefs:uniq(input.evidenceRefs),
    authority:false as const,
    mayMintExecutionAuthority:false as const
  };
  return CausalRecallEventSchema.parse({id:crypto.randomUUID(),...base,eventDigest:causalRecallDigest(base)});
}

function recoveryProgram(event:CausalRecallEvent,consequenceRef:string,disposition:Exclude<ConsequenceRecoveryCapability["disposition"],"IRREVERSIBLE">,proposedEffectRefs:string[],prerequisites:string[],reason:string):ProposedRecoveryProgram{
  return ProposedRecoveryProgramSchema.parse({
    id:crypto.randomUUID(),
    version:"CIEAV_PROPOSED_RECOVERY_PROGRAM_V1",
    recallEventRef:event.id,
    sourceConsequenceRef:consequenceRef,
    disposition,
    prerequisiteConsequenceRefs:uniq(prerequisites),
    proposedEffectRefs:uniq(proposedEffectRefs),
    reason,
    requiresFreshAuthority:true,
    authority:false,
    mayMintExecutionAuthority:false
  });
}

function directAffected(event:CausalRecallEvent,links:CausalProvenanceLink[]){
  const invalidated=new Set(event.invalidatedRefs),direct=new Set<string>();
  for(const link of links){
    if(invalidated.has(link.sourceRef)||intersects(link.evidenceRefs,invalidated)||link.upstreamConsequenceRefs.some(ref=>invalidated.has(ref)))direct.add(link.consequenceRef);
  }
  for(const ref of event.invalidatedRefs)if(/^[0-9a-f-]{36}$/i.test(ref))for(const link of links)if(link.upstreamConsequenceRefs.includes(ref))direct.add(link.consequenceRef);
  return direct;
}

export function computeConsequenceRecoveryClosure(
  rawEvent:CausalRecallEvent,
  rawLinks:CausalProvenanceLink[],
  settlements:ConsequenceSettlement[]=[],
  rawCapabilities:ConsequenceRecoveryCapability[]=[],
  at=new Date()
):ConsequenceRecoveryClosure{
  const event=CausalRecallEventSchema.parse(rawEvent),links=rawLinks.map(link=>CausalProvenanceLinkSchema.parse(link)),capabilities=rawCapabilities.map(value=>ConsequenceRecoveryCapabilitySchema.parse(value));
  const direct=directAffected(event,links),adjacency=new Map<string,Set<string>>();
  for(const link of links)for(const upstream of link.upstreamConsequenceRefs){const set=adjacency.get(upstream)??new Set<string>();set.add(link.consequenceRef);adjacency.set(upstream,set)}
  const affected=new Set(direct),queue=[...direct];
  while(queue.length){const current=queue.shift()!;for(const next of adjacency.get(current)??[]){if(affected.has(next))continue;affected.add(next);queue.push(next)}}
  const transitive=uniq([...affected].filter(ref=>!direct.has(ref))),settlementMap=new Map(settlements.map(value=>[value.consequenceRef,value] as const)),capabilityMap=new Map(capabilities.map(value=>[value.consequenceRef,value] as const));
  const snapshots=uniq([...affected]).map(ref=>settlementMap.get(ref)).filter((value):value is ConsequenceSettlement=>Boolean(value)).sort((a,b)=>a.consequenceRef.localeCompare(b.consequenceRef));
  const block=uniq([...affected].filter(ref=>{const settlement=settlementMap.get(ref);return !settlement||settlement.executionState==="NOT_DISPATCHED"||settlement.realityState==="UNKNOWN"}));
  const recoverable:string[]=[],compensable:string[]=[],irreversible:string[]=[],programs:ProposedRecoveryProgram[]=[];
  for(const ref of uniq([...affected])){
    const settlement=settlementMap.get(ref),capability=capabilityMap.get(ref);
    if(settlement?.realityState==="OBSERVED_FAILURE")continue;
    if(capability?.disposition==="IRREVERSIBLE"){irreversible.push(ref);continue}
    const prerequisites=links.filter(link=>link.consequenceRef===ref).flatMap(link=>link.upstreamConsequenceRefs).filter(upstream=>affected.has(upstream));
    if(capability?.disposition==="COMPENSATE"){
      compensable.push(ref);
      programs.push(recoveryProgram(event,ref,"COMPENSATE",capability.proposedEffectRefs,prerequisites,"Compensation is proposed as a new governed consequence after causal invalidation."));
      continue;
    }
    if(capability){
      recoverable.push(ref);
      programs.push(recoveryProgram(event,ref,capability.disposition,capability.proposedEffectRefs,prerequisites,"Recovery is proposed after causal invalidation and requires fresh authority."));
      continue;
    }
    if(!settlement||settlement.realityState==="UNKNOWN"){
      recoverable.push(ref);
      programs.push(recoveryProgram(event,ref,"RECONCILE",[],prerequisites,"Reality is unresolved; reconcile before any recovery or equivalent action."));
    }else if(settlement.realityState==="OBSERVED_SUCCESS"){
      recoverable.push(ref);
      programs.push(recoveryProgram(event,ref,"MANUAL",[],prerequisites,"Physical success is preserved; no qualified automatic inverse is registered, so recovery requires governed manual planning."));
    }
  }
  const sourceDigest=causalRecallDigest({eventDigest:event.eventDigest,links:links.map(link=>link.basisDigest).sort(),settlements:snapshots.map(value=>value.settlementDigest).sort(),capabilities:capabilities.map(value=>causalRecallDigest(value)).sort()});
  const base={
    version:"CIEAV_CONSEQUENCE_RECOVERY_CLOSURE_V1" as const,
    recallEventRef:event.id,
    directlyAffectedConsequenceRefs:uniq([...direct]),
    transitivelyAffectedConsequenceRefs:transitive,
    futureConsequencesToBlock:block,
    recoverableConsequenceRefs:uniq(recoverable),
    compensableConsequenceRefs:uniq(compensable),
    irreversibleConsequenceRefs:uniq(irreversible),
    settlementSnapshots:snapshots,
    proposedRecoveryPrograms:programs.sort((a,b)=>a.sourceConsequenceRef.localeCompare(b.sourceConsequenceRef)||a.id.localeCompare(b.id)),
    sourceDigest,
    computedAt:at.toISOString(),
    authority:false as const,
    mayMintExecutionAuthority:false as const
  };
  return ConsequenceRecoveryClosureSchema.parse({id:crypto.randomUUID(),...base,closureDigest:causalRecallDigest(base)});
}

export function verifyConsequenceRecoveryClosureDigest(closure:ConsequenceRecoveryClosure){
  const parsed=ConsequenceRecoveryClosureSchema.parse(closure),{id:_,closureDigest:__,...base}=parsed;
  return causalRecallDigest(base)===parsed.closureDigest;
}

export const CAUSAL_RECALL_AUTHORITY=false as const;
export const CAUSAL_RECALL_MAY_MINT_EXECUTION_AUTHORITY=false as const;
