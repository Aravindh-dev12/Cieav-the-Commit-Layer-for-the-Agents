#!/usr/bin/env node
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(path.join(ROOT,p),"utf8");
const requireTokens=(p,tokens)=>{const s=read(p);for(const token of tokens)if(!s.includes(token))throw new Error(`${p} missing authority-grade invariant: ${token}`);return s};

const contracts=requireTokens("packages/contracts/src/authority-grade-settlement.ts",[
  "CIEAV_AUTHORITY_GRADE_SETTLEMENT_BUNDLE_V1",
  "CIEAV_AUTHORITY_GRADE_SETTLEMENT_ASSESSMENT_V1",
  "executionAuditChainVerified:z.literal(true)",
  "identityAttestationVerified:z.literal(true)",
  "authority:z.literal(false)",
  "productionAuthority:z.literal(false)"
]);
const settlement=requireTokens("packages/core/src/authority-grade-settlement.ts",[
  "assessAuthorityGradeSettlement",
  "CIEAV_OBSERVER","TRUSTED_ADAPTER","EXTERNAL_SIGNED","HUMAN_ATTESTATION",
  "permission_graph_integrity_invalid",
  "formal_authorization_not_allow",
  "reality_bound_commit_not_consumed",
  "execution_ticket_not_consumed",
  "multiple_execution_attempts_for_ticket",
  "independent_trusted_proof_required",
  "source_store_integrity_not_verified",
  "const outcome=failures.length?\"UNKNOWN\":po.outcome",
  "AUTHORITY_GRADE_SETTLEMENT_AUTHORITY=false",
  "AUTHORITY_GRADE_SETTLEMENT_MAY_MINT_EXECUTION_AUTHORITY=false"
]);
const trajectory=requireTokens("packages/core/src/authority-grade-trajectory.ts",[
  "buildAuthorizedOutcomeTrajectory",
  "CIEAV_AUTHORIZED_OUTCOME_TRAJECTORY_V2",
  "eligibleAgenticRl=assessment.authorityGrade",
  "assessment.outcome!==\"UNKNOWN\"",
  "authority:false",
  "productionAuthority:false",
  "AUTHORITY_GRADE_TRAJECTORY_AUTHORITY=false",
  "AUTHORITY_GRADE_TRAJECTORY_MAY_MINT_EXECUTION_AUTHORITY=false"
]);
const exporter=requireTokens("apps/api/src/authority-grade-learning-export.ts",[
  "exportAuthorityGradeTrajectory",
  "CIEAV_AUTHORITY_GRADE_LEARNING_EXPORT_V1",
  "kernel.executionFabric.listTickets()",
  "kernel.executionFabric.getProposalRecord",
  "kernel.intentReality.listRealityBoundCommits()",
  "proofStore.get(task.scopeDeviceId,task.proofCaseId)",
  "sourceIntegrity",
  "authority:false",
  "productionAuthority:false"
]);
const receipt=requireTokens("apps/api/src/consequence-learning-export.ts",[
  "authorityGrade:false",
  "realityBound:false",
  "complete:false",
  "CIEAV_FINALIZED_RECEIPT_LEARNING_EXPORT_V1"
]);
const fabric=requireTokens("apps/api/src/execution-fabric.ts",[
  "getProposalRecord(proposalId:string)",
  "commit.proposalDigest!==digest(proposal)",
  "execution_arguments_changed_after_authorization",
  "Single-use execution ticket consumed"
]);

for(const source of [contracts,settlement,trajectory,exporter,receipt])for(const forbidden of ["mintPermit(","mintExecutionTicket(","issueCredentialLease(","signCommit("]){
  if(source.includes(forbidden))throw new Error(`authority-grade learning code contains forbidden authority primitive: ${forbidden}`);
}
if(receipt.includes("authorityGrade:true")||receipt.includes("realityBound:true"))throw new Error("finalized receipt exporter may not claim authority-grade or reality-bound truth");
if(!settlement.includes("AGENT_REPORT")||!settlement.includes("UNVERIFIED"))throw new Error("settlement verifier no longer distinguishes untrusted proof provenance");
if(!fabric.includes("verifyAuditChain"))throw new Error("execution fabric no longer verifies audit hash chain before trusted export");

console.log("CIEAV authority-grade learning static gate PASS - authenticated-store join + exact authority/reality binding + trusted proof + UNKNOWN preservation + receipt separation + zero authority");
