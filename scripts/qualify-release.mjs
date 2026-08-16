#!/usr/bin/env node
import crypto from "node:crypto";
import {readdir,readFile,writeFile,mkdir} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const DIR=path.join(ROOT,"release","reports"),MIN_REPORT_SCHEMA=2;
const arg=name=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:undefined};
const requested=(arg("--require")??process.env.CIEAV_RELEASE_TARGETS??"windows-x64,macos-arm64,linux-x64").split(",").map(x=>x.trim()).filter(Boolean);
const targetOf=r=>`${r.host?.platform==="win32"?"windows":r.host?.platform==="darwin"?"macos":r.host?.platform}-${r.host?.arch==="x64"?"x64":r.host?.arch==="arm64"?"arm64":r.host?.arch}`;
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`:JSON.stringify(value);
const verifyDigest=value=>{const digest=value?.digest,{digest:_,digestAlgorithm,...evidence}=value??{};return value?.digestAlgorithm==="SHA-256"&&typeof digest==="string"&&crypto.createHash("sha256").update(canonical(evidence)).digest("hex")===digest};
const scopedKey=a=>`${a.target}\u0000${a.commit}\u0000${a.version}\u0000${a.mode}`;
const validArchive=a=>Boolean(a?.filename&&/^[A-Za-z0-9._-]+\.zip$/.test(a.filename)&&/^[a-f0-9]{64}$/.test(a?.sha256??"")&&Number(a?.size??0)>0);
const sameArchive=(a,b)=>Boolean(validArchive(a)&&validArchive(b)&&a.filename===b.filename&&a.sha256===b.sha256&&Number(a.size)===Number(b.size));

await mkdir(DIR,{recursive:true});
const allFiles=await readdir(DIR),attestations=[],badAttestations=[],runtimeSmokes=[],badRuntimeSmokes=[],serviceSmokes=[],badServiceSmokes=[];
for(const file of allFiles.filter(x=>/^cieav-platform-gate-.*\.json$/.test(x))){try{const a=JSON.parse(await readFile(path.join(DIR,file),"utf8")),reasons=[];if(a?.product!=="CIEAV"||a?.schemaVersion!==1)reasons.push("invalid_platform_gate_identity");if(!verifyDigest(a))reasons.push("invalid_platform_gate_digest");if(!a?.version||!a?.commit||!a?.target||!a?.mode)reasons.push("platform_gate_scope_missing");for(const key of ["platformBoundary","canonicalNamespace","browserWrapperCoreSyntax","controlCenterRealityBoundary","ephemeralProtocolSecretsScrubbed"])if(a?.checks?.[key]!==true)reasons.push(`platform_gate_${key}_missing`);if(reasons.length)badAttestations.push({file,reasons});else attestations.push({...a,_file:file})}catch{badAttestations.push({file,reasons:["invalid_json"]})}}
const attestByKey=new Map();for(const a of attestations){const k=scopedKey(a),old=attestByKey.get(k);if(!old||String(a.verifiedAt)>String(old.verifiedAt))attestByKey.set(k,a)}

for(const file of allFiles.filter(x=>/^cieav-runtime-smoke-.*\.json$/.test(x))){try{const a=JSON.parse(await readFile(path.join(DIR,file),"utf8")),reasons=[];if(a?.product!=="CIEAV"||a?.schemaVersion!==1)reasons.push("invalid_runtime_smoke_identity");if(!verifyDigest(a))reasons.push("invalid_runtime_smoke_digest");if(!a?.version||!a?.commit||!a?.target||!a?.mode)reasons.push("runtime_smoke_scope_missing");if(!validArchive(a?.archive))reasons.push("runtime_archive_identity_missing");for(const key of ["runtimeMetadata","cieavHelp","nodeVersion","browserWrapperSyntax","browserCoreSyntax","semanticApiSyntax","mcpSyntax","a2aSyntax","cliSurfaces","relocation"])if(a?.checks?.[key]!==true)reasons.push(`runtime_smoke_${key}_missing`);if(String(a?.target).startsWith("windows-")&&!a?.checks?.windowsAuthenticode)reasons.push("runtime_smoke_windows_signature_missing");if(String(a?.target).startsWith("macos-")&&!a?.checks?.macosCodeSign)reasons.push("runtime_smoke_macos_signature_missing");if(reasons.length)badRuntimeSmokes.push({file,reasons});else runtimeSmokes.push({...a,_file:file})}catch{badRuntimeSmokes.push({file,reasons:["invalid_json"]})}}
const runtimeByKey=new Map();for(const a of runtimeSmokes){const k=scopedKey(a),old=runtimeByKey.get(k);if(!old||String(a.verifiedAt)>String(old.verifiedAt))runtimeByKey.set(k,a)}

for(const file of allFiles.filter(x=>/^cieav-service-lifecycle-.*\.json$/.test(x))){try{const a=JSON.parse(await readFile(path.join(DIR,file),"utf8")),reasons=[];if(a?.product!=="CIEAV"||a?.schemaVersion!==1)reasons.push("invalid_service_lifecycle_identity");if(!verifyDigest(a))reasons.push("invalid_service_lifecycle_digest");if(!a?.version||!a?.commit||!a?.target||!a?.mode)reasons.push("service_lifecycle_scope_missing");if(!validArchive(a?.archive))reasons.push("service_lifecycle_archive_identity_missing");for(const key of ["install","status","headlessByDefault","stop","start","restart","uninstall","cleanup"])if(a?.checks?.[key]!==true)reasons.push(`service_lifecycle_${key}_missing`);if(reasons.length)badServiceSmokes.push({file,reasons});else serviceSmokes.push({...a,_file:file})}catch{badServiceSmokes.push({file,reasons:["invalid_json"]})}}
const serviceByKey=new Map();for(const a of serviceSmokes){const k=scopedKey(a),old=serviceByKey.get(k);if(!old||String(a.verifiedAt)>String(old.verifiedAt))serviceByKey.set(k,a)}

const files=allFiles.filter(x=>/^cieav-.*-(local|publish)-.*\.json$/.test(x));
const reports=[],rejected=[];
for(const file of files){
  try{
    const r=JSON.parse(await readFile(path.join(DIR,file),"utf8")),reasons=[];
    if(r?.product!=="CIEAV")reasons.push("wrong_product");
    if(Number(r?.schemaVersion??0)<MIN_REPORT_SCHEMA)reasons.push("legacy_report_schema");
    if(r?.verdict!=="PASS"||r?.qualifying!==true)reasons.push("not_qualifying_pass");
    if(r?.source?.dirty!==false)reasons.push("dirty_or_unknown_source");
    if(!r?.source?.commit||r.source.commit==="unknown")reasons.push("missing_source_commit");
    if(!r?.version)reasons.push("missing_version");
    if(Number(r?.summary?.failed??1)!==0)reasons.push("reported_failures");
    const target=targetOf(r);if(!/^(windows|macos|linux)-(x64|arm64)$/.test(target))reasons.push("unsupported_target_identity");
    const key=`${target}\u0000${r?.source?.commit}\u0000${r?.version}\u0000${r?.mode}`;
    const gate=attestByKey.get(key);if(!gate)reasons.push("missing_matching_platform_gate_attestation");
    const runtime=runtimeByKey.get(key);if(!runtime)reasons.push("missing_matching_clean_runtime_smoke");
    const service=serviceByKey.get(key);if(!service)reasons.push("missing_matching_service_lifecycle_smoke");
    if(runtime&&service&&!sameArchive(runtime.archive,service.archive))reasons.push("runtime_and_service_archive_identity_mismatch");
    if(reasons.length){rejected.push({file,reasons});continue}
    reports.push({...r,_file:file,_target:target,_platformGate:gate._file,_runtimeSmoke:runtime._file,_runtimeArchive:runtime.archive,_serviceSmoke:service._file});
  }catch{rejected.push({file,reasons:["invalid_json"]})}
}
reports.sort((a,b)=>String(b.finishedAt).localeCompare(String(a.finishedAt)));
const byTarget=new Map();for(const r of reports)if(!byTarget.has(r._target))byTarget.set(r._target,r);
const selected=requested.map(target=>({target,report:byTarget.get(target)})),missing=selected.filter(x=>!x.report).map(x=>x.target),present=selected.filter(x=>x.report),versions=[...new Set(present.map(x=>x.report.version))],commits=[...new Set(present.map(x=>x.report.source.commit))];
let verdict="PASS",reason="all required targets have matching source, platform, exact extracted-runtime archive, and OS-service lifecycle PASS evidence";
if(missing.length){verdict="FAIL";reason=`missing fully-gated qualifying PASS evidence for ${missing.join(', ')}`}
else if(versions.length!==1){verdict="FAIL";reason=`reports disagree on version: ${versions.join(', ')}`}
else if(commits.length!==1){verdict="FAIL";reason=`reports disagree on source commit: ${commits.join(', ')}`}
const qualification={schemaVersion:6,product:"CIEAV",verdict,reason,createdAt:new Date().toISOString(),minimumReportSchema:MIN_REPORT_SCHEMA,platformGateSchema:1,runtimeSmokeSchema:1,serviceLifecycleSchema:1,archiveIdentityRequired:true,requiredTargets:requested,version:versions.length===1?versions[0]:null,commit:commits.length===1?commits[0]:null,targets:selected.map(x=>({target:x.target,qualified:Boolean(x.report),report:x.report?x.report._file:null,platformGate:x.report?x.report._platformGate:null,runtimeSmoke:x.report?x.report._runtimeSmoke:null,serviceLifecycle:x.report?x.report._serviceSmoke:null,runtimeArchive:x.report?x.report._runtimeArchive:null,finishedAt:x.report?.finishedAt??null,mode:x.report?.mode??null,cleanSource:x.report?.source?.dirty===false})),rejectedEvidence:rejected.slice(0,100),rejectedPlatformGates:badAttestations.slice(0,100),rejectedRuntimeSmokes:badRuntimeSmokes.slice(0,100),rejectedServiceLifecycles:badServiceSmokes.slice(0,100)};
const jsonPath=path.join(DIR,"latest-qualification.json"),txtPath=path.join(DIR,"latest-qualification.txt");await writeFile(jsonPath,JSON.stringify(qualification,null,2)+"\n","utf8");
const lines=["CIEAV Cross-Platform Release Qualification","==========================================",`Verdict: ${verdict}`,`Reason: ${reason}`,`Version: ${qualification.version??'inconsistent/unavailable'}`,`Commit: ${qualification.commit??'inconsistent/unavailable'}`,`Rejected evidence files: ${rejected.length}`,`Rejected platform gates: ${badAttestations.length}`,`Rejected runtime smokes: ${badRuntimeSmokes.length}`,`Rejected service lifecycles: ${badServiceSmokes.length}`,"",...qualification.targets.map(x=>`${x.qualified?'PASS':'MISS'}  ${x.target}${x.report?` · ${x.report} · gate ${x.platformGate} · runtime ${x.runtimeSmoke} · service ${x.serviceLifecycle}`:''}`),"",`CROSS-PLATFORM QUALIFICATION: ${verdict}`];await writeFile(txtPath,lines.join("\n")+"\n","utf8");console.log(lines.join("\n"));if(verdict!=="PASS")process.exitCode=1;
