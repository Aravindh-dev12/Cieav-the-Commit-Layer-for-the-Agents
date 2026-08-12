#!/usr/bin/env node
import {spawnSync} from "node:child_process";
import {mkdir,readFile,writeFile,access} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";

const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,"..");
const PUBLISH=process.argv.includes("--publish");
const PLAN_ONLY=process.argv.includes("--plan");
const npm=process.platform==="win32"?"npm.cmd":"npm";
const python=process.env.CIEAV_PYTHON||process.env.PYTHON||"python";
const MAX_LOG=24_000;
const startedAt=new Date();
const results=[];

const exists=async p=>{try{await access(p);return true}catch{return false}};
const tail=(s,n=MAX_LOG)=>{const x=String(s??"");return x.length<=n?x:`…[truncated ${x.length-n} chars]\n${x.slice(-n)}`};
const safeUrl=v=>{try{const u=new URL(v);return u.protocol==="https:"&&!['localhost','127.0.0.1','0.0.0.0'].includes(u.hostname)&&!/[<>]/.test(v)}catch{return false}};
const run=(cmd,args=[],opts={})=>spawnSync(cmd,args,{cwd:ROOT,encoding:"utf8",env:{...process.env,PYTHONPATH:[path.join(ROOT,"python"),process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),...(opts.env??{})},shell:false,maxBuffer:32*1024*1024});

function addResult({id,label,status,required=true,durationMs=0,command=null,stdout="",stderr="",detail=""}){
  const item={id,label,status,required,durationMs,command,detail,stdout:tail(stdout),stderr:tail(stderr)};
  results.push(item);
  const mark=status==="PASS"?"PASS":status==="WARN"?"WARN":"FAIL";
  console.log(`${mark.padEnd(4)}  ${label}${detail?` · ${detail}`:""}`);
  return item;
}

function commandStage(id,label,cmd,args,{required=true,env}={}){
  if(PLAN_ONLY){addResult({id,label,status:"PASS",required,detail:`plan: ${cmd} ${args.join(' ')}`});return true}
  const t=Date.now();
  const r=run(cmd,args,{env});
  const ok=r.status===0&&!r.error;
  addResult({id,label,status:ok?"PASS":"FAIL",required,durationMs:Date.now()-t,command:[cmd,...args],stdout:r.stdout,stderr:r.stderr||String(r.error??""),detail:ok?"":`exit ${r.status??'spawn-error'}`});
  return ok;
}

function staticStage(id,label,fn,{required=true}={}){
  if(PLAN_ONLY){addResult({id,label,status:"PASS",required,detail:"plan: static verification"});return true}
  const t=Date.now();
  try{const detail=fn();addResult({id,label,status:"PASS",required,durationMs:Date.now()-t,detail:detail??""});return true}
  catch(err){addResult({id,label,status:"FAIL",required,durationMs:Date.now()-t,detail:String(err?.message??err)});return false}
}

const pkg=JSON.parse(await readFile(path.join(ROOT,"package.json"),"utf8"));
const pyproject=await readFile(path.join(ROOT,"pyproject.toml"),"utf8");
const pyVersion=pyproject.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const version=pkg.version;
const gitCommit=(()=>{const r=run("git",["rev-parse","HEAD"]);return r.status===0?r.stdout.trim():"unknown"})();
const gitStatus=(()=>{const r=run("git",["status","--porcelain"]);return r.status===0?r.stdout.trim():"unknown"})();
const remote=(()=>{const r=run("git",["remote","get-url","origin"]);return r.status===0?r.stdout.trim():"unknown"})();
const timestamp=startedAt.toISOString().replace(/[:.]/g,"-");
const reportDir=path.join(ROOT,"release","reports");

console.log(`\nCIEAV ${PUBLISH?"Production Publish":"Local Release-Candidate"} Verification`);
console.log("=".repeat(62));
console.log(`Version: ${version}`);
console.log(`Commit:  ${gitCommit}`);
console.log(`Host:    ${process.platform}/${process.arch}`);
console.log(`Mode:    ${PUBLISH?"publish":"local"}\n`);

staticStage("identity","Product identity and version consistency",()=>{
  if(pkg.name!=="cieav")throw new Error(`package name is ${pkg.name}, expected cieav`);
  if(!version||version!==pyVersion)throw new Error(`package.json=${version} pyproject.toml=${pyVersion}`);
  if(!/^\d+\.\d+\.\d+(?:[-+].+)?$/.test(version))throw new Error("version is not semver-like");
  return `CIEAV ${version}`;
});

