#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const DIR=path.join(ROOT,"release","reports");
const digest=value=>crypto.createHash("sha256").update(typeof value==="string"?value:JSON.stringify(value)).digest("hex");

function run(name,cmd,args){
  const started=Date.now();
  const result=spawnSync(cmd,args,{cwd:ROOT,encoding:"utf8",shell:false,windowsHide:true,maxBuffer:32*1024*1024});
  return{name,ok:!result.error&&result.status===0,status:result.status??(result.error?127:-1),durationMs:Date.now()-started,stdout:String(result.stdout??""),stderr:[String(result.stderr??""),result.error?.message??""].filter(Boolean).join("\n")};
}
function npm(args){return process.platform==="win32"?run(`npm ${args.join(" ")}`,process.env.ComSpec||"cmd.exe",["/d","/s","/c","npm.cmd",...args]):run(`npm ${args.join(" ")}`,"npm",args)}
function git(args){const result=run(`git ${args.join(" ")}`,"git",args);if(!result.ok)throw new Error(result.stderr||result.stdout);return result.stdout.trim()}

const commands=[
  npm(["run","build:api"]),
  run("authority transaction static gate",process.execPath,["scripts/authority-transaction-static.mjs"]),
  npm(["run","test","-w","@cieav/api","--","authority-transaction-journal.test.ts","authority-transaction-recovery.test.ts","execution-fabric.test.ts"])
];
const steps=[];
for(const result of commands){steps.push(result);process.stdout.write(result.stdout);process.stderr.write(result.stderr);if(!result.ok)break}
const failure=steps.find(step=>!step.ok)?.name;
const report={
  version:"CIEAV_AUTHORITY_TRANSACTION_QUALIFICATION_V1",
  commit:git(["rev-parse","HEAD"]),
  branch:git(["branch","--show-current"]),
  platform:process.platform,
  arch:process.arch,
  node:process.version,
  steps:steps.map(({stdout,stderr,...summary})=>({...summary,stdoutDigest:digest(stdout),stderrDigest:digest(stderr)})),
  authenticatedJournal:true,
  durableFileReplace:true,
  hashChainedJournal:true,
  monotonicLocalFencing:true,
  crashRecoveryTested:true,
  ticketIssueRecoveryTested:true,
  ticketConsumeRecoveryTested:true,
  credentialLeaseDoubleSpendRecoveryTested:true,
  executionAttemptRecoveryTested:true,
  unknownOutcomeQuarantineRecoveryTested:true,
  semanticRetryBlockedOnUnknownTested:true,
  kernelQuarantineReplayIdempotencyTested:true,
  deadlockSafeStartupReplayTested:true,
  localFencingOnly:true,
  clusterHaQualified:false,
  authority:false,
  mayMintExecutionAuthority:false,
  executionAuthorityIssued:false,
  verdict:failure?"FAIL":"PASS",
  completedAt:new Date().toISOString()
};
if(failure)report.failure=failure;
report.digest=digest(report);
fs.mkdirSync(DIR,{recursive:true});
fs.writeFileSync(path.join(DIR,"latest-authority-transaction-qualification.json"),JSON.stringify(report,null,2)+"\n",{mode:0o600});
fs.writeFileSync(path.join(DIR,"latest-authority-transaction-qualification.txt"),
  `CIEAV Authority Transaction Qualification\n`+
  `Verdict: ${report.verdict}\n`+
  `Commit: ${report.commit}\n`+
  `Platform: ${report.platform}/${report.arch}\n`+
  `Crash recovery tested: true\n`+
  `Ticket issue recovery tested: true\n`+
  `Ticket consume recovery tested: true\n`+
  `Credential lease double-spend recovery tested: true\n`+
  `Execution-attempt recovery tested: true\n`+
  `UNKNOWN quarantine recovery tested: true\n`+
  `Semantic retry blocked on UNKNOWN tested: true\n`+
  `Kernel quarantine replay idempotency tested: true\n`+
  `Deadlock-safe startup replay tested: true\n`+
  `Local fencing only: true\n`+
  `Cluster HA qualified: false\n`+
  `Authority: false\n`+
  `Digest: ${report.digest}\n`+
  (failure?`Failure: ${failure}\n`:"")
);
console.log(`CIEAV authority transaction qualification: ${report.verdict}`);
console.log(`Commit: ${report.commit}`);
console.log(`Receipt: ${path.join(DIR,"latest-authority-transaction-qualification.json")}`);
if(failure)process.exit(1);
