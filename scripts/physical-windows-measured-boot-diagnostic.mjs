#!/usr/bin/env node
import crypto from "node:crypto";
import {lstatSync,readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const fail=m=>{console.error(`CIEAV Windows measured-boot diagnostic FAIL: ${m}`);process.exit(2)};
const required=name=>{const value=process.env[name]?.trim();if(!value)fail(`${name} is required`);return value};
const sha256=value=>crypto.createHash("sha256").update(value).digest("hex");
const digestEnv=name=>{const value=required(name).toLowerCase();if(!/^[0-9a-f]{64}$/.test(value))fail(`${name} must be a SHA-256 hex digest`);return value};
const run=(exe,args,{maxBuffer=16*1024*1024}={})=>{const r=spawnSync(exe,args,{cwd:ROOT,encoding:"utf8",shell:false,maxBuffer});if(r.error)fail(`${path.basename(exe)} failed to execute: ${r.error.message}`);return r};
const parseJson=(raw,what)=>{try{return JSON.parse(String(raw).trim())}catch{fail(`${what} did not return valid JSON`)}};
const checkedJson=(exe,args,what)=>{const r=run(exe,args);if(r.status!==0)fail(`${what} failed with exit ${r.status}: ${String(r.stderr).trim().slice(0,1000)}`);return parseJson(r.stdout,what)};

if(process.env.CIEAV_WINDOWS_MEASURED_BOOT_DIAGNOSTIC!=="1")fail("CIEAV_WINDOWS_MEASURED_BOOT_DIAGNOSTIC=1 is required");
if(process.platform!=="win32")fail(`physical measured-boot diagnostic requires win32, got ${process.platform}`);
const collector=required("CIEAV_WINDOWS_MEASURED_BOOT_COLLECTOR"),expectedCollectorSha=digestEnv("CIEAV_WINDOWS_MEASURED_BOOT_COLLECTOR_SHA256");
if(!path.isAbsolute(collector))fail("collector path must be absolute");let st;try{st=lstatSync(collector)}catch{fail("collector is unavailable")}if(st.isSymbolicLink()||!st.isFile())fail("collector must be a regular non-symlink file");
const actualCollectorSha=sha256(readFileSync(collector));if(actualCollectorSha!==expectedCollectorSha)fail("collector digest mismatch");

const probe=checkedJson(collector,["probe"],"TBS collector probe");
if(probe.protocol!=="CIEAV_WINDOWS_TPM_MEASURED_BOOT_V1"||probe.operation!=="probe"||probe.available!==true||probe.qualification!=="UNQUALIFIED"||probe.pcrRange!=="0-15")fail("collector probe identity mismatch");

const npm=process.platform==="win32"?"npm.cmd":"npm",shell=process.env.ComSpec||"cmd.exe",build=spawnSync(shell,["/d","/s","/c",`${npm} run build:api`],{cwd:ROOT,encoding:"utf8",shell:false,maxBuffer:16*1024*1024});
if(build.status!==0)fail(`npm run build:api failed:\n${build.stdout}\n${build.stderr}`);
const {TPM_ALG_SHA256,parseWindowsWbcl,replaySrtmPcrs,serializePcrTable}=await import(pathToFileURL(path.join(ROOT,"apps/api/dist/windows-tpm-measured-boot.js")).href);

function collectAndReplay(type){
  const body=checkedJson(collector,["collect-log","--type",type],`TBS ${type} collection`);
  if(body.protocol!=="CIEAV_WINDOWS_TPM_MEASURED_BOOT_V1"||body.operation!=="collect-log"||body.qualification!=="UNQUALIFIED"||body.pcrRange!=="0-15"||typeof body.log!=="string"||!body.log)fail(`${type} collector response identity mismatch`);
  let raw;try{raw=Buffer.from(body.log,"base64url")}catch{fail(`${type} log is not base64url`)}if(raw.length!==body.bytes)fail(`${type} log byte count mismatch`);
  const parsed=parseWindowsWbcl(raw),sha256Algorithm=parsed.algorithms.find(x=>x.algorithmId===TPM_ALG_SHA256);if(!sha256Algorithm||sha256Algorithm.digestSize!==32)fail(`${type} log does not declare SHA-256 PCR bank`);
  const pcrMask=0xffff,replayed=replaySrtmPcrs(parsed,TPM_ALG_SHA256,pcrMask),table=serializePcrTable(replayed,pcrMask,32);
  return{type,logType:body.logType,bytes:raw.length,events:parsed.events.length,logSha256:sha256(raw),pcrMask:"0x0000ffff",pcrBank:"sha256",replayedPcrTableSha256:sha256(table),pcrs:Object.fromEntries([...replayed.entries()].map(([index,value])=>[String(index),value.toString("hex")]))};
}

const current=collectAndReplay("srtm-current"),boot=collectAndReplay("srtm-boot");
console.log(JSON.stringify({protocol:"CIEAV_WINDOWS_TPM_MEASURED_BOOT_DIAGNOSTIC_V1",collectorSha256:actualCollectorSha,qualification:"UNQUALIFIED",reason:"WBCL replay completed but no AIK-signed NCRYPT_CLAIM_PLATFORM quote/nonce/PCR digest has been verified",current,boot},null,2));
