#!/usr/bin/env node
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(path.join(ROOT,p),"utf8");
const requireTokens=(p,tokens)=>{const s=read(p);for(const token of tokens)if(!s.includes(token))throw new Error(`${p} missing authority-grade invariant: ${token}`);return s};

const contracts=requireTokens("packages/contracts/src/authority-grade-settlement.ts",[
  "CIEAV_AUTHORITY_GRADE_SETTLEMENT_BUNDLE_V1","CIEAV_AUTHORITY_GRADE_SEMANTIC_ASSESSMENT_V1","Pure semantic assessment","only the trusted local exporter may make","CIEAV_AUTHORITY_GRADE_SETTLEMENT_ASSESSMENT_V1","cryptographicallyVerified:z.boolean()","authority:z.literal(false)","productionAuthority:z.literal(false)"
]);
const proofContracts=requireTokens("packages/contracts/src/proof.ts",["ProofProvenanceSchema","AGENT_REPORT","UNVERIFIED"]);
const graphContracts=requireTokens("packages/contracts/src/universal-runtime.ts",[
  "ConsequenceGraphTrajectoryLedgerEntrySchema","trajectoryDigest:z.string().regex","ingestedTrajectories:z.array","Durable at-most-once ledger","never silently evicted","authority:z.literal(false)","mayMintExecutionAuthority:z.literal(false)"
]);
const settlement=requireTokens("packages/core/src/authority-grade-settlement.ts",[
  "assessAuthorityGradeSettlement","CIEAV_OBSERVER","TRUSTED_ADAPTER","EXTERNAL_SIGNED","HUMAN_ATTESTATION","permission_graph_integrity_invalid","formal_authorization_not_allow","reality_bound_commit_proposal_digest_mismatch","reality_bound_commit_not_consumed","execution_ticket_not_consumed","multiple_execution_attempts_for_ticket","independent_trusted_proof_required","authorityBindingsVerified","settlementBindingsVerified","const outcome=authorityBindingsVerified&&settlementBindingsVerified?po.outcome:\"UNKNOWN\"","AUTHORITY_GRADE_SETTLEMENT_AUTHORITY=false","AUTHORITY_GRADE_SETTLEMENT_MAY_MINT_EXECUTION_AUTHORITY=false"
]);
const graph=requireTokens("packages/core/src/consequence-graph.ts",[
  "MAX_INGESTED_TRAJECTORIES=100000","trajectoryDigest","consequence_graph_trajectory_id_content_mismatch","consequence_graph_trajectory_ledger_capacity_exceeded","consequence_graph_duplicate_trajectory_ledger_id","consequence_graph_trajectory_ledger_observation_count_mismatch","consequence_graph_trajectory_ledger_edge_count_mismatch","ingestedTrajectories:this.ingestedTrajectories.size"
]);
const trajectory=requireTokens("packages/core/src/authority-grade-trajectory.ts",[
  "buildAuthorizedOutcomeTrajectory","AuthorityGradeSettlementAssessmentSchema.parse","CIEAV_AUTHORIZED_OUTCOME_TRAJECTORY_V2","eligibleAgenticRl=assessment.authorityGrade","assessment.outcome!==\"UNKNOWN\"","authority:false","productionAuthority:false","AUTHORITY_GRADE_TRAJECTORY_AUTHORITY=false","AUTHORITY_GRADE_TRAJECTORY_MAY_MINT_EXECUTION_AUTHORITY=false"
]);
const exporter=requireTokens("apps/api/src/authority-grade-learning-export.ts",[
  "Trusted local export boundary","Caller-supplied bundle integrity flags do not","exportAuthorityGradeTrajectory","CIEAV_AUTHORITY_GRADE_LEARNING_EXPORT_V1","authority_grade_consumed_ticket_required","kernel.executionFabric.listTickets()","kernel.executionFabric.getProposalRecord","kernel.intentReality.listRealityBoundCommits()","proofStore.get(task.scopeDeviceId,task.proofCaseId)","const semantic=assessAuthorityGradeSettlement(bundle)","const cryptographicallyVerified=true","semantic.authorityBindingsVerified","semantic.settlementBindingsVerified","semantic.trustedOutcomeEvidence","outcome:authorityGrade?semantic.outcome:\"UNKNOWN\"","buildAuthorizedOutcomeTrajectory(bundle,assessment)","authority:false","productionAuthority:false"
]);
const ingestor=requireTokens("apps/api/src/authority-grade-learning-ingestor.ts",[
  "CIEAV_TRUSTED_EXPERIENCE_INGESTION_V1","executionTicketId:z.string().uuid()","exportAuthorityGradeTrajectory","intelligenceStore.ingestVerifiedExperience(exported.trajectory)","authority:false","productionAuthority:false","mayMintExecutionAuthority:false","TRUSTED_EXPERIENCE_INGESTOR_AUTHORITY=false","TRUSTED_EXPERIENCE_INGESTOR_MAY_MINT_EXECUTION_AUTHORITY=false"
]);
const intelligenceApi=requireTokens("apps/api/src/universal-intelligence-api.ts",[
  "caller_asserted_verified_experience_forbidden","/v1/intelligence/experience/from-ticket","trusted_experience_ingestor_unavailable","trustedExperienceIngestor.ingestFromTicket","authority:false","mayMintExecutionAuthority:false"
]);
const proofBridge=requireTokens("apps/api/src/trusted-proof-provider-bridge.ts",[
  "QUALIFIED_SETTLEMENT_PROVIDERS","cieav.http-proof.v1","cieav.filesystem-proof.v1","cieav.git-proof.v1","trusted_settlement_proof_requires_post_state_or_reconciliation","proof_provider_not_qualified_for_trusted_settlement","trusted_proof_provider_authority_invariant_violation","conclusive_proof_provider_requires_observation","TRUSTED_ADAPTER","TRUSTED_PROOF_PROVIDER_BRIDGE_AUTHORITY=false","TRUSTED_PROOF_PROVIDER_BRIDGE_MAY_MINT_EXECUTION_AUTHORITY=false"
]);
const server=requireTokens("apps/api/src/server.ts",[
  "CieavLocalProofProviderRuntime","CieavTrustedProofProviderBridge","CieavAuthorityGradeLearningIngestor","gatewayProofProviderPath","gateway_authorization_required","/provider-observation$/i","trustedProofProviderBridge.observeAndAttach","trustedExperienceIngestor","new CieavUniversalIntelligenceApi(intelligenceStore,trustedExperienceIngestor??undefined)"
]);
const compatibility=requireTokens("apps/api/src/authority-grade-exporter.ts",["Compatibility façade","exportAuthorityGradeTrajectory","authority_grade_consumed_ticket_required","authority:false","productionAuthority:false"]);
const receipt=requireTokens("apps/api/src/consequence-learning-export.ts",["authorityGrade:false","realityBound:false","complete:false","CIEAV_FINALIZED_RECEIPT_LEARNING_EXPORT_V1"]);
const fabric=requireTokens("apps/api/src/execution-fabric.ts",["getProposalRecord(proposalId:string)","commit.proposalDigest!==digest(proposal)","execution_arguments_changed_after_authorization","Single-use execution ticket consumed","verifyAuditChain"]);
requireTokens("apps/api/src/authority-grade-learning-export.test.ts",["complete authenticated authority and trusted-proof chain","does not let an agent self-report create authority-grade success","independent_trusted_proof_required","multiple_execution_attempts_for_ticket","worldAfterDigest).toBeUndefined()"]);
requireTokens("apps/api/src/trusted-proof-provider-bridge.test.ts",["CIEAV-owned trusted provenance","TRUSTED_ADAPTER","does not allow pre-state observations to masquerade as settlement proof","does not auto-trust an arbitrary provider id","preserves non-conclusive provider results as neutral evidence"]);
requireTokens("apps/api/src/universal-intelligence-api.test.ts",["rejects caller-asserted verified trajectories","caller_asserted_verified_experience_forbidden","delegates ticket-derived experience only to the trusted ingestor","fails closed when ticket-derived ingestion is not available"]);
requireTokens("packages/core/src/consequence-graph.test.ts",["identical trajectory replay idempotent","changed content under an already-ingested trajectory id","persists the trajectory replay ledger across restart","legacy V1 graph state that predates the replay ledger"]);
requireTokens("apps/api/src/universal-intelligence-store.test.ts",["does not double-count the same verified trajectory before or after restart","consequence_graph_trajectory_id_content_mismatch"]);

