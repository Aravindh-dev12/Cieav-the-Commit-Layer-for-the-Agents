import {
  ConsequenceInvariantRuleSchema,
  ConsequenceRelationRuleSchema,
  RealityQuarantineClosureSchema,
  type ActiveConsequenceNode,
  type ConsequenceInvariantRule,
  type ConsequenceRelation,
  type ConsequenceRelationRule,
  type RealityQuarantineClosure,
  type RealityQuarantineDisposition
} from "@cieav/contracts";
import {consequenceAlgebraDigest,relationBetween} from "./consequence-algebra.js";

const uniq=(values:string[])=>[...new Set(values)].sort();
const candidateStates=new Set<ActiveConsequenceNode["state"]>(["MATERIALIZED","RESERVED","AUTHORIZED","COMMITTED","DISPATCHED","OBSERVING","QUARANTINED","SETTLED_UNKNOWN"]);

function disposition(relation:ConsequenceRelation):RealityQuarantineDisposition{
  if(relation==="EQUIVALENT")return "RECONCILE";
  if(relation==="INDEPENDENT"||relation==="COMMUTES")return "ALLOW";
  if(relation==="AGGREGATES_WITH")return "AGGREGATE";
  return "BLOCK";
}

export function quarantineRelationRuleSetDigest(rules:ConsequenceRelationRule[]):string{
  const parsed=rules.map(rule=>ConsequenceRelationRuleSchema.parse(rule)).sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id));
  return consequenceAlgebraDigest(parsed);
}

export function quarantineInvariantRuleSetDigest(rules:ConsequenceInvariantRule[]):string{
  const parsed=rules.map(rule=>ConsequenceInvariantRuleSchema.parse(rule)).sort((a,b)=>a.id.localeCompare(b.id));
  return consequenceAlgebraDigest(parsed);
}

function digestBase(closure:Omit<RealityQuarantineClosure,"closureDigest"|"computedAt"|"closedAt">){
  return consequenceAlgebraDigest(closure);
}

export function computeRealityQuarantineClosure(
  source:ActiveConsequenceNode,
  nodes:ActiveConsequenceNode[],
  relationRules:ConsequenceRelationRule[]=[],
  invariantRules:ConsequenceInvariantRule[]=[],
  at=new Date()
):RealityQuarantineClosure{
  if(source.state!=="QUARANTINED"&&source.state!=="SETTLED_UNKNOWN")throw new Error(`reality_quarantine_source_not_unknown:${source.state}`);
  const candidates=nodes.filter(node=>node.materialization.id!==source.materialization.id&&candidateStates.has(node.state)).sort((a,b)=>a.materialization.id.localeCompare(b.materialization.id));
  const relationSnapshot=candidates.map(node=>{
    const relation=relationBetween(source.materialization,node.materialization,relationRules);
    return{
      consequenceRef:node.materialization.id,
      relation:relation.relation,
      basisDigest:relation.basisDigest,
      evidenceRefs:uniq(relation.evidenceRefs),
      disposition:disposition(relation.relation)
    };
  });
  const byDisposition=(kind:RealityQuarantineDisposition)=>relationSnapshot.filter(entry=>entry.disposition===kind).map(entry=>entry.consequenceRef);
  const affectedConsequenceRefs=uniq(relationSnapshot.filter(entry=>entry.disposition!=="ALLOW").map(entry=>entry.consequenceRef));
  const affectedSet=new Set(affectedConsequenceRefs);
  const affectedRealityRefs=uniq([
    ...source.materialization.semanticIdentity.targetRealityRefs,
    ...candidates.filter(node=>affectedSet.has(node.materialization.id)).flatMap(node=>node.materialization.semanticIdentity.targetRealityRefs)
  ]);
  const waiterConsequenceRefs=uniq(candidates.filter(node=>node.state==="MATERIALIZED"&&affectedSet.has(node.materialization.id)).map(node=>node.materialization.id));
  const base:Omit<RealityQuarantineClosure,"closureDigest"|"computedAt"|"closedAt">={
    version:"CIEAV_REALITY_QUARANTINE_CLOSURE_V1",
    sourceConsequenceRef:source.materialization.id,
    sourceState:source.state,
    sourceSemanticEffectDigest:source.materialization.semanticIdentity.digest,
    sourceRealityRefs:uniq(source.materialization.semanticIdentity.targetRealityRefs),
    status:"OPEN",
    relationRuleSetDigest:quarantineRelationRuleSetDigest(relationRules),
    invariantRuleSetDigest:quarantineInvariantRuleSetDigest(invariantRules),
    affectedConsequenceRefs,
    affectedRealityRefs,
    blockerConsequenceRefs:uniq(byDisposition("BLOCK")),
    waiterConsequenceRefs,
    reconcileCandidateRefs:uniq(byDisposition("RECONCILE")),
    allowedIndependentConsequenceRefs:uniq(byDisposition("ALLOW")),
    relationSnapshot,
    authority:false,
    mayMintExecutionAuthority:false
  };
  return RealityQuarantineClosureSchema.parse({...base,computedAt:at.toISOString(),closureDigest:digestBase(base)});
}

export function closeRealityQuarantineClosure(raw:RealityQuarantineClosure,resolution:"SUCCESS"|"FAILURE",at=new Date()):RealityQuarantineClosure{
  const closure=RealityQuarantineClosureSchema.parse(raw);
  if(closure.status!=="OPEN"){
    if(closure.resolution!==resolution)throw new Error("reality_quarantine_closure_resolution_conflict");
    return closure;
  }
  const {closureDigest:_,computedAt:__,closedAt:___,...rest}=closure;
  const base:Omit<RealityQuarantineClosure,"closureDigest"|"computedAt"|"closedAt">={...rest,status:"CLOSED",resolution};
  return RealityQuarantineClosureSchema.parse({...base,computedAt:closure.computedAt,closedAt:at.toISOString(),closureDigest:digestBase(base)});
}

export function verifyRealityQuarantineClosureDigest(raw:RealityQuarantineClosure):boolean{
  const closure=RealityQuarantineClosureSchema.parse(raw),{closureDigest,computedAt:_,closedAt:__,...base}=closure;
  return closureDigest===digestBase(base);
}
