import type {AuthorizedOutcomeTrajectory,ConsequenceOutcome,ConsequenceGraphPersistedEdge,ConsequenceGraphPersistedState} from "@cieav/contracts";

export type ConsequenceGraphObservation={
  transitionKey:string;
  operation:string;
  exactArgumentsDigest:string;
  worldBeforeDigest?:string;
  worldAfterDigest?:string;
  outcome:ConsequenceOutcome;
  cryptographicallyVerified:boolean;
  authorityGrade:boolean;
  realityBound:boolean;
  evidenceCount:number;
};

export type ConsequenceGraphEdge={
  transitionKey:string;
  operation:string;
  exactArgumentsDigest:string;
  observations:number;
  success:number;
  failure:number;
  unknown:number;
  successRate:number;
  failureRate:number;
  unknownRate:number;
  proofability:number;
  authorityGradeCoverage:number;
  realityBoundCoverage:number;
  worldBeforeDigests:string[];
  worldAfterDigests:string[];
  authority:false;
  mayMintExecutionAuthority:false;
};

type Aggregate={
  transitionKey:string;
  operation:string;
  exactArgumentsDigest:string;
  observations:number;
  success:number;
  failure:number;
  unknown:number;
  proven:number;
  authorityGrade:number;
  realityBound:number;
  worldBeforeDigests:Set<string>;
  worldAfterDigests:Set<string>;
};

const finite=(value:number)=>Number.isFinite(value)?value:0;
const ratio=(numerator:number,denominator:number)=>denominator>0?numerator/denominator:0;
const bounded=(value:number)=>Math.max(0,Math.min(1,finite(value)));

/**
 * A graph edge is identified by the decision context known before execution:
 * operation + exact arguments + pre-state. The observed post-state must never
 * participate in the key, otherwise success/failure/unknown observations for
 * the same attempted transition are fragmented into separate edges.
 */
export function consequenceTransitionKey(input:Pick<AuthorizedOutcomeTrajectory,"operation"|"exactArgumentsDigest"|"worldBeforeDigest">):string{
  const before=input.worldBeforeDigest??"unknown-before";
  return `${input.operation}\n${input.exactArgumentsDigest}\n${before}`;
}

export function trajectoryToGraphObservation(trajectory:AuthorizedOutcomeTrajectory):ConsequenceGraphObservation{
  if(!trajectory.cryptographicallyVerified)throw new Error("consequence_graph_requires_cryptographically_verified_trajectory");
  return{
    transitionKey:consequenceTransitionKey(trajectory),
    operation:trajectory.operation,
    exactArgumentsDigest:trajectory.exactArgumentsDigest,
    ...(trajectory.worldBeforeDigest?{worldBeforeDigest:trajectory.worldBeforeDigest}:{}),
    ...(trajectory.worldAfterDigest?{worldAfterDigest:trajectory.worldAfterDigest}:{}),
    outcome:trajectory.outcome,
    cryptographicallyVerified:true,
    authorityGrade:trajectory.authorityGrade,
    realityBound:trajectory.realityBound,
    evidenceCount:trajectory.evidence.length,
  };
}

function emptyAggregate(observation:Pick<ConsequenceGraphObservation,"transitionKey"|"operation"|"exactArgumentsDigest">):Aggregate{
  return{...observation,observations:0,success:0,failure:0,unknown:0,proven:0,authorityGrade:0,realityBound:0,worldBeforeDigests:new Set(),worldAfterDigests:new Set()};
}

export class ConsequenceGraph{
  private readonly aggregates=new Map<string,Aggregate>();

  ingest(trajectory:AuthorizedOutcomeTrajectory):ConsequenceGraphEdge{
    const observation=trajectoryToGraphObservation(trajectory);
    const row=this.aggregates.get(observation.transitionKey)??emptyAggregate(observation);
    row.observations++;
    if(observation.outcome==="SUCCESS")row.success++;else if(observation.outcome==="FAILURE")row.failure++;else row.unknown++;
    if(observation.evidenceCount>0)row.proven++;
    if(observation.authorityGrade)row.authorityGrade++;
    if(observation.realityBound)row.realityBound++;
    if(observation.worldBeforeDigest)row.worldBeforeDigests.add(observation.worldBeforeDigest);
    if(observation.worldAfterDigest)row.worldAfterDigests.add(observation.worldAfterDigest);
    this.aggregates.set(observation.transitionKey,row);
    return this.edge(observation.transitionKey)!;
  }

