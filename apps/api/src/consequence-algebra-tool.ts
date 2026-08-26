import type {ActiveConsequenceNode,AlgebraAdmission,CausalRealityFence,ExecutionProposal} from "@cieav/contracts";
import {materializeExecutionProposal} from "@cieav/core/consequence-algebra";
import {CieavConsequenceAlgebraStore} from "./consequence-algebra-store.js";

export type ConsequenceAlgebraEvaluateOptions={
  requireProofability?:boolean;
  proofProviders?:Array<{ref:string;versionDigest?:string}>;
  reservationTtlSeconds?:number;
  aggregationLimits?:Record<string,number>;
};

/**
 * Zero-authority operational facade. It coordinates consequence admission and
 * lifecycle state but cannot authorize, commit, sign, lease credentials, mint
 * execution tickets, or dispatch an effect.
 */
export class CieavConsequenceAlgebraTool{
  constructor(readonly store:CieavConsequenceAlgebraStore){}

  async evaluateExecutionProposal(proposal:ExecutionProposal,options:ConsequenceAlgebraEvaluateOptions={}):Promise<{admission:AlgebraAdmission;consequenceRef:string;authority:false;executionAuthorityIssued:false}>{
    const materialization=materializeExecutionProposal(proposal);
    const result=await this.store.admit(materialization,options);
    return{admission:result.admission,consequenceRef:materialization.id,authority:false,executionAuthorityIssued:false};
  }

  async requireCausalPredecessors(proposal:ExecutionProposal,predecessorConsequenceRefs:string[],requiredOutcomes:CausalRealityFence["requiredOutcomes"]=["SUCCESS"]){
    return this.store.addFence(materializeExecutionProposal(proposal),predecessorConsequenceRefs,requiredOutcomes);
  }

  async assertReadyForAuthority(consequenceRef:string){
    const node=await this.store.ensureAdmitted(consequenceRef);
    await this.store.assertFencesSatisfied(consequenceRef);
    return{consequenceRef,node,readyForAuthority:true,authority:false as const,executionAuthorityIssued:false as const};
  }

  markAuthorized(consequenceRef:string){return this.store.mark(consequenceRef,"AUTHORIZED")}
  markCommitted(consequenceRef:string){return this.store.mark(consequenceRef,"COMMITTED")}
  markDispatched(consequenceRef:string){return this.store.mark(consequenceRef,"DISPATCHED")}
  markObserving(consequenceRef:string){return this.store.mark(consequenceRef,"OBSERVING")}
  quarantine(consequenceRef:string){return this.store.mark(consequenceRef,"QUARANTINED")}
  settle(consequenceRef:string,outcome:"SUCCESS"|"FAILURE"|"UNKNOWN"){return this.store.mark(consequenceRef,outcome==="SUCCESS"?"SETTLED_SUCCESS":outcome==="FAILURE"?"SETTLED_FAILURE":"SETTLED_UNKNOWN")}
  settleTask(taskId:string,outcome:"SUCCESS"|"FAILURE"|"UNKNOWN"){return this.store.markTask(taskId,outcome==="SUCCESS"?"SETTLED_SUCCESS":outcome==="FAILURE"?"SETTLED_FAILURE":"SETTLED_UNKNOWN")}

  async runtime(){
    const [stats,nodes,reservations,proofPlans,fences,aggregation]=await Promise.all([this.store.stats(),this.store.listNodes(),this.store.listReservations(),this.store.listProofPlans(),this.store.listFences(),this.store.listAggregation()]);
    return{version:"CIEAV_CONSEQUENCE_ALGEBRA_TOOL_V1",stats,nodes,reservations,proofPlans,fences,aggregation,authority:false as const,mayMintExecutionAuthority:false as const};
  }

  async close(){await this.store.close()}
}

export const CONSEQUENCE_ALGEBRA_TOOL_AUTHORITY=false as const;
export const CONSEQUENCE_ALGEBRA_TOOL_MAY_MINT_EXECUTION_AUTHORITY=false as const;
