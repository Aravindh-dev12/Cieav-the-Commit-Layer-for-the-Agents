import type {AuthorizedOutcomeTrajectory,ConsequenceOutcome} from "@cieav/contracts";

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

export class ConsequenceGraph{
  private readonly observations=new Map<string,ConsequenceGraphObservation[]>();

  ingest(trajectory:AuthorizedOutcomeTrajectory):ConsequenceGraphEdge{
    const observation=trajectoryToGraphObservation(trajectory);
    const rows=this.observations.get(observation.transitionKey)??[];
    rows.push(Object.freeze({...observation}));
    this.observations.set(observation.transitionKey,rows);
    return this.edge(observation.transitionKey)!;
  }

  ingestMany(trajectories:AuthorizedOutcomeTrajectory[]):ConsequenceGraphEdge[]{
    for(const trajectory of trajectories)this.ingest(trajectory);
    return this.edges();
  }

  edge(transitionKey:string):ConsequenceGraphEdge|null{
    const rows=this.observations.get(transitionKey);
    if(!rows?.length)return null;
    const success=rows.filter(row=>row.outcome==="SUCCESS").length;
    const failure=rows.filter(row=>row.outcome==="FAILURE").length;
    const unknown=rows.filter(row=>row.outcome==="UNKNOWN").length;
    const proven=rows.filter(row=>row.evidenceCount>0).length;
    const authorityGrade=rows.filter(row=>row.authorityGrade).length;
    const realityBound=rows.filter(row=>row.realityBound).length;
    const observations=rows.length;
    return{
      transitionKey,
      operation:rows[0].operation,
      exactArgumentsDigest:rows[0].exactArgumentsDigest,
      observations,
      success,
      failure,
      unknown,
      successRate:bounded(ratio(success,observations)),
      failureRate:bounded(ratio(failure,observations)),
      unknownRate:bounded(ratio(unknown,observations)),
      proofability:bounded(ratio(proven,observations)),
      authorityGradeCoverage:bounded(ratio(authorityGrade,observations)),
      realityBoundCoverage:bounded(ratio(realityBound,observations)),
      worldBeforeDigests:[...new Set(rows.map(row=>row.worldBeforeDigest).filter((value):value is string=>Boolean(value)))].sort(),
      worldAfterDigests:[...new Set(rows.map(row=>row.worldAfterDigest).filter((value):value is string=>Boolean(value)))].sort(),
      authority:false,
      mayMintExecutionAuthority:false,
    };
  }

  edges():ConsequenceGraphEdge[]{
    return[...this.observations.keys()].sort().map(key=>this.edge(key)!).filter(Boolean);
  }

  forOperation(operation:string):ConsequenceGraphEdge[]{
    return this.edges().filter(edge=>edge.operation===operation);
  }

  bestObservedEdge(operation:string):ConsequenceGraphEdge|null{
    const candidates=this.forOperation(operation);
    if(!candidates.length)return null;
    return candidates.sort((a,b)=>{
      const score=(edge:ConsequenceGraphEdge)=>
        edge.successRate*4+
        edge.proofability*2+
        edge.authorityGradeCoverage+
        edge.realityBoundCoverage-
        edge.failureRate*3-
        edge.unknownRate*4+
        Math.min(edge.observations,100)/100;
      return score(b)-score(a)||b.observations-a.observations||a.transitionKey.localeCompare(b.transitionKey);
    })[0];
  }

  snapshot(){
    const edges=this.edges();
    const observations=edges.reduce((sum,edge)=>sum+edge.observations,0);
    const unknown=edges.reduce((sum,edge)=>sum+edge.unknown,0);
    return{
      version:"CIEAV_CONSEQUENCE_GRAPH_V1" as const,
      edges,
      observations,
      unknownRate:bounded(ratio(unknown,observations)),
      authority:false as const,
      mayMintExecutionAuthority:false as const,
    };
  }
}