for(const source of [contracts,graphContracts,settlement,graph,trajectory,exporter,ingestor,intelligenceApi,proofBridge,compatibility,receipt])for(const forbidden of ["mintPermit(","mintExecutionTicket(","issueCredentialLease(","signCommit("]){if(source.includes(forbidden))throw new Error(`authority-grade learning code contains forbidden authority primitive: ${forbidden}`)}
if(contracts.includes("sourceIntegrity"))throw new Error("public settlement bundle may not accept caller-asserted source integrity");
if(settlement.includes("cryptographicallyVerified:true"))throw new Error("pure semantic verifier may not claim cryptographic source verification");
if(receipt.includes("authorityGrade:true")||receipt.includes("realityBound:true"))throw new Error("finalized receipt exporter may not claim authority-grade or reality-bound truth");
if(!proofContracts.includes("AGENT_REPORT")||!proofContracts.includes("UNVERIFIED")||settlement.includes("AGENT_REPORT"))throw new Error("settlement verifier no longer distinguishes untrusted proof provenance");
if(intelligenceApi.includes("IntelligenceExperienceRequestSchema.parse"))throw new Error("Gateway intelligence API may not accept caller-asserted verified trajectory objects");
if(proofBridge.includes("provenance:"))throw new Error("trusted proof bridge must not accept caller-selected provenance");

console.log("CIEAV authority-grade learning static gate PASS - qualified provider proof + CIEAV-owned provenance + pure semantic verifier + authenticated-store elevation + ticket-derived idempotent learning + durable replay ledger + UNKNOWN preservation + receipt separation + zero authority");
