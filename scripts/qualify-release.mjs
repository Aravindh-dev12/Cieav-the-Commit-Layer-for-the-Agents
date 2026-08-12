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

await mkdir(DIR,{recursive:true});
const allFiles=await readdir(DIR),attestations=[],badAttestations=[];
for(const file of allFiles.filter(x=>/^cieav-platform-gate-.*\.json$/.test(x))){try{const a=JSON.parse(await readFile(path.join(DIR,file),"utf8")),digest=a.digest,{digest:_,digestAlgorithm,...evidence}=a,reasons=[];if(a?.product!=="CIEAV"||a?.schemaVersion!==1)reasons.push("invalid_platform_gate_identity");if(a?.digestAlgorithm!=="SHA-256"||typeof digest!=="string")reasons.push("invalid_platform_gate_digest");else if(crypto.createHash("sha256").update(canonical(evidence)).digest("hex")!==digest)reasons.push("platform_gate_digest_mismatch");if(!a?.version||!a?.commit||!a?.target||!a?.mode)reasons.push("platform_gate_scope_missing");for(const key of ["platformBoundary","canonicalNamespace","browserWrapperCoreSyntax","controlCenterRealityBoundary","ephemeralProtocolSecretsScrubbed"])if(a?.checks?.[key]!==true)reasons.push(`platform_gate_${key}_missing`);if(reasons.length)badAttestations.push({file,reasons});else attestations.push({...a,_file:file})}catch{badAttestations.push({file,reasons:["invalid_json"]})}}
const attestationKey=a=>`${a.target}\u0000${a.commit}\u0000${a.version}\u0000${a.mode}`,attestByKey=new Map();for(const a of attestations){const k=attestationKey(a),old=attestByKey.get(k);if(!old||String(a.verifiedAt)>String(old.verifiedAt))attestByKey.set(k,a)}

const files=allFiles.filter(x=>/^cieav-.*-(local|publish)-.*\.json$/.test(x));
const reports=[],rejected=[];
for(const file of files){
  try{
    const r=JSON.parse(await readFile(path.join(DIR,file),"utf8"));
    const reasons=[];
    if(r?.product!=="CIEAV")reasons.push("wrong_product");
    if(Number(r?.schemaVersion??0)<MIN_REPORT_SCHEMA)reasons.push("legacy_report_schema");
    if(r?.verdict!=="PASS"||r?.qualifying!==true)reasons.push("not_qualifying_pass");
    if(r?.source?.dirty!==false)reasons.push("dirty_or_unknown_source");
    if(!r?.source?.commit||r.source.commit==="unknown")reasons.push("missing_source_commit");
    if(!r?.version)reasons.push("missing_version");
    if(Number(r?.summary?.failed??1)!==0)reasons.push("reported_failures");
    const target=targetOf(r);if(!/^(windows|macos|linux)-(x64|arm64)$/.test(target))reasons.push("unsupported_target_identity");
    const gate=attestByKey.get(`${target}\u0000${r?.source?.commit}\u0000${r?.version}\u0000${r?.mode}`);if(!gate)reasons.push("missing_matching_platform_gate_attestation");
    if(reasons.length){rejected.push({file,reasons});continue}
    reports.push({...r,_file:file,_target:target,_platformGate:gate._file});
  }catch{rejected.push({file,reasons:["invalid_json"]})}
}
reports.sort((a,b)=>String(b.finishedAt).localeCompare(String(a.finishedAt)));
const byTarget=new Map();for(const r of reports)if(!byTarget.has(r._target))byTarget.set(r._target,r);
const selected=requested.map(target=>({target,report:byTarget.get(target)})),missing=selected.filter(x=>!x.report).map(x=>x.target),present=selected.filter(x=>x.report),versions=[...new Set(present.map(x=>x.report.version))],commits=[...new Set(present.map(x=>x.report.source.commit))];
let verdict="PASS",reason="all required targets have clean matching qualifying PASS evidence plus expanded platform-gate attestations";
if(missing.length){verdict="FAIL";reason=`missing fully-gated qualifying PASS evidence for ${missing.join(', ')}`}
else if(versions.length!==1){verdict="FAIL";reason=`reports disagree on version: ${versions.join(', ')}`}
else if(commits.length!==1){verdict="FAIL";reason=`reports disagree on source commit: ${commits.join(', ')}`}
const qualification={schemaVersion:3,product:"CIEAV",verdict,reason,createdAt:new Date().toISOString(),minimumReportSchema:MIN_REPORT_SCHEMA,platformGateSchema:1,requiredTargets:requested,version:versions.length===1?versions[0]:null,commit:commits.length===1?commits[0]:null,targets:selected.map(x=>({target:x.target,qualified:Boolean(x.report),report:x.report?x.report._file:null,platformGate:x.report?x.report._platformGate:null,finishedAt:x.report?.finishedAt??null,mode:x.report?.mode??null,cleanSource:x.report?.source?.dirty===false})),rejectedEvidence:rejected.slice(0,100),rejectedPlatformGates:badAttestations.slice(0,100)};
const jsonPath=path.join(DIR,"latest-qualification.json"),txtPath=path.join(DIR,"latest-qualification.txt");await writeFile(jsonPath,JSON.stringify(qualification,null,2)+"\n","utf8");
const lines=["CIEAV Cross-Platform Release Qualification","==========================================",`Verdict: ${verdict}`,`Reason: ${reason}`,`Version: ${qualification.version??'inconsistent/unavailable'}`,`Commit: ${qualification.commit??'inconsistent/unavailable'}`,`Rejected evidence files: ${rejected.length}`,`Rejected platform gates: ${badAttestations.length}`,"",...qualification.targets.map(x=>`${x.qualified?'PASS':'MISS'}  ${x.target}${x.report?` · ${x.report} · gate ${x.platformGate}`:''}`),"",`CROSS-PLATFORM QUALIFICATION: ${verdict}`];await writeFile(txtPath,lines.join("\n")+"\n","utf8");console.log(lines.join("\n"));if(verdict!=="PASS")process.exitCode=1;
