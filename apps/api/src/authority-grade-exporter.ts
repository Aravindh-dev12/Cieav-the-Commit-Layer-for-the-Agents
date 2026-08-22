import {AuthorityGradeSettlementAssessmentSchema,AuthorityGradeSettlementBundleSchema,type AuthorityGradeSettlementAssessment} from "@cieav/contracts/authority-grade-settlement";
import {assessAuthorityGradeSettlement,buildAuthorizedOutcomeTrajectory,digest} from "@cieav/core";
import type {CieavAgentKernelStore} from "./agent-kernel.js";
import type {CieavProofStore} from "./proof-api.js";

export type TrustedTrajectoryExport={
  assessment:AuthorityGradeSettlementAssessment;
  trajectory:ReturnType<typeof buildAuthorizedOutcomeTrajectory>;
  authority:false;
  productionAuthority:false;
};

/**
 * Trusted local exporter. It never accepts caller assertions about source
 * integrity. Every artifact is loaded through the HMAC-authenticated stores;
 * Execution Fabric additionally verifies its audit hash chain and locally
 * issued identity-attestation signatures before returning any record.
 */
export class CieavAuthorityGradeExporter{
  constructor(private readonly kernel:CieavAgentKernelStore,private readonly proofStore:CieavProofStore){}

  async exportByTicket(ticketId:string,redactionProfile:string,consentScope?:string):Promise<TrustedTrajectoryExport>{
    const tickets=await this.kernel.executionFabric.listTickets();
    const ticket=tickets.find(x=>x.id===ticketId);
    if(!ticket)throw new Error("authority_grade_ticket_not_found");
    if(ticket.status!=="CONSUMED"||!ticket.consumedAt)throw new Error("authority_grade_consumed_ticket_required");

    const record=await this.kernel.executionFabric.getProposalRecord(ticket.proposalId);
    if(!record)throw new Error("authority_grade_proposal_not_found");
    const {proposal,decision}=record;
    const task=await this.kernel.get(ticket.taskId);
    if(!task)throw new Error("authority_grade_task_not_found");
    const taskEvents=await this.kernel.listEvents(task.id);
    const commits=await this.kernel.intentReality.listRealityBoundCommits();
    const realityBoundCommit=commits.find(x=>x.id===ticket.realityBoundCommitId);
    if(!realityBoundCommit)throw new Error("authority_grade_reality_commit_not_found");

    const [attestations,leases,graphs,audit]=await Promise.all([
      this.kernel.executionFabric.listAttestations(),
      this.kernel.executionFabric.listLeases(),
      this.kernel.executionFabric.listPermissionGraphs(),
      this.kernel.executionFabric.listAudit()
    ]);
    const identityAttestation=attestations.find(x=>x.id===proposal.identityAttestationId);
    if(!identityAttestation)throw new Error("authority_grade_attestation_not_found");
    const credentialLease=leases.find(x=>x.id===proposal.credentialLeaseId);
    if(!credentialLease)throw new Error("authority_grade_lease_not_found");
    const permissionGraph=graphs.find(x=>x.digest===decision.graphDigest&&x.scopeDeviceId===proposal.scopeDeviceId&&x.rootIntentId===proposal.intentId);
    if(!permissionGraph)throw new Error("authority_grade_permission_graph_not_found");
    if(!task.proofCaseId)throw new Error("authority_grade_proof_binding_missing");
    const proofCase=await this.proofStore.get(task.scopeDeviceId,task.proofCaseId);
    if(!proofCase)throw new Error("authority_grade_proof_not_found");

    const bundle=AuthorityGradeSettlementBundleSchema.parse({
      version:"CIEAV_AUTHORITY_GRADE_SETTLEMENT_BUNDLE_V1",
      task,taskEvents,proposal,authorization:decision,permissionGraph,identityAttestation,credentialLease,realityBoundCommit,executionTicket:ticket,
      executionAudit:audit.filter(x=>x.proposalId===proposal.id||x.ticketId===ticket.id),
      proofCase,redactionProfile,...(consentScope?{consentScope}:{}),authority:false,productionAuthority:false
    });
    const semantic=assessAuthorityGradeSettlement(bundle);
    const cryptographicallyVerified=true;
    const authorityGrade=cryptographicallyVerified&&semantic.authorityBindingsVerified&&semantic.realityBound;
    const hardFailures=[...semantic.authorityFailures,...semantic.settlementFailures];
    const eligible=authorityGrade&&semantic.settlementBindingsVerified&&semantic.trustedOutcomeEvidence&&semantic.outcome!=="UNKNOWN";
    const assessment=AuthorityGradeSettlementAssessmentSchema.parse({
      version:"CIEAV_AUTHORITY_GRADE_SETTLEMENT_ASSESSMENT_V1",
      eligible,authorityGrade,realityBound:semantic.realityBound,cryptographicallyVerified,trustedOutcomeEvidence:semantic.trustedOutcomeEvidence,
      outcome:semantic.outcome,hardFailures,warnings:semantic.warnings,evidenceRefs:[...semantic.evidenceRefs,`bundle:${digest(bundle)}`].sort(),authority:false,productionAuthority:false
    });
    const trajectory=buildAuthorizedOutcomeTrajectory(bundle,assessment);
    return{assessment,trajectory,authority:false,productionAuthority:false};
  }
}
