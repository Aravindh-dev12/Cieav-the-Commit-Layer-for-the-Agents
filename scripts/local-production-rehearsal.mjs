#!/usr/bin/env node
import {mkdirSync,readFileSync,writeFileSync,copyFileSync,rmSync} from "node:fs";
import {spawnSync} from "node:child_process";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const REPORT_DIR=path.join(ROOT,"release","reports");
const TMP=path.join(ROOT,".tmp","local-production-rehearsal");
mkdirSync(REPORT_DIR,{recursive:true});
mkdirSync(TMP,{recursive:true});

const args=process.argv.slice(2);
const has=name=>args.includes(name);
const value=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:undefined};
const opts={
  bootstrap:has("--bootstrap"),
  full:has("--full"),
  mutate:has("--mutate"),
  physical:has("--physical"),
  requireGpu:has("--require-gpu"),
  requireScale:has("--require-scale"),
  gpuConstraints:value("--gpu-constraints")||null,
};
if(opts.requireGpu&&!opts.gpuConstraints)throw new Error("--require-gpu requires --gpu-constraints <repository-relative exact package==version file>");
if(opts.gpuConstraints&&(path.isAbsolute(opts.gpuConstraints)||opts.gpuConstraints.split(/[\\/]+/).includes("..")))throw new Error("--gpu-constraints must be repository-relative and contain no .. segments");

const pkg=JSON.parse(readFileSync(path.join(ROOT,"package.json"),"utf8"));
const platform=process.platform==="win32"?"windows":process.platform==="darwin"?"macos":process.platform;
const arch=process.arch==="arm64"?"arm64":process.arch==="x64"?"x64":process.arch;
const target=`${platform}-${arch}`;
const npm=process.platform==="win32"?"npm.cmd":"npm";
const ps=process.platform==="win32"?(process.env.ComSpec||"cmd.exe"):null;

const capture=(cmd,cmdArgs=[],extra={})=>spawnSync(cmd,cmdArgs,{cwd:ROOT,encoding:"utf8",shell:false,maxBuffer:8*1024*1024,...extra});
const gitHeadResult=capture("git",["rev-parse","HEAD"]);if(gitHeadResult.status!==0)throw new Error("cannot resolve current Git commit");
const commit=String(gitHeadResult.stdout).trim();
const dirtyBefore=String(capture("git",["status","--porcelain"]).stdout||"").trim();
if(dirtyBefore)throw new Error("local production rehearsal requires a clean git worktree so evidence is exact-head bound");

const checks={};
const failures=[];
const warnings=[];
const now=()=>new Date().toISOString();
function record(name,result){checks[name]=result;return result}
function runStep(name,cmd,cmdArgs=[],{env=process.env,required=true}={}){
  console.log(`\n=== ${name} ===`);
  const started=Date.now();
  const r=spawnSync(cmd,cmdArgs,{cwd:ROOT,env,stdio:"inherit",shell:false});
  const ok=!r.error&&r.status===0;
  record(name,{ok,required,exitCode:r.status??null,error:r.error?.message??null,durationMs:Date.now()-started});
  if(required&&!ok)failures.push(`${name}${r.error?`: ${r.error.message}`:`: exit ${r.status}`}`);
  return ok;
}
function probe(name,cmd,cmdArgs=[],{env=process.env}={}){
  const started=Date.now(),r=capture(cmd,cmdArgs,{env});
  const result={ok:!r.error&&r.status===0,exitCode:r.status??null,error:r.error?.message??null,stdout:String(r.stdout||"").trim().slice(-4000),stderr:String(r.stderr||"").trim().slice(-4000),durationMs:Date.now()-started};
  record(name,result);return result;
}
function pythonCommand(){for(const candidate of process.platform==="win32"?["python","py"]:["python3","python"]){const a=candidate==="py"?["-3","--version"]:["--version"],r=capture(candidate,a);if(!r.error&&r.status===0)return{cmd:candidate,prefix:candidate==="py"?["-3"]:[]}}throw new Error("Python 3.11+ is required")}
const py=pythonCommand();

const nodeMajor=Number(process.versions.node.split(".")[0]);
record("toolchain",{ok:nodeMajor>=22,node:process.version,python:probe("pythonVersion",py.cmd,[...py.prefix,"--version"]).stdout,platform:process.platform,arch:process.arch});
if(nodeMajor<22)failures.push(`Node 22+ required, got ${process.version}`);

if(opts.bootstrap)runStep("bootstrapDependencies",npm,["ci","--ignore-scripts"]);
runStep("productionOrchestrationStatic",process.execPath,["scripts/production-orchestration-static.mjs"]);
runStep("productionQualificationStatic",process.execPath,["scripts/production-qualification-static.mjs"]);
runStep("releasePlan",process.execPath,["scripts/release-gate.mjs","--plan"]);
runStep("supplyChainSbom",process.execPath,["scripts/generate-production-sbom.mjs"]);
runStep("dependencyAuditHigh",npm,["audit","--omit=dev","--audit-level=high"]);
runStep("dependencyAuditCritical",npm,["audit","--audit-level=critical"]);

