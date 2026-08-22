import {AuthorityGradeSemanticAssessmentSchema,AuthorityGradeSettlementBundleSchema,type AuthorityGradeSemanticAssessment,type AuthorityGradeSettlementBundle} from "@cieav/contracts/authority-grade-settlement";
import {digest,verifyPermissionGraph} from "./execution-fabric.js";

const riskRank={LOW:0,MEDIUM:1,HIGH:2,CRITICAL:3} as const;
const trustedProof=new Set(["CIEAV_OBSERVER","TRUSTED_ADAPTER","EXTERNAL_SIGNED","HUMAN_ATTESTATION"]);
const member=(items:string[],value:string)=>items.includes("*")||items.includes(value);
const inWindow=(at:string,start:string,end:string)=>Date.parse(at)>=Date.parse(start)&&Date.parse(at)<=Date.parse(end);
const effectKey=(intentId:string,effect:unknown)=>digest({v:1,intentId,effect});

function proofOutcome(bundle:AuthorityGradeSettlementBundle){
  const assessment=bundle.proofCase.assessment;
  const supportingTrusted=assessment.supporting.some(o=>trustedProof.has(o.provenance??"UNVERIFIED"));
  const contradictingTrusted=assessment.contradicting.some(o=>trustedProof.has(o.provenance??"UNVERIFIED"));
  if(assessment.status==="PROVEN"&&supportingTrusted&&!contradictingTrusted)return{outcome:"SUCCESS" as const,trusted:true};
  if((assessment.status==="CONTRADICTED"||assessment.status==="FAILED")&&contradictingTrusted)return{outcome:"FAILURE" as const,trusted:true};
  return{outcome:"UNKNOWN" as const,trusted:supportingTrusted||contradictingTrusted};
}

