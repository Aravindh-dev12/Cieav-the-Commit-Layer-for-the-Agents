#!/usr/bin/env node
import {readdir,readFile,writeFile,mkdir} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const DIR=path.join(ROOT,"release","reports");
const arg=name=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:undefined};
const requested=(arg("--require")??process.env.CIEAV_RELEASE_TARGETS??"windows-x64,macos-arm64,linux-x64").split(",").map(x=>x.trim()).filter(Boolean);
const targetOf=r=>`${r.host?.platform==="win32"?"windows":r.host?.platform==="darwin"?"macos":r.host?.platform}-${r.host?.arch==="x64"?"x64":r.host?.arch==="arm64"?"arm64":r.host?.arch}`;

await mkdir(DIR,{recursive:true});
const files=(await readdir(DIR)).filter(x=>/^cieav-.*-(local|publish)-.*\.json$/.test(x));
const reports=[];
for(const file of files){
  try{
    const r=JSON.parse(await readFile(path.join(DIR,file),"utf8"));
    if(r?.product==="CIEAV"&&r?.verdict==="PASS"&&r?.source?.commit&&r?.version)reports.push({...r,_file:file,_target:targetOf(r)});
  }catch{}
}
reports.sort((a,b)=>String(b.finishedAt).localeCompare(String(a.finishedAt)));

const byTarget=new Map();
for(const r of reports)if(!byTarget.has(r._target))byTarget.set(r._target,r);
const selected=requested.map(target=>({target,report:byTarget.get(target)}));
const missing=selected.filter(x=>!x.report).map(x=>x.target);
const present=selected.filter(x=>x.report);
const versions=[...new Set(present.map(x=>x.report.version))];
const commits=[...new Set(present.map(x=>x.report.source.commit))];
let verdict="PASS",reason="all required targets have matching PASS evidence";
if(missing.length){verdict="FAIL";reason=`missing PASS evidence for ${missing.join(', ')}`}
else if(versions.length!==1){verdict="FAIL";reason=`reports disagree on version: ${versions.join(', ')}`}
else if(commits.length!==1){verdict="FAIL";reason=`reports disagree on source commit: ${commits.join(', ')}`}

const qualification={
  schemaVersion:1,
  product:"CIEAV",
  verdict,
  reason,
  createdAt:new Date().toISOString(),
  requiredTargets:requested,
  version:versions.length===1?versions[0]:null,
  commit:commits.length===1?commits[0]:null,
  targets:selected.map(x=>({target:x.target,qualified:Boolean(x.report),report:x.report?x.report._file:null,finishedAt:x.report?.finishedAt??null,mode:x.report?.mode??null}))
};
const jsonPath=path.join(DIR,"latest-qualification.json"),txtPath=path.join(DIR,"latest-qualification.txt");
await writeFile(jsonPath,JSON.stringify(qualification,null,2)+"\n","utf8");
const lines=[
  "CIEAV Cross-Platform Release Qualification",
  "==========================================",
  `Verdict: ${verdict}`,
  `Reason: ${reason}`,
  `Version: ${qualification.version??'inconsistent/unavailable'}`,
  `Commit: ${qualification.commit??'inconsistent/unavailable'}`,
  "",
  ...qualification.targets.map(x=>`${x.qualified?'PASS':'MISS'}  ${x.target}${x.report?` · ${x.report}`:''}`),
  "",
  `CROSS-PLATFORM QUALIFICATION: ${verdict}`
];
await writeFile(txtPath,lines.join("\n")+"\n","utf8");
console.log(lines.join("\n"));
if(verdict!=="PASS")process.exitCode=1;