let platformFoundationOutput=null;
if(process.platform==="win32")platformFoundationOutput=probe("platformHardwareFoundation",process.execPath,["scripts/windows-tpm-native-attestation-release.mjs"]);
else if(process.platform==="darwin")platformFoundationOutput=probe("platformHardwareFoundation",process.execPath,["scripts/macos-secure-enclave-release.mjs"]);
else if(process.platform==="linux"){
  const foundationOk=runStep("platformHardwareFoundation",process.execPath,["scripts/linux-tpm2-attestation-release.mjs"]);
  platformFoundationOutput=checks.platformHardwareFoundation;
  const tpmDevice=probe("linuxTpmDevice","sh",["-c","test -c /dev/tpmrm0 -o -c /dev/tpm0"]);
  const tpmTools=probe("linuxTpm2Tools","tpm2_getcap",["properties-fixed"]);
  record("linuxTpmLocalAvailability",{ok:tpmDevice.ok&&tpmTools.ok,devicePresent:tpmDevice.ok,tpm2ToolsReachable:tpmTools.ok,strictPhysicalEvidence:false});
  if(!foundationOk)warnings.push("Linux TPM2 implementation foundation failed; install npm dependencies and TPM2-TSS development packages before strict local qualification");
}else failures.push(`unsupported local rehearsal platform: ${process.platform}`);

if(platformFoundationOutput&&typeof platformFoundationOutput.stdout==="string"){
  record("hardwareProbeSummary",{
    hardwareAvailable:/hardware-available/.test(platformFoundationOutput.stdout),
    failClosedUnavailable:/unavailable-fail-closed/.test(platformFoundationOutput.stdout),
    sourceGatePassed:platformFoundationOutput.ok===true,
  });
}

if(process.platform==="darwin"){
  const sample=path.join(TMP,"codesign-ad-hoc-probe");
  try{copyFileSync("/usr/bin/true",sample)}catch(err){failures.push(`macOS ad-hoc signing rehearsal could not copy /usr/bin/true: ${err.message}`)}
  if(!failures.some(x=>x.startsWith("macOS ad-hoc signing"))){
    runStep("macosAdHocCodeSign","codesign",["--force","--sign","-",sample]);
    runStep("macosAdHocCodeSignVerify","codesign",["--verify","--strict","--verbose=2",sample]);
    record("macosSigningScope",{productionIdentity:false,developerId:false,notarization:false,purpose:"local codesign pipeline rehearsal only"});
  }
  rmSync(sample,{force:true});
}else if(process.platform==="win32")record("windowsSigningScope",{productionIdentity:false,localSelfSignedAuthenticode:opts.mutate,liveSigningRehearsal:opts.mutate});
else record("linuxSigningScope",{applicable:false,reason:"no platform publisher identity requirement in current Linux release path"});

if(opts.mutate){
  if(process.platform==="win32"){
    const cmd=`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/local-live-windows-qualification.ps1 -ConfirmLocalMutation`;
    runStep("localLiveInstallerAndRollback",ps,["/d","/s","/c",cmd]);
  }else{
    warnings.push("Full installer/service mutation rehearsal is currently implemented on Windows only; macOS/Linux local hosts still run packaging, hardware, signing-toolchain and software gates without claiming live-installer completion");
    record("localLiveInstallerAndRollback",{ok:false,required:false,notImplementedForTarget:target});
  }
}else record("localLiveInstallerAndRollback",{ok:false,required:false,skipped:true,reason:"rerun with --mutate to permit local service/installer mutation"});

if(opts.physical){
  const env={...process.env,CIEAV_PHYSICAL_HARDWARE_QUALIFICATION:"1"};
  runStep("strictPhysicalHardwareQualification",process.execPath,["scripts/release-gate.mjs","--physical-hardware"],{env,required:true});
}else record("strictPhysicalHardwareQualification",{ok:false,required:false,skipped:true,reason:"rerun with --physical after pinning real local hardware configuration"});

