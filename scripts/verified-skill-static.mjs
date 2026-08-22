#!/usr/bin/env node
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(path.join(ROOT,p),"utf8");
const requireTokens=(p,tokens)=>{const s=read(p);for(const token of tokens)if(!s.includes(token))throw new Error(`${p} missing verified-skill invariant: ${token}`);return s};

const contracts=requireTokens("packages/contracts/src/verified-skill.ts",[
  "CIEAV_VERIFIED_SKILL_VALIDATION_CASE_V1","heldOut:z.literal(true)","CIEAV_VERIFIED_SKILL_VALIDATION_EVIDENCE_V1","CIEAV_VERIFIED_SKILL_QUALIFICATION_V2","maxRegressions","repairs","regressions","CIEAV_VERIFIED_SKILL_V2","CIEAV_VERIFIED_SKILL_IN_USE_V1","authority:z.literal(false)","productionAuthority:z.literal(false)","mayMintExecutionAuthority:z.literal(false)"
]);
const core=requireTokens("packages/core/src/verified-skill.ts",[
  "verifiedSkillValidationCaseDigest","duplicate_validation_case_digest","validation_case_digest_mismatch","validation_candidate_digest_mismatch","validation_case_not_held_out","regressions","schema_argument_policy_requires_external_deterministic_qualification","verified_skill_v2_activation_requires_explicit_approval","VERIFIED_SKILL_AUTHORITY=false","VERIFIED_SKILL_MAY_MINT_EXECUTION_AUTHORITY=false"
]);
const evidence=requireTokens("packages/core/src/verified-skill-validation-evidence.ts",[
  "buildVerifiedSkillValidationEvidenceBundle","verifyVerifiedSkillValidationEvidenceBundle","duplicate_validation_case_digest","validation_case_not_held_out","validationDigest","VERIFIED_SKILL_VALIDATION_EVIDENCE_AUTHORITY=false","VERIFIED_SKILL_VALIDATION_EVIDENCE_MAY_MINT_EXECUTION_AUTHORITY=false"
]);
const runtime=requireTokens("packages/core/src/verified-skill-runtime.ts",[
  "verified_skill_v1_runtime_projection_forbidden_requalify_v2","verifiedSkillV2ToCognitiveCell","buildVerifiedSkillInUse","verified_skill_dependency_unavailable","verified_skill_remote_dependency_forbidden_for_local_only","cieav-verified-skill-v2","VERIFIED_SKILL_RUNTIME_AUTHORITY=false","VERIFIED_SKILL_RUNTIME_MAY_MINT_EXECUTION_AUTHORITY=false"
]);
const registryContracts=requireTokens("packages/contracts/src/verified-skill-registry.ts",[
  "CIEAV_VERIFIED_SKILL_PROVENANCE_V1","subjectDigest","sourceQualificationDigest","validationEvidence:VerifiedSkillValidationEvidenceBundleSchema","verified_skill_registry_artifact_must_remain_qualified_and_immutable","CIEAV_VERIFIED_SKILL_REGISTRY_STATE_V1","previousSnapshotDigest","CIEAV_VERIFIED_SKILL_REGISTRY_HEAD_V1","authority:z.literal(false)","productionAuthority:z.literal(false)","mayMintExecutionAuthority:z.literal(false)"
]);
const store=requireTokens("apps/api/src/verified-skill-store.ts",[
  "cieav-verified-skill-registry-state-v1","cieav-verified-skill-registry-head-v1","timingSafeEqual","verified_skill_registry_artifact_must_remain_qualified","verifyVerifiedSkillValidationEvidenceBundle","verified_skill_registry_validation_evidence_mismatch","verified_skill_registry_rollback_detected","verified_skill_registry_head_snapshot_mismatch","verified_skill_registry_generation_gap_or_fork","verified_skill_dependency_lock_drift","QUARANTINED","materializeActive","Simultaneous rollback of both authenticated state and head cannot be detected without a hardware/remote monotonic anchor","authority:false","productionAuthority:false","mayMintExecutionAuthority:false"
]);
requireTokens("packages/core/src/verified-skill.test.ts",["held-out intervention validation","baseline-success regression","validation is contaminated by source trajectories","validation-result tampering","duplicate-case padding","explicit V2 activation approval"]);
requireTokens("packages/core/src/verified-skill-runtime.test.ts",["projects only ACTIVE V2 skills","inherits remote locality","run-specific SkillInUse evidence","remote-composite skill for LOCAL_ONLY","legacy V1 ACTIVE artifacts"]);
requireTokens("apps/api/src/verified-skill-store.test.ts",["exact reproducible held-out evidence","qualified artifact immutable","authenticated rollback","first-write crash window","state/head fork","dependency identity drift","software-only freshness limit"]);

for(const source of [contracts,core,evidence,runtime,registryContracts,store])for(const forbidden of ["mintPermit(","mintExecutionTicket(","issueCredentialLease(","signCommit("]){if(source.includes(forbidden))throw new Error(`verified-skill code contains forbidden authority primitive: ${forbidden}`)}
if(!store.includes("artifact.state!==\"QUALIFIED\""))throw new Error("verified-skill registry no longer enforces immutable QUALIFIED artifacts");
if(store.includes("revokeVerifiedSkillV2(current.artifact")||store.includes("artifact=activateVerifiedSkillV2(current.artifact"))throw new Error("registry lifecycle is mutating the immutable provenance subject");
if(!core.includes("new Set(cases.map(item=>item.caseDigest)).size!==cases.length"))throw new Error("held-out validation can be padded with duplicate cases");
if(!evidence.includes("verifiedSkillValidationCaseDigest(item)"))throw new Error("validation evidence bundle does not recompute exact case content digests");

console.log("CIEAV verified-skill static gate PASS - held-out A/B qualification + immutable artifacts + reproducible evidence + dependency locks + rollback detection + run-specific SkillInUse + zero authority");