staticStage("required-files","Production boundary files exist",()=>{
  const required=[
    "apps/browser/main.mjs","apps/browser/injected.js","apps/browser/audit.mjs",
    "apps/api/src/server.ts","apps/api/standalone.mjs","packages/contracts/src/index.ts",
    "distribution/install.sh","distribution/install.ps1","scripts/release-metadata-smoke.py",
    "SECURITY.md","PRIVACY.md"
  ];
  const missing=[];
  for(const p of required){try{await access(path.join(ROOT,p))}catch{missing.push(p)}}
  if(missing.length)throw new Error(`missing: ${missing.join(', ')}`);
  return `${required.length} critical files present`;
});

staticStage("privacy-contract","Cloud privacy contract remains fail-minimized",()=>{
  const cloudPath=path.join(ROOT,"python/latch_platform/cloud_provider.py");
  const source=requireText(cloudPath);
  for(const token of ["rawFormValuesIncluded","rawSecretsIncluded","fullPageTextIncluded","durableStorageRequested"]){if(!source.includes(token))throw new Error(`missing privacy declaration ${token}`)}
  if(!/rawFormValuesIncluded["']?\s*:\s*False/.test(source)||!/rawSecretsIncluded["']?\s*:\s*False/.test(source)||!/fullPageTextIncluded["']?\s*:\s*False/.test(source)||!/durableStorageRequested["']?\s*:\s*False/.test(source))throw new Error("cloud privacy declaration is not explicitly false");
  return "raw secrets/form values/full-page text excluded; no durable cloud storage requested";
});

staticStage("outcome-invariant","Outcome/Undo invariants are wired",()=>{
  const contract=requireText(path.join(ROOT,"packages/contracts/src/index.ts"));
  const server=requireText(path.join(ROOT,"apps/api/src/server.ts"));
  if(!contract.includes("OBSERVED_SUCCESS")||!contract.includes("OBSERVED_FAILURE")||!contract.includes("UNKNOWN"))throw new Error("outcome status contract incomplete");
  if(!server.includes("undo_requires_observed_success"))throw new Error("API does not gate Undo on observed success");
  if(!server.includes("outcome_already_finalized"))throw new Error("receipt outcomes are not immutable");
  return "signed final outcome + verified-success Undo gate present";
});

commandStage("python-compile","Python syntax/package compile",python,["-m","compileall","-q","python"]);
commandStage("browser-syntax","Browser execution boundary syntax","node",["--check","apps/browser/main.mjs"]);
commandStage("injected-syntax","Injected mediator syntax","node",["--check","apps/browser/injected.js"]);
commandStage("standalone-syntax","Standalone API syntax","node",["--check","apps/api/standalone.mjs"]);
commandStage("release-runner-syntax","Release verifier syntax","node",["--check","scripts/release-verify.mjs"]);

commandStage("platform-smoke","Local Gateway/platform smoke",python,["scripts/platform-gateway-smoke.py"]);
commandStage("cloud-contract","Cloud privacy/enrollment contract smoke",python,["scripts/cloud-provider-smoke.py"]);
commandStage("local-model-contract","Optional local-model contract smoke",python,["scripts/local-model-smoke.py"]);
commandStage("semantic-router-contract","Semantic-router fallback smoke",python,["scripts/hf-provider-smoke.py"]);
commandStage("release-metadata","Release metadata/bootstrap attack tests",python,["scripts/release-metadata-smoke.py"]);

commandStage("build","Production TypeScript/workspace build",npm,["run","build"]);
commandStage("typecheck","Workspace typecheck",npm,["run","typecheck"]);
commandStage("core-tests","Core/API unit tests",npm,["run","test:core"]);
commandStage("ai-orchestration","AI orchestration safety tests",npm,["run","test:ai-orchestration"]);
commandStage("cognitive-debt","Cognitive-debt invariants",npm,["run","test:cognitive-debt"]);
commandStage("dashboard-smoke","Attention Health dashboard smoke","node",["scripts/dashboard-attention-smoke.mjs"]);
commandStage("noinstall-selftest","No-install safety self-test",npm,["run","selftest:noinstall"]);
commandStage("browser-e2e","Protected browser trusted-replay/outcome/Undo E2E",npm,["run","test:browser"]);

staticStage("installer-contract","Consumer installer invariants",()=>{
  const sh=requireText(path.join(ROOT,"distribution/install.sh"));
  const ps=requireText(path.join(ROOT,"distribution/install.ps1"));
  if(/python3\s+is required for manifest parsing/i.test(sh)||/command -v python3/.test(sh))throw new Error("Unix installer still depends on Python");
  for(const s of [sh,ps]){
    if(!/SHA-?256|sha256|Get-FileHash/i.test(s))throw new Error("installer checksum verification missing");
    if(!/rollback|previous/i.test(s))throw new Error("installer rollback path missing");
    if(!/cloud probe/i.test(s))throw new Error("cloud safety probe missing from installer");
  }
  return "no Python bootstrap dependency + checksum + rollback + cloud probe";
});

if(PUBLISH){
  staticStage("clean-tree","Publish source tree is clean",()=>{if(gitStatus&&gitStatus!=="unknown")throw new Error("git working tree has uncommitted changes");if(gitStatus==="unknown")throw new Error("cannot determine git status");return "clean"});
  staticStage("production-endpoints","Real CIEAV production HTTPS endpoints configured",()=>{
    const cloud=process.env.CIEAV_CLOUD_URL??"",download=process.env.CIEAV_DOWNLOAD_BASE_URL??"";
    if(!safeUrl(cloud))throw new Error("CIEAV_CLOUD_URL must be a real non-local HTTPS URL");
    if(!safeUrl(download))throw new Error("CIEAV_DOWNLOAD_BASE_URL must be a real non-local HTTPS URL");
    return `${new URL(cloud).hostname} / ${new URL(download).hostname}`;
  });
  staticStage("repository-identity","Repository remote has CIEAV identity",()=>{
    if(remote==="unknown")throw new Error("cannot determine git origin remote");
    if(!/cieav/i.test(remote))throw new Error("origin repository still uses the pre-CIEAV name; rename it before publish");
    return remote;
  });
  staticStage("public-brand","Public documentation is CIEAV-first",()=>{
    const readme=requireText(path.join(ROOT,"README.md"));
    if(!/^# CIEAV\s*$/m.test(readme))throw new Error("README does not identify CIEAV as the product");
    if(/<CIEAV-DOWNLOAD-DOMAIN>|<your-production-cloud-api>|<your-public-download-domain>/.test(readme))throw new Error("README still contains production URL placeholders");
    return "CIEAV public identity + no deployment placeholders";
  });
}

const requiredFailures=results.filter(x=>x.required&&x.status==="FAIL");
const warnings=results.filter(x=>x.status==="WARN");
const verdict=requiredFailures.length?"FAIL":"PASS";
const finishedAt=new Date();
const report={
  schemaVersion:1,
  product:"CIEAV",
  version,
  mode:PUBLISH?"publish":"local",
  verdict,
  startedAt:startedAt.toISOString(),
  finishedAt:finishedAt.toISOString(),
  durationMs:finishedAt-startedAt,
  source:{commit:gitCommit,dirty:gitStatus!==""&&gitStatus!=="unknown",remote},
  host:{platform:process.platform,arch:process.arch,hostname:os.hostname(),node:process.version},
  summary:{total:results.length,passed:results.filter(x=>x.status==="PASS").length,failed:requiredFailures.length,warnings:warnings.length},
  results
};

await mkdir(reportDir,{recursive:true});
const stem=`cieav-${version}-${PUBLISH?'publish':'local'}-${timestamp}`;
const jsonPath=path.join(reportDir,`${stem}.json`),txtPath=path.join(reportDir,`${stem}.txt`);
await writeFile(jsonPath,JSON.stringify(report,null,2)+"\n","utf8");
const textLines=[
  `CIEAV ${PUBLISH?"Production Publish":"Local Release-Candidate"} Verification`,
  "=".repeat(62),
  `Version: ${version}`,
  `Commit: ${gitCommit}`,
  `Mode: ${report.mode}`,
  `Host: ${process.platform}/${process.arch}`,
  `Started: ${report.startedAt}`,
  `Finished: ${report.finishedAt}`,
  "",
  ...results.map(r=>`${r.status.padEnd(4)}  ${r.label}${r.detail?` · ${r.detail}`:""}`),
  "",
  `${PUBLISH?"PRODUCTION PUBLISH GATE":"LOCAL RELEASE-CANDIDATE GATE"}: ${verdict}`,
  `Passed: ${report.summary.passed}/${report.summary.total}`,
  `Failed: ${report.summary.failed}`,
  `Report JSON: ${path.relative(ROOT,jsonPath)}`
];
await writeFile(txtPath,textLines.join("\n")+"\n","utf8");
await writeFile(path.join(reportDir,"latest-verification.json"),JSON.stringify(report,null,2)+"\n","utf8");
await writeFile(path.join(reportDir,"latest-verification.txt"),textLines.join("\n")+"\n","utf8");

console.log("\n"+"-".repeat(62));
console.log(`${PUBLISH?"PRODUCTION PUBLISH GATE":"LOCAL RELEASE-CANDIDATE GATE"}: ${verdict}`);
console.log(`Report: ${path.relative(ROOT,txtPath)}`);
if(requiredFailures.length){console.log(`Failed stages: ${requiredFailures.map(x=>x.id).join(', ')}`);process.exitCode=1}

function requireText(file){
  // All static source files are loaded synchronously so stage callbacks stay deterministic.
  const r=run(process.execPath,["-e",`process.stdout.write(require('fs').readFileSync(${JSON.stringify(file)},'utf8'))`]);
  if(r.status!==0)throw new Error(`cannot read ${path.relative(ROOT,file)}`);
  return r.stdout;
}
