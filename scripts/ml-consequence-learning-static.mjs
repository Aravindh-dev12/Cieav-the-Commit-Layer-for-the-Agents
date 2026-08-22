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
  "CIEAV_VERIFIED_CONSEQUENCE_DATASET_V1","unknownMustRemainUnknown","verifiedFailureMustNotBecomeReward","requiresFreshModelRollout","authorityGradeRecords","agenticRlEligibleRecords","receiptEvidenceCannotClaimAuthorityGrade","no verified consequence trajectories available for dataset generation",
]);
expect("ml/consequence_learning_cli.py",[
  "authority-free","providers","normalize-jsonl","verify_provenance_boundary","dataset","Run the preceding consequence-learning step successfully first","no finalized consequence evidence available",
]);
expect("apps/api/src/consequence-learning-export.ts",[
  "CIEAV_SIGNED_RECEIPT_V3","FINALIZED_RECEIPT","cryptographicallyVerified:true","authorityGrade:false","realityBound:false","verifyReceiptPublic",
]);
expect("apps/api/src/store/xampp-mysql.ts",[
  "C:\\\\xampp\\\\php\\\\php.exe","xampp-mysql-receipts.php","ReceiptSchema.parse","verifyReceipt(receipt,this.signer)","refusing to persist receipt with invalid signature","bootstrap",
]);
expect("apps/api/src/store/file.ts",[
  "CIEAV_RECEIPT_STORE","xampp-mysql","XamppMysqlReceiptStore","this.xampp.init()","this.xampp.save(receipt)",
]);
expect("scripts/xampp-mysql-receipts.php",[
  "pdo_mysql","127.0.0.1","xampp_mysql_must_be_loopback","CREATE DATABASE IF NOT EXISTS","CREATE TABLE IF NOT EXISTS receipts","ENGINE=InnoDB","PDO::ATTR_EMULATE_PREPARES => false",
]);
expect("scripts/xampp-mysql-bootstrap.mjs",[
  "CIEAV_PHP_BIN","CIEAV_MYSQL_DATABASE","CIEAV_MYSQL_USER","xampp-mysql-receipts.php","productionAuthority:false",
]);
expect("scripts/build-windows-cdp-bridge.mjs",[
  "cdp-win-bridge.cpp","vswhere.exe","Microsoft.VisualStudio.Component.VC.Tools.x86.x64","/DYNAMICBASE","/NXCOMPAT","CIEAV_STATE_DIR",
]);
expect("scripts/configure-xampp-receipt-store.ps1",[
  "InstallGateway","RestartGateway","npm.cmd run build:api","build-windows-cdp-bridge.mjs","CIEAV_CDP_WIN_BRIDGE","gateway install","gateway restart","CIEAV XAMPP RECEIPT STORE: CONFIGURED",
]);
expect("python/latch_platform/service.py",[
  "CIEAV_RECEIPT_STORE","CIEAV_PHP_BIN","CIEAV_MYSQL_HOST","CIEAV_MYSQL_PORT","CIEAV_MYSQL_DATABASE","CIEAV_MYSQL_USER","CIEAV_CDP_WIN_BRIDGE","gateway-service.ps1",
]);
expect("python/latch_platform/gateway.py",[
  "_wait_surface","browserConnected","protectedPages","Protected browser surface failed readiness","CIEAV_REQUIRE_PRODUCTION_API","CIEAV_TEST_AUTO_APPROVE",
]);
expect("apps/browser/chromium-launch.mjs",[
  "CIEAV_CDP_WIN_BRIDGE","cdp-win-bridge.exe","private-windows-handle-pipe","--remote-debugging-pipe","SECRET_ENV_KEYS",
]);
expect("native/windows/cdp-win-bridge.cpp",[
  "PROC_THREAD_ATTRIBUTE_HANDLE_LIST","--remote-debugging-io-pipes=","JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE","CREATE_SUSPENDED","CREATE_NO_WINDOW",
]);
expect("scripts/export-finalized-receipts-for-learning.mjs",[
  "node:sqlite","readOnly:true","Ed25519","authorityGrade:false","realityBound:false","finalized-receipt-evidence.jsonl","os.homedir()",".cieav","--discover","receipt_database_unavailable","xampp-mysql","CIEAV_MYSQL_DATABASE","callMysql(\"all\"",
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
  "ml/cieav_learning/trajectory.py","ml/cieav_learning/provenance.py","ml/cieav_learning/providers.py","ml/cieav_learning/__init__.py","ml/build_consequence_dataset.py","ml/consequence_learning_cli.py","ml/train_consequence_candidate.py","scripts/ml-consequence-learning-smoke.py","scripts/ml-local-learning-bootstrap.py","scripts/ml-local-learning-smoke.py","python/latch_platform/service.py","python/latch_platform/gateway.py",
]){
  const r=spawnSync(python,["-m","py_compile",p],{cwd:ROOT,stdio:"inherit",shell:false});if(r.error)throw r.error;if(r.status!==0)fail(`Python syntax check failed: ${p}`)
}
for(const p of ["scripts/export-finalized-receipts-for-learning.mjs","scripts/ml-live-receipt-learning-smoke.mjs","scripts/xampp-mysql-bootstrap.mjs","scripts/build-windows-cdp-bridge.mjs"]){
  const r=spawnSync(process.execPath,["--check",p],{cwd:ROOT,stdio:"inherit",shell:false});if(r.error)throw r.error;if(r.status!==0)fail(`Node syntax check failed: ${p}`)
}
const discover=spawnSync(process.execPath,["scripts/export-finalized-receipts-for-learning.mjs","--discover"],{cwd:ROOT,encoding:"utf8",shell:false,env:{...process.env,CIEAV_RECEIPT_STORE:"sqlite"}});
if(discover.error)throw discover.error;if(discover.status!==0)fail("receipt database discovery mode failed");
try{
  const report=JSON.parse(discover.stdout);
  const stateBase=path.basename(String(report.defaultStateDir||"")).toLowerCase();
  if(report.authority!==false||report.selectedStore!=="sqlite"||!Array.isArray(report.candidates)||![".cieav",".latch"].includes(stateBase))fail("receipt database discovery contract mismatch");
}catch{fail("receipt database discovery did not return JSON")}
const smoke=spawnSync(python,["scripts/ml-consequence-learning-smoke.py"],{cwd:ROOT,stdio:"inherit",shell:false});if(smoke.error)throw smoke.error;if(smoke.status!==0)fail("consequence-learning smoke failed");
const live=spawnSync(process.execPath,["scripts/ml-live-receipt-learning-smoke.mjs"],{cwd:ROOT,stdio:"inherit",shell:false,env:{...process.env,CIEAV_RECEIPT_STORE:"sqlite"}});if(live.error)throw live.error;if(live.status!==0)fail("live receipt learning smoke failed");
console.log("CIEAV consequence-learning gate PASS - signed finalized receipt export + SQLite/XAMPP-MySQL local receipt backends + persisted Gateway receipt-store configuration + Windows private-CDP bridge build/readiness + provenance-separated OUTCOME_PROOF data + authorized outcome trajectories + SFT/DPO/KTO/GRPO generation + TRAINED_UNQUALIFIED candidate contract + local TRL/PEFT contract + authority=false preserved");
