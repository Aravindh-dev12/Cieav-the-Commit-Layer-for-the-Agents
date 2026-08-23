#!/usr/bin/env node
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(path.join(ROOT,p),"utf8"),fail=m=>{console.error(`CIEAV agentic-RL production gate FAIL: ${m}`);process.exit(2)},expect=(p,tokens)=>{const s=read(p);for(const token of tokens)if(!s.includes(token))fail(`${p} missing invariant: ${token}`);return s};
const evaluator=expect("apps/api/src/agentic-rl-evaluator.ts",["UNKNOWN_OUTCOME","DUPLICATE_EXECUTION","STALE_REALITY","PERMISSION","false_success","unknown_mapped_to_success","excess_authority","duplicate_execution_trap","stale_reality_trap","recovery_failed","promotionExecuted:false","mayMintExecutionAuthority:false"]);
const env=expect("apps/api/src/agentic-rl-environment.ts",["GIT","BROWSER","FILESYSTEM","DATABASE","CLOUD","PERMISSION","CREDENTIAL","UNKNOWN_OUTCOME","DUPLICATE_EXECUTION","RECOVERY","STALE_REALITY","executionAuthorityIssued:false","mayMintExecutionAuthority:false"]);
const suite=expect("apps/api/src/agentic-rl-suite.ts",["missing_constitutional_trap","duplicate_evidence","heldOut:true","authority:false","productionAuthority:false","mayMintExecutionAuthority:false"]);
const registry=expect("apps/api/src/model-qualification-store.ts",["TRAINED_UNQUALIFIED","QUALIFIED","ACTIVE","QUARANTINED","REVOKED","model_candidate_learning_job_not_unqualified","model_candidate_not_qualified","activationApprovalRef","promotionExecuted:false","mayMintExecutionAuthority:false","mayPromoteSelf:false","rollback_detected"]);
const modelRuntime=expect("apps/api/src/qualified-model-runtime.ts",["qualified-model:","role:","qualified_model_not_active","authority:false","mayMintExecutionAuthority:false"]);
const cortex=expect("packages/core/src/consequence-intelligence.ts",["QUALIFIED_MODEL_FAMILY","role:ROUTER","role:CORE_REASONER","role:CONSEQUENCE_MODEL","role:PROOF_PLANNER","role:AUTHORITY_ADVISOR","role:RECOVERY_MODEL","role:CRITIC_REWARD"]);
const provider=expect("apps/api/src/local-learning-provider.ts",["SFT","DPO","KTO","GRPO","RLVR","OFFLINE_RL","DISTILLATION","SUCCEEDED_UNQUALIFIED","candidateQualified:false","promotionExecuted:false","authority:false","productionAuthority:false"]);
expect("ml/train_trl.py",["choices=[\"sft\",\"dpo\",\"kto\",\"grpo\",\"rlvr\"]","validate_rlvr_dataset","requiresFreshModelRollout","verifier claimed authority","score claimed authority","TRAINED_UNQUALIFIED"]);
expect("ml/train_offline_rl.py",["cryptographicallyVerified","authorityGrade","realityBound","chosenReward","rejectedReward","UNKNOWN","TRAINED_UNQUALIFIED","authority=false","productionAuthority=false","promotionExecuted=false"]);
expect("ml/distill.py",["teacherModelDigest","teacherQualificationRef","teacherQualified","cryptographicallyVerified","authorityGrade","realityBound","UNKNOWN","TRAINED_UNQUALIFIED","promotionExecuted=false"]);
expect("apps/api/src/trusted-learning-materializer.ts",["QUALIFIED_TEACHER_CORPUS_JSONL","OFFLINE_RL","RLVR","DISTILLATION","unknown_mapped_to_success","mixed_teacher_identity"]);
expect("packages/contracts/src/learning-vault.ts",["QUALIFIED_TEACHER_CORPUS_JSONL","DISTILLATION"]);
expect("apps/api/src/agentic-rl-evaluator.test.ts",["false success","duplicate-payment","stale-reality","excessive privilege"]);
expect("apps/api/src/model-qualification-store.test.ts",["TRAINED_UNQUALIFIED","failed trainer output","cannot self-activate","deterministically","tampering"]);
expect("apps/api/src/agentic-rl-environment.test.ts",["eleven required deterministic environments","preserves UNKNOWN","duplicate execution retry trap","stale-reality","successful recovery","excessive synthetic scope"]);
expect("apps/api/src/agentic-rl-suite.test.ts",["constitutional trap","duplicated episode evidence"]);
for(const source of [evaluator,env,suite,registry,modelRuntime,cortex,provider])for(const forbidden of ["mintExecutionTicket(","issueTicket(","issuePermit(","mintPermit(","candidateQualified:true","promotionExecuted:true","authority:true","productionAuthority:true"]){if(source.includes(forbidden))fail(`authority-bearing primitive/claim found: ${forbidden}`)}
for(const p of ["ml/train_trl.py","ml/train_offline_rl.py","ml/distill.py"]){const python=process.platform==="win32"?"python":"python3",r=spawnSync(python,["-m","py_compile",p],{cwd:ROOT,stdio:"inherit",shell:false});if(r.error)throw r.error;if(r.status!==0)fail(`Python syntax check failed: ${p}`)}
console.log("CIEAV agentic-RL production gate PASS - verified corpora -> unqualified training -> isolated deterministic environments -> held-out qualification -> separately approved ACTIVE zero-authority model cells");
