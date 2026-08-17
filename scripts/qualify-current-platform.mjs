#!/usr/bin/env node
import {spawnSync} from "node:child_process";
import {existsSync,readdirSync,readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const platform=process.platform==="win32"?"windows":process.platform==="darwin"?"macos":process.platform;
const arch=process.arch==="x64"?"x64":process.arch==="arm64"?"arm64":process.arch;
const target=`${platform}-${arch}`;
if(!/^(windows|macos|linux)-(x64|arm64)$/.test(target))throw new Error(`Unsupported qualification target: ${target}`);

const result=spawnSync(process.execPath,[path.join(ROOT,"scripts/qualify-release.mjs"),"--require",target],{cwd:ROOT,stdio:"inherit",shell:false,env:process.env});
if(result.error)throw result.error;
if((result.status??1)!==0){
  const git=spawnSync("git",["rev-parse","HEAD"],{cwd:ROOT,encoding:"utf8",shell:false});
  const commit=(git.stdout||"").trim();
  const version=JSON.parse(readFileSync(path.join(ROOT,"package.json"),"utf8")).version;
  const reportsDir=path.join(ROOT,"release","reports");
  const metadataPath=path.join(ROOT,"release-out",`metadata-${target}.json`);
  let archive=null;
  try{archive=JSON.parse(readFileSync(metadataPath,"utf8"))}catch{}
  const sameArchive=a=>Boolean(archive&&a?.filename===archive.filename&&a?.sha256===archive.sha256&&Number(a?.size)===Number(archive.size));
  const files=existsSync(reportsDir)?readdirSync(reportsDir):[];
  const readReports=prefix=>files.filter(x=>x.startsWith(prefix)&&x.endsWith(".json")).flatMap(file=>{try{return [{file,value:JSON.parse(readFileSync(path.join(reportsDir,file),"utf8"))}]}catch{return []}});
  const scope=r=>r?.target===target&&r?.commit===commit&&r?.version===version&&r?.mode==="local";
  const runtimes=readReports("cieav-runtime-smoke-").filter(x=>scope(x.value));
  const services=readReports("cieav-service-lifecycle-").filter(x=>scope(x.value));
  const gates=readReports("cieav-platform-gate-").filter(x=>scope(x.value));
  const runtimeMatch=runtimes.find(x=>sameArchive(x.value.archive));
  const serviceMatch=services.find(x=>sameArchive(x.value.archive));
  const gateMatch=gates[0];
  console.error("\nCurrent-target qualification diagnosis");
  console.error("====================================");
  console.error(`Target:  ${target}`);
  console.error(`Commit:  ${commit||"unknown"}`);
  console.error(`Version: ${version}`);
  if(archive)console.error(`Archive: ${archive.filename} · ${archive.sha256} · ${archive.size} bytes`);
  else console.error(`Archive: missing ${path.relative(ROOT,metadataPath)}`);
  console.error(`Platform gate: ${gateMatch?`MATCH ${gateMatch.file}`:"MISSING for current commit/version/mode"}`);
  console.error(`Runtime smoke: ${runtimeMatch?`MATCH ${runtimeMatch.file}`:runtimes.length?"PRESENT but archive identity does not match current archive":"MISSING for current commit/version/mode"}`);
  console.error(`Service lifecycle: ${serviceMatch?`MATCH ${serviceMatch.file}`:services.length?"PRESENT but archive identity does not match current archive":"MISSING for current commit/version/mode"}`);
  if(!serviceMatch&&archive)console.error("Next required evidence: run `npm run release:smoke:service` only after rebuilding the archive from this exact commit and passing `npm run release:smoke:runtime`.");
  if(!gateMatch)console.error("Current platform-gate evidence is also required; run `npm run release:verify` before re-qualifying.");
}
process.exit(result.status??1);
