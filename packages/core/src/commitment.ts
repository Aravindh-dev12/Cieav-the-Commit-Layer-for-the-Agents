import type {Commitment,CommitmentEvidence,CommitmentSettlement,CommitmentState,ConsequenceGraph,RiskLevel} from "@cieav/contracts";

const riskRank:Record<RiskLevel,number>={LOW:0,MEDIUM:1,HIGH:2,CRITICAL:3};

export function validateConsequenceGraph(graph:ConsequenceGraph):void{
  const ids=new Set<string>();
  for(const node of graph.nodes){if(ids.has(node.id))throw new Error(`duplicate consequence node: ${node.id}`);ids.add(node.id)}
  for(const node of graph.nodes)for(const dep of node.dependsOn)if(!ids.has(dep))throw new Error(`unknown consequence dependency: ${node.id} -> ${dep}`);
  const visiting=new Set<string>(),visited=new Set<string>();
  const byId=new Map(graph.nodes.map(n=>[n.id,n] as const));
  const visit=(id:string)=>{if(visited.has(id))return;if(visiting.has(id))throw new Error(`consequence graph cycle at ${id}`);visiting.add(id);for(const dep of byId.get(id)!.dependsOn)visit(dep);visiting.delete(id);visited.add(id)};
  for(const id of ids)visit(id);
}

export function consequenceRisk(graph:ConsequenceGraph):RiskLevel{
  validateConsequenceGraph(graph);
  return graph.nodes.reduce<RiskLevel>((highest,node)=>riskRank[node.risk]>riskRank[highest]?node.risk:highest,"LOW");
}

const transitions:Record<CommitmentState,ReadonlySet<CommitmentState>>={
  PROPOSED:new Set(["AUTHORIZED","CANCELLED"]),
  AUTHORIZED:new Set(["DISPATCHED","CANCELLED"]),
  DISPATCHED:new Set(["CLAIMED_COMPLETE","OBSERVING","DISPROVEN","UNKNOWN","RECOVERING"]),
  CLAIMED_COMPLETE:new Set(["OBSERVING","DISPROVEN","UNKNOWN","RECOVERING"]),
  OBSERVING:new Set(["PROVEN","DISPROVEN","UNKNOWN","RECOVERING"]),
  PROVEN:new Set(),DISPROVEN:new Set(["RECOVERING"]),UNKNOWN:new Set(["OBSERVING","RECOVERING","CANCELLED"]),
  RECOVERING:new Set(["DISPATCHED","OBSERVING","PROVEN","DISPROVEN","UNKNOWN","CANCELLED"]),CANCELLED:new Set()
};

export function canTransitionCommitment(from:CommitmentState,to:CommitmentState):boolean{return from===to||transitions[from].has(to)}
export function assertCommitmentTransition(from:CommitmentState,to:CommitmentState):void{if(!canTransitionCommitment(from,to))throw new Error(`invalid commitment transition: ${from} -> ${to}`)}

export function settleCommitment(commitment:Commitment,evidence:readonly CommitmentEvidence[],settledAt=new Date().toISOString()):CommitmentSettlement{
  validateConsequenceGraph(commitment.consequenceGraph);
  const obligation=commitment.proofObligation;
  const relevant=evidence.filter(e=>obligation.requirements.some(r=>r.id===e.requirementId));
  const satisfied:string[]=[],missing:string[]=[],contradicted:string[]=[];
  for(const requirement of obligation.requirements){
    if(!requirement.required)continue;
    const items=relevant.filter(e=>e.requirementId===requirement.id);
    const contradiction=items.some(e=>e.signal==="CONTRADICTS"&&e.confidence>=requirement.minimumConfidence&&(requirement.independentOfActor?e.actorIndependent:true));
    if(contradiction){contradicted.push(requirement.id);continue}
    const support=items.some(e=>e.signal==="SUPPORTS"&&e.confidence>=requirement.minimumConfidence&&(requirement.independentOfActor?e.actorIndependent:true));
    if(support)satisfied.push(requirement.id);else missing.push(requirement.id);
  }
  const status:CommitmentSettlement["status"]=contradicted.length?"DISPROVEN":missing.length?"UNKNOWN":"PROVEN";
  const reason=status==="PROVEN"?"All required proof obligations are satisfied by qualifying evidence.":status==="DISPROVEN"?`Required proof contradicted: ${contradicted.join(", ")}.`:`Required proof remains missing or insufficient: ${missing.join(", ")}.`;
  return{commitmentId:commitment.id,status,settledAt,evidence:[...relevant],satisfiedRequirementIds:satisfied,missingRequirementIds:missing,contradictedRequirementIds:contradicted,reason};
}

export function settlementState(settlement:CommitmentSettlement):CommitmentState{return settlement.status}
