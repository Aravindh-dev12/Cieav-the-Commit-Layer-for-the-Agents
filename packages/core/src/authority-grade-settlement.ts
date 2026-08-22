import {AuthorityGradeSettlementAssessmentSchema,AuthorityGradeSettlementBundleSchema,type AuthorityGradeSettlementAssessment,type AuthorityGradeSettlementBundle} from "@cieav/contracts/authority-grade-settlement";
import {digest,verifyPermissionGraph} from "./execution-fabric.js";

const riskRank={LOW:0,MEDIUM:1,HIGH:2,CRITICAL:3} as const;
const trustedProof=new Set(["CIEAV_OBSERVER","TRUSTED_ADAPTER","EXTERNAL_SIGNED","HUMAN_ATTESTATION"]);
const member=(items:string[],value:string)=>items.includes("*")||items.includes(value);
const inWindow=(at:string,start:string,end:string)=>Date.parse(at)>=Date.parse(start)&&Date.parse(at)<=Date.parse(end);
const effectKey=(intentId:string,effect:unknown)=>digest({v:1,intentId,effect});

function proofOutcome(bundle:AuthorityGradeSettlementBundle){
  const proof=bundle.proofCase,assessment=proof.assessment;
  const supportingTrusted=assessment.supporting.some(o=>trustedProof.has(o.provenance??"UNVERIFIED"));
  const contradictingTrusted=assessment.contradicting.some(o=>trustedProof.has(o.provenance??"UNVERIFIED"));
  if(assessment.status==="PROVEN"&&supportingTrusted&&!contradictingTrusted)return{outcome:"SUCCESS" as const,trusted:true};
  if((assessment.status==="CONTRADICTED"||assessment.status==="FAILED")&&contradictingTrusted)return{outcome:"FAILURE" as const,trusted:true};
  return{outcome:"UNKNOWN" as const,trusted:supportingTrusted||contradictingTrusted};
}

