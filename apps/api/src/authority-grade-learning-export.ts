import {AuthorityGradeSettlementBundleSchema,type AuthorityGradeSettlementBundle} from "@cieav/contracts/authority-grade-settlement";
import {assessAuthorityGradeSettlement,buildAuthorizedOutcomeTrajectory} from "@cieav/core/authority-grade-settlement";
import type {CieavAgentKernelStore} from "./agent-kernel.js";
import type {CieavProofStore} from "./proof-api.js";

export type AuthorityGradeExportOptions={
  redactionProfile:string;
  consentScope?:string;
};

export type AuthorityGradeLearningExport={
  version:"CIEAV_AUTHORITY_GRADE_LEARNING_EXPORT_V1";
  bundle:AuthorityGradeSettlementBundle;
  assessment:ReturnType<typeof assessAuthorityGradeSettlement>;
  trajectory:ReturnType<typeof buildAuthorizedOutcomeTrajectory>;
  authority:false;
  productionAuthority:false;
};

/**
 * Joins durable records only after each underlying store has authenticated its
 * own persisted envelope. This is deliberately separate from receipt export:
 * signed receipts remain useful evidence but can never synthesize an
 * authority-grade trajectory by themselves.
 */
export async function exportAuthorityGradeTrajectory(
  kernel:CieavAgentKernelStore,
  proofStore:CieavProofStore,
  executionTicketId:string,
  options:AuthorityGradeExportOptions
):Promise<AuthorityGradeLearningExport>{
  if(!options.redactionProfile.trim())throw new Error("authority_grade_redaction_profile_required");

  // Every call below forces the corresponding HMAC-authenticated store to load
  // and verify itself before returning durable state.
  const ticket=(await kernel.executionFabric.listTickets()).find(x=>x.id===executionTicketId);
  if(!ticket)throw new Error("authority_grade_execution_ticket_not_found");

  const record=await kernel.executionFabric.getProposalRecord(ticket.proposalId);
  if(!record)throw new Error("authority_grade_execution_proposal_not_found");
  const {proposal,decision:authorization}=record;

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

  const permissionGraph=graphs.find(x=>x.digest===authorization.graphDigest);
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

  const bundle=AuthorityGradeSettlementBundleSchema.parse({
    version:"CIEAV_AUTHORITY_GRADE_SETTLEMENT_BUNDLE_V1",
    task,
    taskEvents,
    proposal,
    authorization,
    permissionGraph,
    identityAttestation,
    credentialLease,
    realityBoundCommit,
    executionTicket:ticket,
    executionAudit:audit,
    proofCase,
    redactionProfile:options.redactionProfile.trim(),
    ...(options.consentScope?.trim()?{consentScope:options.consentScope.trim()}:{}),
    sourceIntegrity:{
      agentKernelAuthenticated:true,
      intentRealityAuthenticated:true,
      executionFabricAuthenticated:true,
      proofStoreAuthenticated:true,
      executionAuditChainVerified:true,
      identityAttestationVerified:true
    },
    authority:false,
    productionAuthority:false
  });

  const assessment=assessAuthorityGradeSettlement(bundle);
  const trajectory=buildAuthorizedOutcomeTrajectory(bundle);
  return{
    version:"CIEAV_AUTHORITY_GRADE_LEARNING_EXPORT_V1",
    bundle,
    assessment,
    trajectory,
    authority:false,
    productionAuthority:false
  };
}
