import crypto from "node:crypto";
import {AuthorizedOutcomeTrajectorySchema,ConsequenceGraphPersistedStateSchema,type AuthorizedOutcomeTrajectory,type ConsequenceOutcome,type ConsequenceGraphPersistedEdge,type ConsequenceGraphPersistedState,type ConsequenceGraphTrajectoryLedgerEntry} from "@cieav/contracts";

export type ConsequenceGraphObservation={transitionKey:string;operation:string;exactArgumentsDigest:string;worldBeforeDigest?:string;worldAfterDigest?:string;outcome:ConsequenceOutcome;cryptographicallyVerified:boolean;authorityGrade:boolean;realityBound:boolean;evidenceCount:number};
export type ConsequenceGraphEdge={transitionKey:string;operation:string;exactArgumentsDigest:string;observations:number;success:number;failure:number;unknown:number;successRate:number;failureRate:number;unknownRate:number;proofability:number;authorityGradeCoverage:number;realityBoundCoverage:number;worldBeforeDigests:string[];worldAfterDigests:string[];authority:false;mayMintExecutionAuthority:false};
type Aggregate={transitionKey:string;operation:string;exactArgumentsDigest:string;observations:number;success:number;failure:number;unknown:number;proven:number;authorityGrade:number;realityBound:number;worldBeforeDigests:Set<string>;worldAfterDigests:Set<string>};
const MAX_INGESTED_TRAJECTORIES=100000;
const finite=(value:number)=>Number.isFinite(value)?value:0,ratio=(numerator:number,denominator:number)=>denominator>0?numerator/denominator:0,bounded=(value:number)=>Math.max(0,Math.min(1,finite(value)));
const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value as Record<string,unknown>).sort().map(key=>`${JSON.stringify(key)}:${canonical((value as Record<string,unknown>)[key])}`).join(",")}}`:JSON.stringify(value)??"undefined";
const trajectoryDigest=(trajectory:AuthorizedOutcomeTrajectory)=>crypto.createHash("sha256").update(canonical(AuthorizedOutcomeTrajectorySchema.parse(trajectory))).digest("hex");

/** A graph edge is keyed only by information known before execution. */
export function consequenceTransitionKey(input:Pick<AuthorizedOutcomeTrajectory,"operation"|"exactArgumentsDigest"|"worldBeforeDigest">):string{const before=input.worldBeforeDigest??"unknown-before";return `${input.operation}\n${input.exactArgumentsDigest}\n${before}`}
export function trajectoryToGraphObservation(trajectory:AuthorizedOutcomeTrajectory):ConsequenceGraphObservation{if(!trajectory.cryptographicallyVerified)throw new Error("consequence_graph_requires_cryptographically_verified_trajectory");return{transitionKey:consequenceTransitionKey(trajectory),operation:trajectory.operation,exactArgumentsDigest:trajectory.exactArgumentsDigest,...(trajectory.worldBeforeDigest?{worldBeforeDigest:trajectory.worldBeforeDigest}:{}),...(trajectory.worldAfterDigest?{worldAfterDigest:trajectory.worldAfterDigest}:{}),outcome:trajectory.outcome,cryptographicallyVerified:true,authorityGrade:trajectory.authorityGrade,realityBound:trajectory.realityBound,evidenceCount:trajectory.evidence.length}}
function emptyAggregate(observation:Pick<ConsequenceGraphObservation,"transitionKey"|"operation"|"exactArgumentsDigest">):Aggregate{return{...observation,observations:0,success:0,failure:0,unknown:0,proven:0,authorityGrade:0,realityBound:0,worldBeforeDigests:new Set(),worldAfterDigests:new Set()}}

export class ConsequenceGraph{
  private readonly aggregates=new Map<string,Aggregate>();
  private readonly ingestedTrajectories=new Map<string,ConsequenceGraphTrajectoryLedgerEntry>();

  ingest(raw:AuthorizedOutcomeTrajectory):ConsequenceGraphEdge{
    const trajectory=AuthorizedOutcomeTrajectorySchema.parse(raw),observation=trajectoryToGraphObservation(trajectory),digest=trajectoryDigest(trajectory),existing=this.ingestedTrajectories.get(trajectory.trajectoryId);
    if(existing){
      if(existing.trajectoryDigest!==digest||existing.transitionKey!==observation.transitionKey)throw new Error("consequence_graph_trajectory_id_content_mismatch");
      const edge=this.edge(existing.transitionKey);if(!edge)throw new Error("consequence_graph_ledger_edge_missing");
      return edge;
    }
    if(this.ingestedTrajectories.size>=MAX_INGESTED_TRAJECTORIES)throw new Error("consequence_graph_trajectory_ledger_capacity_exceeded");
    const row=this.aggregates.get(observation.transitionKey)??emptyAggregate(observation);
    row.observations++;if(observation.outcome==="SUCCESS")row.success++;else if(observation.outcome==="FAILURE")row.failure++;else row.unknown++;if(observation.evidenceCount>0)row.proven++;if(observation.authorityGrade)row.authorityGrade++;if(observation.realityBound)row.realityBound++;if(observation.worldBeforeDigest)row.worldBeforeDigests.add(observation.worldBeforeDigest);if(observation.worldAfterDigest)row.worldAfterDigests.add(observation.worldAfterDigest);
    this.aggregates.set(observation.transitionKey,row);
    this.ingestedTrajectories.set(trajectory.trajectoryId,{trajectoryId:trajectory.trajectoryId,trajectoryDigest:digest,transitionKey:observation.transitionKey});
    return this.edge(observation.transitionKey)!;
  }
  ingestMany(trajectories:AuthorizedOutcomeTrajectory[]):ConsequenceGraphEdge[]{for(const trajectory of trajectories)this.ingest(trajectory);return this.edges()}
  restore(raw:ConsequenceGraphPersistedState){
    const state=ConsequenceGraphPersistedStateSchema.parse(raw);this.aggregates.clear();this.ingestedTrajectories.clear();
    for(const edge of state.edges)this.aggregates.set(edge.transitionKey,{transitionKey:edge.transitionKey,operation:edge.operation,exactArgumentsDigest:edge.exactArgumentsDigest,observations:edge.observations,success:edge.success,failure:edge.failure,unknown:edge.unknown,proven:edge.proven,authorityGrade:edge.authorityGrade,realityBound:edge.realityBound,worldBeforeDigests:new Set(edge.worldBeforeDigests),worldAfterDigests:new Set(edge.worldAfterDigests)});
    for(const item of state.ingestedTrajectories){
      if(this.ingestedTrajectories.has(item.trajectoryId))throw new Error("consequence_graph_duplicate_trajectory_ledger_id");
      if(!this.aggregates.has(item.transitionKey))throw new Error("consequence_graph_ledger_edge_missing");
      this.ingestedTrajectories.set(item.trajectoryId,item);
    }
  }
  persistedState():ConsequenceGraphPersistedState{
    const edges:ConsequenceGraphPersistedEdge[]=[...this.aggregates.values()].sort((a,b)=>a.transitionKey.localeCompare(b.transitionKey)).map(row=>({transitionKey:row.transitionKey,operation:row.operation,exactArgumentsDigest:row.exactArgumentsDigest,observations:row.observations,success:row.success,failure:row.failure,unknown:row.unknown,proven:row.proven,authorityGrade:row.authorityGrade,realityBound:row.realityBound,worldBeforeDigests:[...row.worldBeforeDigests].sort(),worldAfterDigests:[...row.worldAfterDigests].sort(),authority:false,mayMintExecutionAuthority:false}));
    const ingestedTrajectories=[...this.ingestedTrajectories.values()].sort((a,b)=>a.trajectoryId.localeCompare(b.trajectoryId));
    return ConsequenceGraphPersistedStateSchema.parse({version:"CIEAV_CONSEQUENCE_GRAPH_STATE_V1",edges,ingestedTrajectories,authority:false,mayMintExecutionAuthority:false});
  }
  edge(transitionKey:string):ConsequenceGraphEdge|null{const row=this.aggregates.get(transitionKey);if(!row)return null;return{transitionKey,operation:row.operation,exactArgumentsDigest:row.exactArgumentsDigest,observations:row.observations,success:row.success,failure:row.failure,unknown:row.unknown,successRate:bounded(ratio(row.success,row.observations)),failureRate:bounded(ratio(row.failure,row.observations)),unknownRate:bounded(ratio(row.unknown,row.observations)),proofability:bounded(ratio(row.proven,row.observations)),authorityGradeCoverage:bounded(ratio(row.authorityGrade,row.observations)),realityBoundCoverage:bounded(ratio(row.realityBound,row.observations)),worldBeforeDigests:[...row.worldBeforeDigests].sort(),worldAfterDigests:[...row.worldAfterDigests].sort(),authority:false,mayMintExecutionAuthority:false}}
  edges():ConsequenceGraphEdge[]{return[...this.aggregates.keys()].sort().map(key=>this.edge(key)!).filter(Boolean)}
  forOperation(operation:string):ConsequenceGraphEdge[]{return this.edges().filter(edge=>edge.operation===operation)}
  bestObservedEdge(operation:string):ConsequenceGraphEdge|null{const candidates=this.forOperation(operation);if(!candidates.length)return null;return candidates.sort((a,b)=>{const score=(edge:ConsequenceGraphEdge)=>edge.successRate*4+edge.proofability*2+edge.authorityGradeCoverage+edge.realityBoundCoverage-edge.failureRate*3-edge.unknownRate*4+Math.min(edge.observations,100)/100;return score(b)-score(a)||b.observations-a.observations||a.transitionKey.localeCompare(b.transitionKey)})[0]}
  snapshot(){const edges=this.edges(),observations=edges.reduce((sum,edge)=>sum+edge.observations,0),unknown=edges.reduce((sum,edge)=>sum+edge.unknown,0);return{version:"CIEAV_CONSEQUENCE_GRAPH_V1" as const,edges,observations,ingestedTrajectories:this.ingestedTrajectories.size,unknownRate:bounded(ratio(unknown,observations)),authority:false as const,mayMintExecutionAuthority:false as const}}
}
