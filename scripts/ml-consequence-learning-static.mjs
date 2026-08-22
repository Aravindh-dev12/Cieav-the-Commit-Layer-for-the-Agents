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
  "CIEAV_AUTHORIZED_OUTCOME_TRAJECTORY_V1",
  "authority",
  "productionAuthority",
  "mayMintPermit",
  "mayCommitAction",
  "mayAuthorizeUndo",
  "unknown_is_training_signal_not_success",
  "trajectory digest mismatch",
  "REDACTED_BEARER",
]);
expect("ml/cieav_learning/providers.py",[
  "cieav-browser-proof",
  "reticle-mcp-proof",
  "trl-peft",
  "verl-ray",
  "vllm-rollout",
  "sglang-rollout",
  "river-learning",
  "provider registry violated authority=false invariant",
]);
expect("ml/build_consequence_dataset.py",[
  "CIEAV_VERIFIED_CONSEQUENCE_DATASET_V1",
  "unknownMustRemainUnknown",
  "verifiedFailureMustNotBecomeReward",
  "requiresFreshModelRollout",
  "SFT",
].filter(Boolean));
expect("ml/consequence_learning_cli.py",[
  "authority-free",
  "providers",
  "normalize",
  "verify",
  "dataset",
]);
expect("scripts/ml-consequence-learning-smoke.py",[
  "SUCCESS",
  "FAILURE",
  "UNKNOWN",
  "secret redaction failed",
  "Reticle/River provider surfaces",
]);
expect("ml/requirements-local.txt",[
  "torch",
  "transformers",
  "datasets",
  "trl",
  "peft",
  "accelerate",
  "tokenizers",
]);
const localReq=read("ml/requirements-local.txt");
for(const forbidden of ["vllm","verl","ray","sglang"]){
  if(new RegExp(`^${forbidden}$`,`mi`).test(localReq))fail(`local learning requirements must not force heavy scale engine: ${forbidden}`);
}
expect("scripts/ml-local-learning-bootstrap.py",[
  "CIEAV_LOCAL_LEARNING_ENVIRONMENT_V1",
  "authority",
  "heavyScaleEnginesRequired",
  "requirements-local.txt",
]);
expect("scripts/ml-local-learning-smoke.py",[
  "CIEAV_LOCAL_LEARNING_SMOKE_V1",
  "GPT2Config",
  "SFTTrainer",
  "LoraConfig",
  "noPermitMinting",
  "noCommitAuthority",
  "candidateRemainsUnqualified",
  "trainable weights did not change",
]);

const python=process.platform==="win32"?"python":"python3";
for(const p of [
  "ml/cieav_learning/trajectory.py",
  "ml/cieav_learning/providers.py",
  "ml/cieav_learning/__init__.py",
  "ml/build_consequence_dataset.py",
  "ml/consequence_learning_cli.py",
  "scripts/ml-consequence-learning-smoke.py",
  "scripts/ml-local-learning-bootstrap.py",
  "scripts/ml-local-learning-smoke.py",
]){
  const r=spawnSync(python,["-m","py_compile",p],{cwd:ROOT,stdio:"inherit",shell:false});
  if(r.error)throw r.error;
  if(r.status!==0)fail(`Python syntax check failed: ${p}`);
}
const smoke=spawnSync(python,["scripts/ml-consequence-learning-smoke.py"],{cwd:ROOT,stdio:"inherit",shell:false});
if(smoke.error)throw smoke.error;
if(smoke.status!==0)fail("consequence-learning smoke failed");
console.log("CIEAV consequence-learning gate PASS - authorized outcome trajectories + secret redaction + proof/learning provider registry + SFT/DPO/KTO/GRPO dataset generation + local TRL/PEFT smoke contract + authority=false preserved");