export function assessAuthorityGradeSettlement(raw:AuthorityGradeSettlementBundle):AuthorityGradeSemanticAssessment{
  const b=AuthorityGradeSettlementBundleSchema.parse(raw),authorityFailures:string[]=[],settlementFailures:string[]=[],warnings:string[]=[],refs=new Set<string>();
  const {task,proposal,authorization,permissionGraph:graph,identityAttestation:att,credentialLease:lease,realityBoundCommit:commit,executionTicket:ticket,proofCase:proof}=b;
  for(const [kind,id] of [["task",task.id],["proposal",proposal.id],["attestation",att.id],["lease",lease.id],["reality-commit",commit.id],["ticket",ticket.id],["proof",proof.id]] as const)refs.add(`${kind}:${id}`);

  if(!verifyPermissionGraph(graph))authorityFailures.push("permission_graph_integrity_invalid");
  if(graph.scopeDeviceId!==proposal.scopeDeviceId||graph.rootIntentId!==proposal.intentId)authorityFailures.push("permission_graph_scope_mismatch");
  if(authorization.decision!=="ALLOW")authorityFailures.push("formal_authorization_not_allow");
  if(authorization.graphDigest!==graph.digest||authorization.intentId!==proposal.intentId||authorization.subjectId!==proposal.subjectId||authorization.toolId!==proposal.toolId||authorization.operation!==proposal.operation)authorityFailures.push("formal_authorization_binding_mismatch");

  if(task.id!==proposal.taskId||task.intentId!==proposal.intentId||task.scopeDeviceId!==proposal.scopeDeviceId||task.actor.id!==proposal.subjectId)authorityFailures.push("task_proposal_binding_mismatch");
  if(task.realityBoundCommitId!==commit.id||!task.realityCommitConsumedAt)authorityFailures.push("task_reality_commit_binding_missing");
  if(att.id!==proposal.identityAttestationId||att.subjectId!==proposal.subjectId)authorityFailures.push("identity_attestation_binding_mismatch");
  if(!inWindow(proposal.createdAt,att.issuedAt,att.expiresAt))authorityFailures.push("identity_attestation_not_valid_at_proposal");

  if(lease.id!==proposal.credentialLeaseId||lease.identityAttestationId!==att.id||lease.scopeDeviceId!==proposal.scopeDeviceId)authorityFailures.push("credential_lease_binding_mismatch");
  if(!lease.allowedIntentIds.includes(proposal.intentId)||!member(lease.allowedToolIds,proposal.toolId)||!member(lease.allowedOperations,proposal.operation))authorityFailures.push("credential_lease_scope_mismatch");
  if(!(["*",`tool:${proposal.toolId}`,proposal.toolId].includes(lease.audience)))authorityFailures.push("credential_lease_audience_mismatch");
  if(riskRank[proposal.risk]>riskRank[lease.maxRisk])authorityFailures.push("credential_lease_risk_exceeded");

  if(commit.status!=="CONSUMED"||!commit.consumedAt)authorityFailures.push("reality_bound_commit_not_consumed");
  if(commit.taskId!==proposal.taskId||commit.intentId!==proposal.intentId)authorityFailures.push("reality_bound_commit_scope_mismatch");
  if(task.commitmentId&&commit.commitmentId!==task.commitmentId)authorityFailures.push("reality_bound_commit_commitment_mismatch");
  if(commit.principal.id!==proposal.subjectId)authorityFailures.push("reality_bound_commit_principal_mismatch");
  if(commit.proposalDigest!==digest(proposal))authorityFailures.push("reality_bound_commit_proposal_digest_mismatch");
  if(commit.preStateDigest!==proposal.realityWitness.digest||commit.expectedPostStateDigest!==proposal.expectedPostStateDigest||commit.proofObligationDigest!==proposal.proofObligationDigest)authorityFailures.push("reality_bound_commit_state_or_proof_mismatch");
  if(commit.effectKey!==effectKey(proposal.intentId,proposal.semanticEffect))authorityFailures.push("reality_bound_commit_effect_mismatch");

  if(ticket.status!=="CONSUMED"||!ticket.consumedAt)authorityFailures.push("execution_ticket_not_consumed");
  if(ticket.proposalId!==proposal.id||ticket.intentId!==proposal.intentId||ticket.taskId!==proposal.taskId||ticket.toolId!==proposal.toolId||ticket.realityBoundCommitId!==commit.id||ticket.credentialLeaseId!==lease.id)authorityFailures.push("execution_ticket_binding_mismatch");
  if(ticket.authorizationDigest!==digest(authorization))authorityFailures.push("execution_ticket_authorization_digest_mismatch");
  const expectedRoute=digest({toolId:proposal.toolId,protocol:proposal.protocol,operation:proposal.operation,target:proposal.target??null,normalizedArgumentsDigest:proposal.normalizedArgumentsDigest});
  if(ticket.routeDigest!==expectedRoute)authorityFailures.push("execution_ticket_route_digest_mismatch");
  if(ticket.consumedAt&&!inWindow(ticket.consumedAt,ticket.issuedAt,ticket.expiresAt))authorityFailures.push("execution_ticket_consumption_outside_window");
  if(ticket.consumedAt&&!inWindow(ticket.consumedAt,lease.issuedAt,lease.expiresAt))authorityFailures.push("credential_lease_not_valid_at_execution");
  if(lease.revokedAt&&ticket.consumedAt&&Date.parse(lease.revokedAt)<=Date.parse(ticket.consumedAt))authorityFailures.push("credential_lease_revoked_before_execution");

  const audit=b.executionAudit;
  const hasAuthorize=audit.some(e=>e.proposalId===proposal.id&&e.phase==="AUTHORIZE"&&e.outcome==="PASS");
  const hasCommit=audit.some(e=>e.ticketId===ticket.id&&e.phase==="COMMIT"&&e.outcome==="PASS");
  const hasRoute=audit.some(e=>e.ticketId===ticket.id&&e.phase==="ROUTE"&&e.outcome==="PASS");
  const attempts=audit.filter(e=>e.ticketId===ticket.id&&e.phase==="EXECUTE");
  if(!hasAuthorize)authorityFailures.push("execution_audit_authorize_pass_missing");
  if(!hasCommit)authorityFailures.push("execution_audit_commit_pass_missing");
  if(!hasRoute)authorityFailures.push("execution_audit_route_pass_missing");
  if(attempts.length!==1)authorityFailures.push(attempts.length?"multiple_execution_attempts_for_ticket":"execution_attempt_audit_missing");
  for(const event of audit.filter(e=>e.proposalId===proposal.id||e.ticketId===ticket.id))refs.add(`audit:${event.id}`);

  if(task.proofCaseId!==proof.id||!task.settlement||!task.settledAt)settlementFailures.push("task_proof_settlement_binding_missing");
  if(proof.intentId!==proposal.intentId)settlementFailures.push("proof_intent_mismatch");
  const po=proofOutcome(b);
  if(task.settlement==="PROVEN"&&po.outcome!=="SUCCESS")settlementFailures.push("task_success_not_supported_by_proof");
  if(task.settlement==="DISPROVEN"&&po.outcome!=="FAILURE")settlementFailures.push("task_failure_not_supported_by_proof");
  if(task.settlement==="UNKNOWN"&&po.outcome!=="UNKNOWN")warnings.push("task_preserves_unknown_despite_directional_proof");
  if(proof.assessment.missingRequired.length)settlementFailures.push("proof_required_evidence_missing");
  if(!po.trusted&&po.outcome!=="UNKNOWN")settlementFailures.push("independent_trusted_proof_required");

  const authorityBindingsVerified=authorityFailures.length===0;
  const settlementBindingsVerified=settlementFailures.length===0;
  const realityBound=authorityBindingsVerified;
  const outcome=authorityBindingsVerified&&settlementBindingsVerified?po.outcome:"UNKNOWN";
  return AuthorityGradeSemanticAssessmentSchema.parse({
    version:"CIEAV_AUTHORITY_GRADE_SEMANTIC_ASSESSMENT_V1",
    authorityBindingsVerified,
    settlementBindingsVerified,
    realityBound,
    trustedOutcomeEvidence:po.trusted,
    outcome,
    authorityFailures:[...new Set(authorityFailures)],
    settlementFailures:[...new Set(settlementFailures)],
    warnings:[...new Set(warnings)],
    evidenceRefs:[...refs].sort(),
    authority:false,
    productionAuthority:false
  });
}

export const AUTHORITY_GRADE_SETTLEMENT_AUTHORITY=false as const;
export const AUTHORITY_GRADE_SETTLEMENT_MAY_MINT_EXECUTION_AUTHORITY=false as const;
