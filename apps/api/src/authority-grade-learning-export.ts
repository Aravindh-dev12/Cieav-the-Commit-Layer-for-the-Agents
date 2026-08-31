import {AuthorityGradeSettlementAssessmentSchema,AuthorityGradeSettlementBundleSchema,type AuthorityGradeSettlementAssessment,type AuthorityGradeSettlementBundle} from "@cieav/contracts/authority-grade-settlement";
import {assessAuthorityGradeSettlement} from "@cieav/core/authority-grade-settlement";
import {buildAuthorizedOutcomeTrajectory} from "@cieav/core/authority-grade-trajectory";
import {digest} from "@cieav/core/execution-fabric";
import type {AuthorizedOutcomeTrajectory} from "@cieav/contracts/consequence-intelligence";
import type {CieavAgentKernelStore} from "./agent-kernel.js";
import type {CieavProofStore} from "./proof-api.js";

export type AuthorityGradeExportOptions={
  redactionProfile:string;
  consentScope?:string;
};

export type AuthorityGradeLearningExport={
  version:"CIEAV_AUTHORITY_GRADE_LEARNING_EXPORT_V1";
  bundle:AuthorityGradeSettlementBundle;
  assessment:AuthorityGradeSettlementAssessment;
  trajectory:AuthorizedOutcomeTrajectory;
  authority:false;
  productionAuthority:false;
};

/**
 * Trusted local export boundary. Caller-supplied bundle integrity flags do not
 * exist: every artifact is loaded through the authenticated local stores. The
 * pure core verifier checks semantic bindings only; this function is the sole
 * layer that may assert cryptographicallyVerified=true after those reads.
 */
export async function exportAuthorityGradeTrajectory(
  kernel:CieavAgentKernelStore,
  proofStore:CieavProofStore,
  executionTicketId:string,
  options:AuthorityGradeExportOptions
):Promise<AuthorityGradeLearningExport>{
  const redactionProfile=options.redactionProfile.trim();
  if(!redactionProfile)throw new Error("authority_grade_redaction_profile_required");

  const ticket=(await kernel.executionFabric.listTickets()).find(x=>x.id===executionTicketId);
  if(!ticket)throw new Error("authority_grade_execution_ticket_not_found");
  if(ticket.status!=="CONSUMED"||!ticket.consumedAt)throw new Error("authority_grade_consumed_ticket_required");

  const record=await kernel.executionFabric.getProposalRecord(ticket.proposalId);
  if(!record)throw new Error("authority_grade_execution_proposal_not_found");
  const {proposal,decision:authorization,trustedToolBinding,canonicalRealityResolution,consequenceBundle}=record;

  const task=await kernel.get(ticket.taskId);
  if(!task)throw new Error("authority_grade_agent_task_not_found");
  if(task.scopeDeviceId!==proposal.scopeDeviceId)throw new Error("authority_grade_task_device_scope_mismatch");

  const [taskEvents,graphs,attestations,leases,audit,commits]=await Promise.all([
    kernel.listEvents(task.id),
    kernel.executionFabric.listPermissionGraphs(),
    kernel.executionFabric.listAttestations(),
    kernel.executionFabric.listLeases(),
    kernel.executionFabric.listAudit(),
    kernel.intentReality.listRealityBoundCommits()
  ]);

  const permissionGraph=graphs.find(x=>x.digest===authorization.graphDigest&&x.scopeDeviceId===proposal.scopeDeviceId&&x.rootIntentId===proposal.intentId);
  if(!permissionGraph)throw new Error("authority_grade_permission_graph_not_found");
  const identityAttestation=attestations.find(x=>x.id===proposal.identityAttestationId);
  if(!identityAttestation)throw new Error("authority_grade_identity_attestation_not_found");
  const credentialLease=leases.find(x=>x.id===proposal.credentialLeaseId);
  if(!credentialLease)throw new Error("authority_grade_credential_lease_not_found");
  const realityBoundCommit=commits.find(x=>x.id===ticket.realityBoundCommitId);
  if(!realityBoundCommit)throw new Error("authority_grade_reality_bound_commit_not_found");
  if(!task.proofCaseId)throw new Error("authority_grade_task_proof_not_bound");
  const proofCase=await proofStore.get(task.scopeDeviceId,task.proofCaseId);
  if(!proofCase)throw new Error("authority_grade_proof_case_not_found");

  const executionAudit=audit.filter(x=>x.proposalId===proposal.id||x.ticketId===ticket.id);
  const bundle=AuthorityGradeSettlementBundleSchema.parse({
    version:"CIEAV_AUTHORITY_GRADE_SETTLEMENT_BUNDLE_V1",
    task,taskEvents,proposal,authorization,permissionGraph,identityAttestation,credentialLease,realityBoundCommit,executionTicket:ticket,
    ...(trustedToolBinding?{trustedToolBinding}:{}),
    ...(canonicalRealityResolution?{canonicalRealityResolution}:{}),
    ...(consequenceBundle?{consequenceBundle}:{}),
    executionAudit,proofCase,redactionProfile,
    ...(options.consentScope?.trim()?{consentScope:options.consentScope.trim()}:{}),
    authority:false,productionAuthority:false
  });

  const semantic=assessAuthorityGradeSettlement(bundle);
  const hardFailures=[...semantic.authorityFailures,...semantic.settlementFailures];
  const cryptographicallyVerified=true;
  const authorityGrade=cryptographicallyVerified&&semantic.authorityBindingsVerified&&semantic.settlementBindingsVerified&&semantic.realityBound&&semantic.trustedOutcomeEvidence&&hardFailures.length===0;
  const eligible=authorityGrade&&semantic.outcome!=="UNKNOWN";
  const assessment=AuthorityGradeSettlementAssessmentSchema.parse({
    version:"CIEAV_AUTHORITY_GRADE_SETTLEMENT_ASSESSMENT_V1",
    eligible,
    authorityGrade,
    realityBound:semantic.realityBound,
    cryptographicallyVerified,
    trustedOutcomeEvidence:semantic.trustedOutcomeEvidence,
    outcome:authorityGrade?semantic.outcome:"UNKNOWN",
    hardFailures,
    warnings:semantic.warnings,
    evidenceRefs:[...semantic.evidenceRefs,`bundle:${digest(bundle)}`].sort(),
    authority:false,
    productionAuthority:false
  });

  const trajectory=buildAuthorizedOutcomeTrajectory(bundle,assessment);
  return{version:"CIEAV_AUTHORITY_GRADE_LEARNING_EXPORT_V1",bundle,assessment,trajectory,authority:false,productionAuthority:false};
}
