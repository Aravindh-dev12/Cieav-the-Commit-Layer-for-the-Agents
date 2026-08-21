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
const pinnedExecutable=(pathValue,digestName,label)=>{if(!path.isAbsolute(pathValue))fail(`${label} path must be absolute`);let st;try{st=lstatSync(pathValue)}catch{fail(`${label} is unavailable`)}if(st.isSymbolicLink()||!st.isFile())fail(`${label} must be a regular non-symlink file`);const actual=sha256(readFileSync(pathValue)),expected=digestEnv(digestName);if(actual!==expected)fail(`${label} digest mismatch`);return actual};

if(process.env.CIEAV_WINDOWS_MEASURED_BOOT_DIAGNOSTIC!=="1")fail("CIEAV_WINDOWS_MEASURED_BOOT_DIAGNOSTIC=1 is required");
if(process.platform!=="win32")fail(`physical measured-boot diagnostic requires win32, got ${process.platform}`);
const collector=required("CIEAV_WINDOWS_MEASURED_BOOT_COLLECTOR"),actualCollectorSha=pinnedExecutable(collector,"CIEAV_WINDOWS_MEASURED_BOOT_COLLECTOR_SHA256","collector");
const claimProbe=required("CIEAV_WINDOWS_MEASURED_BOOT_PROBE"),actualProbeSha=pinnedExecutable(claimProbe,"CIEAV_WINDOWS_MEASURED_BOOT_PROBE_SHA256","claim probe"),aikName=required("CIEAV_WINDOWS_TPM_AIK_NAME"),aikUser=process.env.CIEAV_WINDOWS_TPM_AIK_USER==="1";

const collectorProbe=checkedJson(collector,["probe"],"TBS collector probe");
if(collectorProbe.protocol!=="CIEAV_WINDOWS_TPM_MEASURED_BOOT_V1"||collectorProbe.operation!=="probe"||collectorProbe.available!==true||collectorProbe.qualification!=="UNQUALIFIED"||collectorProbe.pcrRange!=="0-15")fail("collector probe identity mismatch");
const platformProbe=checkedJson(claimProbe,["probe","--aik",aikName,...(aikUser?["--aik-user"]:[])],"TPM platform-claim probe");
if(platformProbe.protocol!=="CIEAV_WINDOWS_TPM_MEASURED_BOOT_PROBE_V1"||platformProbe.operation!=="probe"||platformProbe.hardwareBacked!==true||platformProbe.qualification!=="UNQUALIFIED"||platformProbe.pcrMask!==65535||platformProbe.nonceBytes!==32||platformProbe.aikName!==aikName||platformProbe.aikMachineKey===aikUser)fail("platform-claim probe identity mismatch");
const verifiedAttempt=Array.isArray(platformProbe.claimAttempts)?platformProbe.claimAttempts.find(x=>x?.verified===true&&x?.createStatus==="0x00000000"&&x?.verifyStatus==="0x00000000"&&Number(x?.claimBytes)>0&&typeof x?.claim==="string"&&x.claim):undefined;
if(!verifiedAttempt)fail("no nonce-bound platform claim was created, emitted, and locally verified");
let claimRaw;try{claimRaw=Buffer.from(verifiedAttempt.claim,"base64url")}catch{fail("platform claim is not base64url")}if(claimRaw.length!==verifiedAttempt.claimBytes)fail("platform claim byte count mismatch");

const npm=process.platform==="win32"?"npm.cmd":"npm",shell=process.env.ComSpec||"cmd.exe",build=spawnSync(shell,["/d","/s","/c",`${npm} run build:api`],{cwd:ROOT,encoding:"utf8",shell:false,maxBuffer:16*1024*1024});
if(build.status!==0)fail(`npm run build:api failed:\n${build.stdout}\n${build.stderr}`);
const measured=await import(pathToFileURL(path.join(ROOT,"apps/api/dist/windows-tpm-measured-boot.js")).href),bindingModule=await import(pathToFileURL(path.join(ROOT,"apps/api/dist/windows-tpm-measured-boot-verifier.js")).href);
const {TPM_ALG_SHA256,parseWindowsWbcl,replaySrtmPcrs,serializePcrTable}=measured,{verifyWindowsPlatformPcrReplay}=bindingModule;

function collectAndReplay(type){
  const body=checkedJson(collector,["collect-log","--type",type],`TBS ${type} collection`);
  if(body.protocol!=="CIEAV_WINDOWS_TPM_MEASURED_BOOT_V1"||body.operation!=="collect-log"||body.qualification!=="UNQUALIFIED"||body.pcrRange!=="0-15"||typeof body.log!=="string"||!body.log)fail(`${type} collector response identity mismatch`);
  let raw;try{raw=Buffer.from(body.log,"base64url")}catch{fail(`${type} log is not base64url`)}if(raw.length!==body.bytes)fail(`${type} log byte count mismatch`);
  const parsed=parseWindowsWbcl(raw),sha256Algorithm=parsed.algorithms.find(x=>x.algorithmId===TPM_ALG_SHA256);if(!sha256Algorithm||sha256Algorithm.digestSize!==32)fail(`${type} log does not declare SHA-256 PCR bank`);
  const pcrMask=0xffff,replayed=replaySrtmPcrs(parsed,TPM_ALG_SHA256,pcrMask),table=serializePcrTable(replayed,pcrMask,32);
  return{raw,summary:{type,logType:body.logType,bytes:raw.length,events:parsed.events.length,logSha256:sha256(raw),pcrMask:"0x0000ffff",pcrBank:"sha256",replayedPcrTableSha256:sha256(table),pcrs:Object.fromEntries([...replayed.entries()].map(([index,value])=>[String(index),value.toString("hex")]))}};
}

const current=collectAndReplay("srtm-current"),boot=collectAndReplay("srtm-boot");
let binding;try{binding=verifyWindowsPlatformPcrReplay(claimRaw,current.raw,0xffff)}catch(err){fail(`platform claim PCRs do not bind to current WBCL replay: ${err instanceof Error?err.message:String(err)}`)}
console.log(JSON.stringify({protocol:"CIEAV_WINDOWS_TPM_MEASURED_BOOT_DIAGNOSTIC_V1",collectorSha256:actualCollectorSha,claimProbeSha256:actualProbeSha,aikName,aikMachineKey:!aikUser,qualification:"UNQUALIFIED",platformClaim:{claimAttempt:verifiedAttempt.name,claimSha256:sha256(claimRaw),claimBytes:claimRaw.length,nonceBytes:platformProbe.nonceBytes,pcrMask:"0x0000ffff",locallyVerified:true,pcrReplayBound:true,pcrAlgorithm:binding.pcrAlgorithm,pcrTableSha256:binding.pcrTableSha256},reason:"Nonce-bound NCRYPT_CLAIM_PLATFORM creation/local verification and claim-PCR-to-WBCL replay binding passed, but Secure Boot/PCR policy and independent remote-verifier qualification are not yet complete",current:current.summary,boot:boot.summary},null,2));
