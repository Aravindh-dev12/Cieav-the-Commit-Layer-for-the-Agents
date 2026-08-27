import type {ActiveConsequenceNode,AlgebraAdmission,CausalRealityFence,ConsequenceAlgebraPolicy,ConsequenceInvariantRule,ConsequenceRelationRule,ExecutionProposal} from "@cieav/contracts";
import {materializeExecutionProposal} from "@cieav/core/consequence-algebra";
import {CieavConsequenceAlgebraStore} from "./consequence-algebra-store.js";

export type ConsequenceAlgebraEvaluateOptions={requireProofability?:boolean;proofProviders?:Array<{ref:string;versionDigest?:string}>;reservationTtlSeconds?:number;aggregationLimits?:Record<string,number>};

/** Zero-authority production facade over CIEAV consequence coordination. */
export class CieavConsequenceAlgebraTool{
  constructor(readonly store:CieavConsequenceAlgebraStore){}
  async evaluateExecutionProposal(proposal:ExecutionProposal,options:ConsequenceAlgebraEvaluateOptions={}):Promise<{admission:AlgebraAdmission;consequenceRef:string;authority:false;executionAuthorityIssued:false}>{const materialization=materializeExecutionProposal(proposal),result=await this.store.admit(materialization,options);return{admission:result.admission,consequenceRef:materialization.id,authority:false,executionAuthorityIssued:false}}
  async requireCausalPredecessors(proposal:ExecutionProposal,predecessorConsequenceRefs:string[],requiredOutcomes:CausalRealityFence["requiredOutcomes"]=["SUCCESS"]){return this.store.addFence(materializeExecutionProposal(proposal),predecessorConsequenceRefs,requiredOutcomes)}
  async assertReadyForAuthority(consequenceRef:string){const node=await this.store.ensureAdmitted(consequenceRef);await this.store.assertProofPlanValid(consequenceRef);await this.store.assertFencesSatisfied(consequenceRef);return{consequenceRef,node,readyForAuthority:true,authority:false as const,executionAuthorityIssued:false as const}}
  markAuthorized(consequenceRef:string){return this.store.mark(consequenceRef,"AUTHORIZED")}
  markCommitted(consequenceRef:string){return this.store.mark(consequenceRef,"COMMITTED")}
  markDispatched(consequenceRef:string){return this.store.mark(consequenceRef,"DISPATCHED")}
  markObserving(consequenceRef:string){return this.store.mark(consequenceRef,"OBSERVING")}
  quarantine(consequenceRef:string){return this.store.mark(consequenceRef,"QUARANTINED")}
  settle(consequenceRef:string,outcome:"SUCCESS"|"FAILURE"|"UNKNOWN"){return this.store.mark(consequenceRef,outcome==="SUCCESS"?"SETTLED_SUCCESS":outcome==="FAILURE"?"SETTLED_FAILURE":"SETTLED_UNKNOWN")}
  settleTask(taskId:string,outcome:"SUCCESS"|"FAILURE"|"UNKNOWN"){return this.store.markTask(taskId,outcome==="SUCCESS"?"SETTLED_SUCCESS":outcome==="FAILURE"?"SETTLED_FAILURE":"SETTLED_UNKNOWN")}
  reconcileUnknown(consequenceRef:string,outcome:"SUCCESS"|"FAILURE",evidenceRefs:string[],realityDigest:string){return this.store.reconcileUnknown(consequenceRef,outcome,evidenceRefs,realityDigest)}
  getPolicy(){return this.store.getPolicy()}
  updatePolicy(policy:ConsequenceAlgebraPolicy){return this.store.putPolicy(policy)}
  listRelationRules(){return this.store.listRelationRules()}
  upsertRelationRule(rule:ConsequenceRelationRule){return this.store.putRelationRule(rule)}
  removeRelationRule(id:string){return this.store.removeRelationRule(id)}
  listInvariantRules(){return this.store.listInvariantRules()}
  upsertInvariantRule(rule:ConsequenceInvariantRule){return this.store.putInvariantRule(rule)}
  removeInvariantRule(id:string){return this.store.removeInvariantRule(id)}
  recoverOnStartup(){return this.store.recoverOnStartup()}
  async runtime(){const [stats,policy,relationRules,invariantRules,nodes,reservations,proofPlans,fences,aggregation,audit]=await Promise.all([this.store.stats(),this.store.getPolicy(),this.store.listRelationRules(),this.store.listInvariantRules(),this.store.listNodes(),this.store.listReservations(),this.store.listProofPlans(),this.store.listFences(),this.store.listAggregation(),this.store.listAudit()]);return{version:"CIEAV_CONSEQUENCE_ALGEBRA_TOOL_V2",stats,policy,relationRules,invariantRules,nodes,reservations,proofPlans,fences,aggregation,audit,authority:false as const,mayMintExecutionAuthority:false as const}}
  async close(){await this.store.close()}
}
export const CONSEQUENCE_ALGEBRA_TOOL_AUTHORITY=false as const;
export const CONSEQUENCE_ALGEBRA_TOOL_MAY_MINT_EXECUTION_AUTHORITY=false as const;