  ingestMany(trajectories:AuthorizedOutcomeTrajectory[]):ConsequenceGraphEdge[]{
    for(const trajectory of trajectories)this.ingest(trajectory);
    return this.edges();
  }

  restore(state:ConsequenceGraphPersistedState){
    this.aggregates.clear();
    for(const edge of state.edges){
      this.aggregates.set(edge.transitionKey,{
        transitionKey:edge.transitionKey,
        operation:edge.operation,
        exactArgumentsDigest:edge.exactArgumentsDigest,
        observations:edge.observations,
        success:edge.success,
        failure:edge.failure,
        unknown:edge.unknown,
        proven:edge.proven,
        authorityGrade:edge.authorityGrade,
        realityBound:edge.realityBound,
        worldBeforeDigests:new Set(edge.worldBeforeDigests),
        worldAfterDigests:new Set(edge.worldAfterDigests),
      });
    }
  }

  persistedState():ConsequenceGraphPersistedState{
    const edges:ConsequenceGraphPersistedEdge[]=[...this.aggregates.values()].sort((a,b)=>a.transitionKey.localeCompare(b.transitionKey)).map(row=>({
      transitionKey:row.transitionKey,
      operation:row.operation,
      exactArgumentsDigest:row.exactArgumentsDigest,
      observations:row.observations,
      success:row.success,
      failure:row.failure,
      unknown:row.unknown,
      proven:row.proven,
      authorityGrade:row.authorityGrade,
      realityBound:row.realityBound,
      worldBeforeDigests:[...row.worldBeforeDigests].sort(),
      worldAfterDigests:[...row.worldAfterDigests].sort(),
      authority:false,
      mayMintExecutionAuthority:false,
    }));
    return{version:"CIEAV_CONSEQUENCE_GRAPH_STATE_V1",edges,authority:false,mayMintExecutionAuthority:false};
  }

  edge(transitionKey:string):ConsequenceGraphEdge|null{
    const row=this.aggregates.get(transitionKey);
    if(!row)return null;
    return{
      transitionKey,
      operation:row.operation,
      exactArgumentsDigest:row.exactArgumentsDigest,
      observations:row.observations,
      success:row.success,
      failure:row.failure,
      unknown:row.unknown,
      successRate:bounded(ratio(row.success,row.observations)),
      failureRate:bounded(ratio(row.failure,row.observations)),
      unknownRate:bounded(ratio(row.unknown,row.observations)),
      proofability:bounded(ratio(row.proven,row.observations)),
      authorityGradeCoverage:bounded(ratio(row.authorityGrade,row.observations)),
      realityBoundCoverage:bounded(ratio(row.realityBound,row.observations)),
      worldBeforeDigests:[...row.worldBeforeDigests].sort(),
      worldAfterDigests:[...row.worldAfterDigests].sort(),
      authority:false,
      mayMintExecutionAuthority:false,
    };
  }

  edges():ConsequenceGraphEdge[]{return[...this.aggregates.keys()].sort().map(key=>this.edge(key)!).filter(Boolean)}
  forOperation(operation:string):ConsequenceGraphEdge[]{return this.edges().filter(edge=>edge.operation===operation)}

  bestObservedEdge(operation:string):ConsequenceGraphEdge|null{
    const candidates=this.forOperation(operation);
    if(!candidates.length)return null;
    return candidates.sort((a,b)=>{
      const score=(edge:ConsequenceGraphEdge)=>edge.successRate*4+edge.proofability*2+edge.authorityGradeCoverage+edge.realityBoundCoverage-edge.failureRate*3-edge.unknownRate*4+Math.min(edge.observations,100)/100;
      return score(b)-score(a)||b.observations-a.observations||a.transitionKey.localeCompare(b.transitionKey);
    })[0];
  }

  snapshot(){
    const edges=this.edges(),observations=edges.reduce((sum,edge)=>sum+edge.observations,0),unknown=edges.reduce((sum,edge)=>sum+edge.unknown,0);
    return{version:"CIEAV_CONSEQUENCE_GRAPH_V1" as const,edges,observations,unknownRate:bounded(ratio(unknown,observations)),authority:false as const,mayMintExecutionAuthority:false as const};
  }
}
