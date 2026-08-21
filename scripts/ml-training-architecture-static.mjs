#!/usr/bin/env node
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(path.join(ROOT,p),"utf8"),fail=m=>{console.error(`CIEAV ML architecture gate FAIL: ${m}`);process.exit(2)},expect=(p,tokens)=>{const s=read(p);for(const x of tokens)if(!s.includes(x))fail(`${p} missing invariant: ${x}`);return s};
const types=expect("packages/core/src/ml-types.ts",["MlCandidateDecision","MlProcessTrace","MlTrajectoryStep","MlPromotionThresholds","reward-hacking"]);
const reward=expect("packages/core/src/ml-reward.ts",["scoreRlvrDecision","risk_underclassified","reversibility_optimistic","privacy_leak","scoreProcessTrace","scoreSoftRequirements","scoreCalibration"]);
const trajectory=expect("packages/core/src/ml-trajectory.ts",["unauthorized_tool","commit_before_approval","unknown_claimed_success","unsafe_undo","trajectory_secret_leak"]);
const adversarial=expect("packages/core/src/ml-adversarial.ts",["assessRewardHacking","independent_hard_failure","training_verifier_missed_safety_invariant"]);
expect("packages/core/src/ml-promotion.ts",["maxCriticalFalseNegatives:0","maxHighFalseNegatives:0","maxHardSafetyFailures:0","maxRewardHackingCases:0","minAbstentionRecall:.9"]);
expect("ml/README.md",["SFT","DPO","KTO","RLVR/GRPO","PROCESS","SOFT_RLVR","AGENTIC_RL","CALIBRATION","ADVERSARIAL","DISTILL","Models interpret; CIEAV deterministic code authorizes"]);
expect("ml/dataset/build_from_evals.py",["train","validation","adversarial","promotion","critical_false_negative_is_hard_failure","unknown_must_not_be_claimed_success"]);
expect("ml/train_trl.py",["SFTTrainer","DPOTrainer","KTOTrainer","GRPOTrainer","CIEAV_ML_VERIFIER_TOKEN","verifier_reward"]);
expect("ml/distill.py",["Sequence-distill","LoraConfig","SFTTrainer","UNQUALIFIED","promotion gate"]);
expect("ml/requirements-scale.txt",["verl","ray","sglang"]);
expect("ml/configs/post_training.yaml",["soft_rlvr","agentic_rl","calibration","adversarial","distill","critical_false_negatives: 0"]);
expect("ml/configs/verl_grpo.yaml",["algorithm: grpo","vllm","sglang","canonical_cieav_verifier","unknown_claimed_as_success"]);
expect("scripts/ml-verifier-server.mjs",["127.0.0.1","CIEAV_ML_VERIFIER_TOKEN","authority:false","scoreRlvrDecision","scoreTrajectory","evaluateMlPromotion"]);
if(/mint.*permit|authorize.*commit/i.test(reward+trajectory+adversarial+types))fail("ML scoring layer must not gain execution authority");
for(const p of ["ml/dataset/build_from_evals.py","ml/train_trl.py","ml/distill.py"]){const r=spawnSync(process.platform==="win32"?"python":"python3",["-m","py_compile",p],{cwd:ROOT,stdio:"inherit",shell:false});if(r.error)throw r.error;if(r.status!==0)fail(`Python syntax check failed: ${p}`)}
console.log("CIEAV ML architecture gate PASS · SFT/DPO/KTO + RLVR/GRPO + process/soft rewards + agentic trajectories + calibration/abstention + independent reward-hacking defense + scale-out verl/Ray/SGLang + sequence distillation present; deterministic CIEAV remains authority");