export function assessAuthorityGradeSettlement(raw:AuthorityGradeSettlementBundle):AuthorityGradeSettlementAssessment{
  const b=AuthorityGradeSettlementBundleSchema.parse(raw),failures:string[]=[],warnings:string[]=[],refs=new Set<string>();
  const {task,proposal,authorization,permissionGraph:graph,identityAttestation:att,credentialLease:lease,realityBoundCommit:commit,executionTicket:ticket,proofCase:proof}=b;
  for(const [kind,id] of [["task",task.id],["proposal",proposal.id],["attestation",att.id],["lease",lease.id],["reality-commit",commit.id],["ticket",ticket.id],["proof",proof.id]] as const)refs.add(`${kind}:${id}`);

  if(!verifyPermissionGraph(graph))failures.push("permission_graph_integrity_invalid");
  if(graph.scopeDeviceId!==proposal.scopeDeviceId||graph.rootIntentId!==proposal.intentId)failures.push("permission_graph_scope_mismatch");
  if(authorization.decision!=="ALLOW")failures.push("formal_authorization_not_allow");
  if(authorization.graphDigest!==graph.digest||authorization.intentId!==proposal.intentId||authorization.subjectId!==proposal.subjectId||authorization.toolId!==proposal.toolId||authorization.operation!==proposal.operation)failures.push("formal_authorization_binding_mismatch");

  if(task.id!==proposal.taskId||task.intentId!==proposal.intentId||task.scopeDeviceId!==proposal.scopeDeviceId||task.actor.id!==proposal.subjectId)failures.push("task_proposal_binding_mismatch");
  if(task.realityBoundCommitId!==commit.id||!task.realityCommitConsumedAt)failures.push("task_reality_commit_binding_missing");
  if(task.proofCaseId!==proof.id||!task.settlement||!task.settledAt)failures.push("task_proof_settlement_binding_missing");

  if(att.id!==proposal.identityAttestationId||att.subjectId!==proposal.subjectId)failures.push("identity_attestation_binding_mismatch");
  if(!inWindow(proposal.createdAt,att.issuedAt,att.expiresAt))failures.push("identity_attestation_not_valid_at_proposal");

  if(lease.id!==proposal.credentialLeaseId||lease.identityAttestationId!==att.id||lease.scopeDeviceId!==proposal.scopeDeviceId)failures.push("credential_lease_binding_mismatch");
  if(!lease.allowedIntentIds.includes(proposal.intentId)||!member(lease.allowedToolIds,proposal.toolId)||!member(lease.allowedOperations,proposal.operation))failures.push("credential_lease_scope_mismatch");
  if(!(["*",`tool:${proposal.toolId}`,proposal.toolId].includes(lease.audience)))failures.push("credential_lease_audience_mismatch");
  if(riskRank[proposal.risk]>riskRank[lease.maxRisk])failures.push("credential_lease_risk_exceeded");

  if(commit.status!=="CONSUMED"||!commit.consumedAt)failures.push("reality_bound_commit_not_consumed");
  if(commit.taskId!==proposal.taskId||commit.intentId!==proposal.intentId)failures.push("reality_bound_commit_scope_mismatch");
  if(task.commitmentId&&commit.commitmentId!==task.commitmentId)failures.push("reality_bound_commit_commitment_mismatch");
  if(commit.principal.id!==proposal.subjectId)failures.push("reality_bound_commit_principal_mismatch");
  if(commit.preStateDigest!==proposal.realityWitness.digest||commit.expectedPostStateDigest!==proposal.expectedPostStateDigest||commit.proofObligationDigest!==proposal.proofObligationDigest)failures.push("reality_bound_commit_state_or_proof_mismatch");
  if(commit.effectKey!==effectKey(proposal.intentId,proposal.semanticEffect))failures.push("reality_bound_commit_effect_mismatch");

  if(ticket.status!=="CONSUMED"||!ticket.consumedAt)failures.push("execution_ticket_not_consumed");
  if(ticket.proposalId!==proposal.id||ticket.intentId!==proposal.intentId||ticket.taskId!==proposal.taskId||ticket.toolId!==proposal.toolId||ticket.realityBoundCommitId!==commit.id||ticket.credentialLeaseId!==lease.id)failures.push("execution_ticket_binding_mismatch");
  if(ticket.authorizationDigest!==digest(authorization))failures.push("execution_ticket_authorization_digest_mismatch");
  const expectedRoute=digest({toolId:proposal.toolId,protocol:proposal.protocol,operation:proposal.operation,target:proposal.target??null,normalizedArgumentsDigest:proposal.normalizedArgumentsDigest});
  if(ticket.routeDigest!==expectedRoute)failures.push("execution_ticket_route_digest_mismatch");
  if(ticket.consumedAt&&!inWindow(ticket.consumedAt,ticket.issuedAt,ticket.expiresAt))failures.push("execution_ticket_consumption_outside_window");
  if(ticket.consumedAt&&!inWindow(ticket.consumedAt,lease.issuedAt,lease.expiresAt))failures.push("credential_lease_not_valid_at_execution");
  if(lease.revokedAt&&ticket.consumedAt&&Date.parse(lease.revokedAt)<=Date.parse(ticket.consumedAt))failures.push("credential_lease_revoked_before_execution");

  const audit=b.executionAudit;
  const hasAuthorize=audit.some(e=>e.proposalId===proposal.id&&e.phase==="AUTHORIZE"&&e.outcome==="PASS");
  const hasCommit=audit.some(e=>e.ticketId===ticket.id&&e.phase==="COMMIT"&&e.outcome==="PASS");
  const hasRoute=audit.some(e=>e.ticketId===ticket.id&&e.phase==="ROUTE"&&e.outcome==="PASS");
  const attempts=audit.filter(e=>e.ticketId===ticket.id&&e.phase==="EXECUTE");
  if(!hasAuthorize)failures.push("execution_audit_authorize_pass_missing");
  if(!hasCommit)failures.push("execution_audit_commit_pass_missing");
  if(!hasRoute)failures.push("execution_audit_route_pass_missing");
  if(attempts.length!==1)failures.push(attempts.length?"multiple_execution_attempts_for_ticket":"execution_attempt_audit_missing");
  for(const event of audit.filter(e=>e.proposalId===proposal.id||e.ticketId===ticket.id))refs.add(`audit:${event.id}`);

  if(proof.intentId!==proposal.intentId)failures.push("proof_intent_mismatch");
  const po=proofOutcome(b);
  if(!po.trusted)failures.push("independent_trusted_proof_required");
  if(task.settlement==="PROVEN"&&po.outcome!=="SUCCESS")failures.push("task_success_not_supported_by_proof");
  if(task.settlement==="DISPROVEN"&&po.outcome!=="FAILURE")failures.push("task_failure_not_supported_by_proof");
  if(task.settlement==="UNKNOWN"&&po.outcome!=="UNKNOWN")warnings.push("task_preserves_unknown_despite_directional_proof");
  if(proof.assessment.missingRequired.length)failures.push("proof_required_evidence_missing");

  const cryptographicallyVerified=Object.values(b.sourceIntegrity).every(Boolean);
  if(!cryptographicallyVerified)failures.push("source_store_integrity_not_verified");
  const realityBound=failures.every(x=>!x.startsWith("reality_bound_commit_")&&!x.startsWith("task_reality_commit_")&&!x.startsWith("execution_ticket_")&&!x.startsWith("credential_lease_")&&!x.startsWith("identity_attestation_")&&!x.startsWith("formal_authorization_")&&!x.startsWith("permission_graph_"));
  const authorityGrade=cryptographicallyVerified&&realityBound&&failures.length===0;
  const outcome=failures.length?"UNKNOWN":po.outcome;
  return AuthorityGradeSettlementAssessmentSchema.parse({version:"CIEAV_AUTHORITY_GRADE_SETTLEMENT_ASSESSMENT_V1",eligible:authorityGrade&&outcome!=="UNKNOWN",authorityGrade,realityBound,cryptographicallyVerified,outcome,hardFailures:[...new Set(failures)],warnings:[...new Set(warnings)],evidenceRefs:[...refs].sort(),authority:false,productionAuthority:false});
}

export const AUTHORITY_GRADE_SETTLEMENT_AUTHORITY=false as const;
export const AUTHORITY_GRADE_SETTLEMENT_MAY_MINT_EXECUTION_AUTHORITY=false as const;