if(opts.gpuConstraints){
  const constraints=path.join(ROOT,opts.gpuConstraints),gpuDir=path.join(REPORT_DIR,"ml");mkdirSync(gpuDir,{recursive:true});
  const env={...process.env,CUBLAS_WORKSPACE_CONFIG:process.env.CUBLAS_WORKSPACE_CONFIG||":4096:8",PYTHONHASHSEED:process.env.PYTHONHASHSEED||"1729"};
  const manifest=path.join(gpuDir,"local-environment-qualification.json"),gpuProbe=path.join(gpuDir,"local-gpu-determinism-probe.json");
  const qArgs=[...py.prefix,"ml/qualify_environment.py","--constraints",constraints,"--output",manifest,"--seed","1729","--require-cuda"];
  if(opts.requireScale)qArgs.push("--require-scale");
  const envOk=runStep("localCudaEnvironmentQualification",py.cmd,qArgs,{env,required:opts.requireGpu});
  if(envOk)runStep("localCudaDeterminismProbe",py.cmd,[...py.prefix,"ml/gpu_determinism_probe.py","--environment-manifest",manifest,"--output",gpuProbe,"--seed","1729"],{env,required:opts.requireGpu});
}else{
  const gpu=probe("gpuInventory","nvidia-smi",["--query-gpu=name,driver_version","--format=csv,noheader"]);
  if(opts.requireGpu&&!gpu.ok)failures.push("CUDA GPU required but nvidia-smi is unavailable");
  record("localCudaQualification",{ok:false,required:opts.requireGpu,qualified:false,gpuInventoryReachable:gpu.ok,reason:"provide --gpu-constraints <exact-pins-file> to run exact-head CUDA qualification"});
}

if(opts.full){
  runStep("fullTestSuite",npm,["test"]);
  runStep("typecheck",npm,["run","typecheck"]);
}else{
  record("fullTestSuite",{ok:false,required:false,skipped:true,reason:"rerun with --full"});
  record("typecheck",{ok:false,required:false,skipped:true,reason:"rerun with --full"});
}

const dirtyAfter=String(capture("git",["status","--porcelain"]).stdout||"").trim();
record("cleanSourceAfterRehearsal",{ok:!dirtyAfter,dirty:dirtyAfter||null});
if(dirtyAfter)failures.push("rehearsal mutated tracked source files");

const externalProductionBlockers=[
  {id:"public-cloud-cdn",status:"EXTERNAL_REQUIRED",localRehearsal:"loopback/test transport only",productionRequirement:"real public HTTPS Cloud and CDN origins with exact signed release bytes"},
  {id:"windows-production-publisher",status:"EXTERNAL_REQUIRED",localRehearsal:"temporary self-signed Authenticode may be used on Windows",productionRequirement:"production Windows code-signing identity/provider and timestamping"},
  {id:"apple-developer-id-notarization",status:"EXTERNAL_REQUIRED",localRehearsal:"ad-hoc/local codesign toolchain only",productionRequirement:"Apple Developer ID signing identity plus successful Apple notarization"},
  {id:"registered-physical-runners",status:"EXTERNAL_REQUIRED",localRehearsal:"real local hardware can be probed with --physical",productionRequirement:"registered self-hosted runner provenance for Windows TPM, macOS Secure Enclave, Linux TPM2, CUDA and live installers"},
  {id:"independent-security-review",status:"EXTERNAL_REQUIRED",localRehearsal:"tests and dependency audits are internal evidence only",productionRequirement:"independent external review report bound to exact commit/version"},
  {id:"operations-dr",status:"EXTERNAL_REQUIRED",localRehearsal:"local rollback rehearsal is non-authoritative",productionRequirement:"real recovery/restore/secret-rotation/alert delivery exercise with measured RTO/RPO"},
  {id:"final-production-workflow",status:"BLOCKED_BY_DESIGN",localRehearsal:"never produces production authority",productionRequirement:"successful exact-head production workflow run IDs and final attestation"},
];
const evidence={
  schemaVersion:1,
  product:"CIEAV",
  kind:"LOCAL_PRODUCTION_REHEARSAL",
  authority:false,
  production:false,
  productionQualification:"BLOCKED",
  verdict:failures.length?"FAIL":"REHEARSAL_PASS",
  createdAt:now(),
  version:pkg.version,
  commit,
  target,
  host:{hostname:os.hostname(),platform:os.platform(),release:os.release(),arch:os.arch()},
  requested:opts,
  checks,
  failures,
  warnings,
  externalProductionBlockers,
  invariants:{
    simulationCannotSatisfyProduction:true,
    externalReviewCannotBeSelfDeclared:true,
    publicDeploymentCannotUseLoopback:true,
    productionSigningIdentityCannotBeReplacedByLocalTestIdentity:true,
    finalProductionPassCannotBeEmittedByThisTool:true,
  },
};
const canonical=v=>Array.isArray(v)?`[${v.map(canonical).join(",")}]`:v&&typeof v==="object"?`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`:JSON.stringify(v);
evidence.digestAlgorithm="SHA-256";
evidence.digest=crypto.createHash("sha256").update(canonical(evidence)).digest("hex");
const out=path.join(REPORT_DIR,"latest-local-production-rehearsal.json");
writeFileSync(out,JSON.stringify(evidence,null,2)+"\n","utf8");
console.log(`\nCIEAV LOCAL PRODUCTION REHEARSAL: ${evidence.verdict}`);
console.log(`Production qualification: BLOCKED BY DESIGN`);
console.log(`Evidence: ${path.relative(ROOT,out)}`);
if(failures.length){for(const f of failures)console.error(`FAIL: ${f}`);process.exitCode=1;}
