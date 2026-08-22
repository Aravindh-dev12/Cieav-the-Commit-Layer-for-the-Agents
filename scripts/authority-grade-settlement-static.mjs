#!/usr/bin/env node
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(path.join(ROOT,p),"utf8");
const requireTokens=(p,tokens)=>{const s=read(p);for(const token of tokens)if(!s.includes(token))throw new Error(`${p} missing authority-grade invariant: ${token}`);return s};

const contracts=requireTokens("packages/contracts/src/authority-grade-settlement.ts",[
  "CIEAV_AUTHORITY_GRADE_SETTLEMENT_BUNDLE_V1",
  "CIEAV_AUTHORITY_GRADE_SEMANTIC_ASSESSMENT_V1",
  "CIEAV_AUTHORITY_GRADE_SETTLEMENT_ASSESSMENT_V1",
  "authorityBindingsVerified",
  "settlementBindingsVerified",
  "trustedOutcomeEvidence",
  "cryptographicallyVerified:z.boolean()",
  "authority:z.literal(false)",
  "productionAuthority:z.literal(false)"
]);
if(contracts.includes("sourceIntegrity"))throw new Error("semantic settlement bundle may not accept caller-asserted source integrity");

const settlement=requireTokens("packages/core/src/authority-grade-settlement.ts",[
  "verifyPermissionGraph",
  "formal_authorization_not_allow",
  "credential_lease_scope_mismatch",
  "reality_bound_commit_not_consumed",
  "reality_bound_commit_proposal_digest_mismatch",
  "commit.proposalDigest!==digest(proposal)",
  "execution_ticket_not_consumed",
  "execution_attempt_audit_missing",
  "authorityBindingsVerified",
  "settlementBindingsVerified",
  "AUTHORITY_GRADE_SETTLEMENT_AUTHORITY=false",
  "AUTHORITY_GRADE_SETTLEMENT_MAY_MINT_EXECUTION_AUTHORITY=false"
]);
if(settlement.includes("cryptographicallyVerified=true")||settlement.includes("cryptographicallyVerified:true"))throw new Error("core semantic verifier may not assert cryptographic source integrity");

const trajectory=requireTokens("packages/core/src/authority-grade-trajectory.ts",[
  "AuthorityGradeSettlementAssessmentSchema.parse",
  "CIEAV_AUTHORIZED_OUTCOME_TRAJECTORY_V2",
  "worldBeforeDigest:bundle.proposal.realityWitness.digest",
  "eligibleAgenticRl",
  "assessment.cryptographicallyVerified",
  "authority:false",
  "productionAuthority:false",
  "AUTHORITY_GRADE_TRAJECTORY_AUTHORITY=false",
  "AUTHORITY_GRADE_TRAJECTORY_MAY_MINT_EXECUTION_AUTHORITY=false"
]);

const executionFabric=requireTokens("apps/api/src/execution-fabric.ts",[
  "getProposalRecord(proposalId:string)",
  "commit.proposalDigest!==digest(proposal)",
  "execution_proposal_reality_commit_binding_mismatch",
  "verifyAuditChain",
  "verifyAttestation"
]);

const exporter=requireTokens("apps/api/src/authority-grade-exporter.ts",[
  "CieavAuthorityGradeExporter",
  "getProposalRecord(ticket.proposalId)",
  "listRealityBoundCommits",
  "listAttestations",
  "listLeases",
  "listPermissionGraphs",
  "listAudit",
  "proofStore.get",
  "const cryptographicallyVerified=true",
  "semantic.authorityBindingsVerified",
  "semantic.settlementBindingsVerified",
  "buildAuthorizedOutcomeTrajectory(bundle,assessment)",
  "authority:false",
  "productionAuthority:false"
]);
for(const forbidden of ["readFile(","createHmac(","timingSafeEqual(","executionFabricSecret","kernelSecret"]){if(exporter.includes(forbidden))throw new Error(`trusted exporter duplicates durable-store secret/integrity handling: ${forbidden}`)}

const admin=requireTokens("apps/api/src/credential-hardware-admin-api.ts",[
  "/v1/agent-kernel/authority-grade/export",
  "CieavAuthorityGradeExporter",
  "valid_ticket_id_required",
  "valid_redaction_profile_required"
]);
const receiptExport=requireTokens("apps/api/src/consequence-learning-export.ts",[
  "authorityGrade:false",
  "realityBound:false",
  "authorization:{decision:\"ALLOW\",mode:\"RECEIPT_COMMIT\",complete:false}"
]);
const consequenceContracts=requireTokens("packages/contracts/src/consequence-intelligence.ts",[
  "CIEAV_AUTHORIZED_OUTCOME_TRAJECTORY_V2",
  "cryptographicallyVerified:z.boolean()",
  "authorityGrade:z.boolean()",
  "realityBound:z.boolean()",
  "eligibleAgenticRl:z.boolean()",
  "outcome:ConsequenceOutcomeSchema",
  "authority:z.literal(false)",
  "productionAuthority:z.literal(false)"
]);

for(const [name,source] of [["settlement",settlement],["trajectory",trajectory],["exporter",exporter]]){
  for(const forbidden of ["mintPermit(","mintExecutionTicket(","signCommit(","issueCredentialLease(","consumeTicket("]){
    if(source.includes(forbidden))throw new Error(`${name} learning path contains forbidden authority primitive: ${forbidden}`);
  }
}
if(receiptExport.includes("authorityGrade:true")||receiptExport.includes("realityBound:true"))throw new Error("finalized receipt exporter may not promote receipts to authority-grade evidence");
if(!consequenceContracts.includes("outcome:ConsequenceOutcomeSchema"))throw new Error("authorized trajectory must preserve SUCCESS/FAILURE/UNKNOWN semantics");
if(!executionFabric.includes("getProposalRecord"))throw new Error("authority-grade exporter lacks authenticated proposal read surface");
if(!admin.includes("/v1/agent-kernel/authority-grade/export"))throw new Error("trusted export is not constrained to Agent Kernel Gateway namespace");

console.log("CIEAV authority-grade settlement static gate PASS - semantic verification cannot self-attest provenance; exact committed proposal digest is enforced before ticketing and settlement; exporter reads authenticated stores only; receipts stay low-grade; learning authority=false");
