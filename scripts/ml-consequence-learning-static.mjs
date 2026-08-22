#!/usr/bin/env node
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(path.join(ROOT,p),"utf8");
const fail=m=>{console.error(`CIEAV consequence-learning gate FAIL: ${m}`);process.exit(2)};
const expect=(p,tokens)=>{const s=read(p);for(const t of tokens)if(!s.includes(t))fail(`${p} missing invariant: ${t}`);return s};

expect("ml/cieav_learning/trajectory.py",[
  "CIEAV_AUTHORIZED_OUTCOME_TRAJECTORY_V1","authority","productionAuthority","mayMintPermit","mayCommitAction","mayAuthorizeUndo","unknown_is_training_signal_not_success","trajectory digest mismatch","REDACTED_BEARER",
]);
expect("ml/cieav_learning/provenance.py",[
  "authorityGrade","realityBound","cryptographicallyVerified","AUTHORITY_AND_OUTCOME","OUTCOME_PROOF","eligibleAgenticRl","authority-grade learning evidence missing",
]);
expect("ml/cieav_learning/providers.py",[
  "cieav-browser-proof","reticle-mcp-proof","trl-peft","verl-ray","vllm-rollout","sglang-rollout","river-learning","provider registry violated authority=false invariant",
]);
expect("ml/build_consequence_dataset.py",[
  "CIEAV_VERIFIED_CONSEQUENCE_DATASET_V1","unknownMustRemainUnknown","verifiedFailureMustNotBecomeReward","requiresFreshModelRollout","authorityGradeRecords","agenticRlEligibleRecords","receiptEvidenceCannotClaimAuthorityGrade",
]);
expect("ml/consequence_learning_cli.py",[
  "authority-free","providers","normalize-jsonl","verify_provenance_boundary","dataset","Run the preceding consequence-learning step successfully first",
]);
expect("apps/api/src/consequence-learning-export.ts",[
  "CIEAV_SIGNED_RECEIPT_V3","FINALIZED_RECEIPT","cryptographicallyVerified:true","authorityGrade:false","realityBound:false","verifyReceiptPublic",
]);
expect("scripts/export-finalized-receipts-for-learning.mjs",[
  "node:sqlite","readOnly:true","Ed25519","authorityGrade:false","realityBound:false","finalized-receipt-evidence.jsonl","os.homedir()",".cieav","--discover","receipt_database_unavailable",
]);
expect("scripts/ml-live-receipt-learning-smoke.mjs",[
  "tampered after signing","OUTCOME_PROOF","eligibleAgenticRl","tampered receipt rejected",
]);
expect("ml/train_consequence_candidate.py",[
  "TRAINED_UNQUALIFIED","verify_provenance_boundary","create_round","record_checkpoint","candidateRemainsUnqualified","promotionExecuted","SFTTrainer","LoraConfig","Export and normalize finalized receipt evidence first",
]);
expect("scripts/ml-consequence-learning-smoke.py",[
  "SUCCESS","FAILURE","UNKNOWN","secret redaction failed","Reticle/River provider surfaces",
]);
expect("ml/requirements-local.txt",[
  "torch","transformers","datasets","trl","peft","accelerate","tokenizers",
]);
const localReq=read("ml/requirements-local.txt");
for(const forbidden of ["vllm","verl","ray","sglang"]){if(new RegExp(`^${forbidden}$`,`mi`).test(localReq))fail(`local learning requirements must not force heavy scale engine: ${forbidden}`)}
expect("scripts/ml-local-learning-bootstrap.py",[
  "CIEAV_LOCAL_LEARNING_ENVIRONMENT_V1","authority","heavyScaleEnginesRequired","requirements-local.txt",
]);
expect("scripts/ml-local-learning-smoke.py",[
  "CIEAV_LOCAL_LEARNING_SMOKE_V1","GPT2Config","SFTTrainer","LoraConfig","noPermitMinting","noCommitAuthority","candidateRemainsUnqualified","trainable weights did not change",
]);

const python=process.platform==="win32"?"python":"python3";
for(const p of [
  "ml/cieav_learning/trajectory.py","ml/cieav_learning/provenance.py","ml/cieav_learning/providers.py","ml/cieav_learning/__init__.py","ml/build_consequence_dataset.py","ml/consequence_learning_cli.py","ml/train_consequence_candidate.py","scripts/ml-consequence-learning-smoke.py","scripts/ml-local-learning-bootstrap.py","scripts/ml-local-learning-smoke.py",
]){
  const r=spawnSync(python,["-m","py_compile",p],{cwd:ROOT,stdio:"inherit",shell:false});if(r.error)throw r.error;if(r.status!==0)fail(`Python syntax check failed: ${p}`)
}
for(const p of ["scripts/export-finalized-receipts-for-learning.mjs","scripts/ml-live-receipt-learning-smoke.mjs"]){
  const r=spawnSync(process.execPath,["--check",p],{cwd:ROOT,stdio:"inherit",shell:false});if(r.error)throw r.error;if(r.status!==0)fail(`Node syntax check failed: ${p}`)
}
const discover=spawnSync(process.execPath,["scripts/export-finalized-receipts-for-learning.mjs","--discover"],{cwd:ROOT,encoding:"utf8",shell:false});
if(discover.error)throw discover.error;if(discover.status!==0)fail("receipt database discovery mode failed");
try{const report=JSON.parse(discover.stdout);if(report.authority!==false||!Array.isArray(report.candidates)||!String(report.defaultStateDir||"").includes(".cieav"))fail("receipt database discovery contract mismatch")}catch{fail("receipt database discovery did not return JSON")}
const smoke=spawnSync(python,["scripts/ml-consequence-learning-smoke.py"],{cwd:ROOT,stdio:"inherit",shell:false});if(smoke.error)throw smoke.error;if(smoke.status!==0)fail("consequence-learning smoke failed");
const live=spawnSync(process.execPath,["scripts/ml-live-receipt-learning-smoke.mjs"],{cwd:ROOT,stdio:"inherit",shell:false});if(live.error)throw live.error;if(live.status!==0)fail("live receipt learning smoke failed");
console.log("CIEAV consequence-learning gate PASS - signed finalized receipt export + user-state receipt discovery + provenance-separated OUTCOME_PROOF data + authorized outcome trajectories + SFT/DPO/KTO/GRPO generation + TRAINED_UNQUALIFIED candidate contract + local TRL/PEFT contract + authority=false preserved");
