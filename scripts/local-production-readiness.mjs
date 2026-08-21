#!/usr/bin/env node
import {spawnSync} from "node:child_process";
import {mkdirSync,writeFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const REPORT_DIR=path.join(ROOT,"release","reports");
const args=process.argv.slice(2);
const full=args.includes("--full");
const jsonOnly=args.includes("--json-only");
const noWrite=args.includes("--no-write");
const expectedBranchArg=args.find(x=>x.startsWith("--expected-branch="));
const runtimeArchiveArg=args.find(x=>x.startsWith("--runtime-archive="));
const expectedBranch=String(expectedBranchArg?.slice("--expected-branch=".length)||process.env.CIEAV_LOCAL_EXPECTED_BRANCH||"").trim();
const runtimeArchive=String(runtimeArchiveArg?.slice("--runtime-archive=".length)||"").trim();

const runRaw=(cmd,cmdArgs,{inherit=false}={})=>spawnSync(cmd,cmdArgs,{cwd:ROOT,encoding:"utf8",shell:false,env:process.env,stdio:inherit?"inherit":"pipe"});
const git=(...gitArgs)=>{const r=runRaw("git",gitArgs);if(r.status!==0)throw new Error(`git ${gitArgs.join(" ")} failed: ${(r.stderr||r.stdout||"").trim()}`);return r.stdout.trim()};
const branch=git("branch","--show-current"),commit=git("rev-parse","HEAD"),dirty=git("status","--porcelain");
const nodeMajor=Number(process.versions.node.split(".")[0]);
const checks=[];
const record=(name,status,detail,command=null)=>checks.push({name,status,detail,command});

if(nodeMajor>=22)record("node-runtime","PASS",`Node ${process.versions.node} satisfies >=22`);else record("node-runtime","FAIL",`Node ${process.versions.node} is below required Node 22`);
if(expectedBranch){if(branch===expectedBranch)record("expected-branch","PASS",branch);else record("expected-branch","FAIL",`expected ${expectedBranch}, got ${branch||"DETACHED"}`)}
else record("expected-branch","PASS",`not pinned; current=${branch||"DETACHED"}`);
if(!dirty)record("clean-worktree","PASS","working tree is clean");else record("clean-worktree","FAIL","working tree has uncommitted changes");

const commandPlan=[
  ["release-plan",process.execPath,[path.join(ROOT,"scripts","release-gate.mjs"),"--plan"]],
  ["production-orchestration-contract",process.execPath,[path.join(ROOT,"scripts","production-orchestration-static.mjs")]],
  ["physical-evidence-contract",process.execPath,[path.join(ROOT,"scripts","physical-qualification-evidence-smoke.mjs")]],
  ["release-signing-crypto",process.execPath,[path.join(ROOT,"scripts","release-signing-smoke.mjs")]]
];
if(full){
  commandPlan.push(
    ["full-test-suite",process.platform==="win32"?"npm.cmd":"npm",["test"]],
    ["typecheck",process.platform==="win32"?"npm.cmd":"npm",["run","typecheck"]],
    ["build",process.platform==="win32"?"npm.cmd":"npm",["run","build"]]
  );
}
if(runtimeArchive){
  commandPlan.push(["clean-runtime",process.platform==="win32"?"python":"python3",[path.join(ROOT,"scripts","clean-runtime-smoke.py"),"--archive",path.resolve(ROOT,runtimeArchive)]]);
}else{
  record("clean-runtime","NOT_RUN","provide --runtime-archive=<path> after building/downloading a runtime archive; this does not count as a local failure");
}

for(const [name,cmd,cmdArgs] of commandPlan){
  const shown=[cmd,...cmdArgs.map(x=>path.isAbsolute(x)?path.relative(ROOT,x)||".":x)].join(" ");
  if(!jsonOnly)console.log(`\n[local-production] ${shown}`);
  const r=runRaw(cmd,cmdArgs,{inherit:!jsonOnly});
  if(r.error)record(name,"FAIL",r.error.message,shown);
  else if(r.status===0)record(name,"PASS","command completed successfully",shown);
  else record(name,"FAIL",`exit ${r.status}: ${String(r.stderr||r.stdout||"").trim().slice(0,1200)}`,shown);
}

const externalGates=[
  {id:"windows-production-identity",status:"EXTERNAL_REQUIRED",localCoverage:"release signing cryptography + workflow/config contract only",productionRequirement:"real production Windows code-signing identity/provider and timestamping"},
  {id:"apple-developer-id-notarization",status:"EXTERNAL_REQUIRED",localCoverage:"release/notarization orchestration contract only",productionRequirement:"real Apple Developer ID certificate and notarization credentials/service"},
  {id:"windows-tpm-hardware",status:"EXTERNAL_REQUIRED",localCoverage:"physical evidence schema, digest, freshness, commit/version and tamper rejection",productionRequirement:"physical Windows TPM self-hosted runner and measured-boot attestation"},
  {id:"macos-secure-enclave",status:"EXTERNAL_REQUIRED",localCoverage:"physical evidence and workflow contract",productionRequirement:"physical Apple Silicon/macOS Secure Enclave self-hosted runner"},
  {id:"linux-tpm2",status:"EXTERNAL_REQUIRED",localCoverage:"physical evidence and TPM2 qualification contract",productionRequirement:"physical Linux TPM2 self-hosted runner"},
  {id:"cuda-gpu",status:"EXTERNAL_REQUIRED",localCoverage:"GPU qualification workflow/static contract",productionRequirement:"real CUDA-capable self-hosted runner and deterministic GPU evidence"},
  {id:"live-installer-machines",status:"EXTERNAL_REQUIRED",localCoverage:"installer/release plan and mutation-safety contract",productionRequirement:"clean physical Windows/macOS/Linux installer runners for success and rollback"},
  {id:"independent-security-assessment",status:"EXTERNAL_REQUIRED",localCoverage:"external-review evidence ingestion/binding contract",productionRequirement:"independently produced assessment report for exact commit/version"},
  {id:"operations-dr-exercise",status:"EXTERNAL_REQUIRED",localCoverage:"operations evidence/RTO/RPO contract",productionRequirement:"real recovery, CDN restore, backup restore, secret rotation, alerting and requalification exercise"},
  {id:"public-cloud-domain-cdn",status:"DEFERRED_EXTERNAL_PHASE",localCoverage:"deployment verifier and exact-build identity contract",productionRequirement:"real public HTTPS Cloud endpoint, domain/DNS and CDN artifacts"}
];

const failed=checks.filter(x=>x.status==="FAIL");
const report={
  schemaVersion:2,
  product:"CIEAV",
  kind:"LOCAL_PRODUCTION_READINESS",
  authority:false,
  verdict:failed.length?"FAIL":"PASS",
  productionVerdict:"BLOCKED_EXTERNAL",
  createdAt:new Date().toISOString(),
  mode:full?"full":"release-focused",
  branch,
  commit,
  expectedBranch:expectedBranch||null,
  localChecks:checks,
  externalGates,
  boundary:"A LOCAL_PRODUCTION_READINESS PASS means repository-local tests and production contracts passed on this machine. It is never production authority and cannot satisfy hardware, code-signing/notarization, public Cloud/CDN, independent review, or real operations/DR gates.",
  finalProductionPass:false
};
if(!noWrite){mkdirSync(REPORT_DIR,{recursive:true});writeFileSync(path.join(REPORT_DIR,"latest-local-production-readiness.json"),JSON.stringify(report,null,2)+"\n","utf8")}
console.log(JSON.stringify(report,null,2));
if(failed.length){console.error(`CIEAV local production readiness FAIL - ${failed.map(x=>x.name).join(", ")}`);process.exitCode=1}
else if(!jsonOnly)console.log("CIEAV local production readiness PASS - repo-local gates passed; FINAL PRODUCTION PASS remains blocked on external evidence by design");
