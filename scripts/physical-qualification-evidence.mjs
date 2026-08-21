#!/usr/bin/env node
import crypto from "node:crypto";
import {mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
export const PHYSICAL_EVIDENCE_KIND="PHYSICAL_HARDWARE_QUALIFICATION";
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`:JSON.stringify(value)??"undefined";
const sha256=value=>crypto.createHash("sha256").update(value).digest("hex");
const gitHead=()=>{const r=spawnSync("git",["rev-parse","HEAD"],{cwd:ROOT,encoding:"utf8",shell:false});if(r.status!==0)throw new Error("cannot resolve current Git commit");return r.stdout.trim()};
const version=()=>JSON.parse(readFileSync(path.join(ROOT,"package.json"),"utf8")).version;
export function normalizedTarget(platform=process.platform,arch=process.arch){const os=platform==="win32"?"windows":platform==="darwin"?"macos":platform==="linux"?"linux":platform;const cpu=arch==="x64"?"x64":arch==="arm64"?"arm64":arch;return`${os}-${cpu}`}
export function buildPhysicalQualificationEvidence({mechanism,claims={},target=normalizedTarget(),createdAt=new Date().toISOString(),commit=gitHead(),productVersion=version()}){
  if(process.env.CIEAV_PHYSICAL_HARDWARE_QUALIFICATION!=="1")throw new Error("physical evidence may only be emitted during explicit physical qualification");
  if(typeof mechanism!=="string"||!/^[A-Z0-9_]{3,80}$/.test(mechanism))throw new Error("invalid physical qualification mechanism");
  if(!target||typeof target!=="string")throw new Error("invalid physical qualification target");
  const evidence={schemaVersion:1,product:"CIEAV",kind:PHYSICAL_EVIDENCE_KIND,verdict:"PASS",authority:false,physical:true,runnerClass:"self-hosted-release-hardware",createdAt,version:productVersion,commit,target,mechanism,claims};
  return{...evidence,digestAlgorithm:"SHA-256",digest:sha256(canonical(evidence))};
}
export function verifyPhysicalQualificationEvidence(value,{commit,productVersion,maxAgeMs=7*24*60*60*1000,now=Date.now()}={}){
  const reasons=[];if(!value||typeof value!=="object")return{ok:false,reasons:["evidence_not_object"]};const {digest,digestAlgorithm,...evidence}=value;
  if(evidence.kind!==PHYSICAL_EVIDENCE_KIND||evidence.verdict!=="PASS"||evidence.authority!==false||evidence.physical!==true||evidence.runnerClass!=="self-hosted-release-hardware")reasons.push("evidence_contract_mismatch");
  if(digestAlgorithm!=="SHA-256"||typeof digest!=="string"||sha256(canonical(evidence))!==digest)reasons.push("evidence_digest_mismatch");
  if(commit&&evidence.commit!==commit)reasons.push("evidence_commit_mismatch");if(productVersion&&evidence.version!==productVersion)reasons.push("evidence_version_mismatch");
  const created=Date.parse(evidence.createdAt);if(!Number.isFinite(created)||created>now+60_000||now-created>maxAgeMs)reasons.push("evidence_stale_or_future_dated");
  if(typeof evidence.target!=="string"||!evidence.target||typeof evidence.mechanism!=="string"||!evidence.mechanism)reasons.push("evidence_identity_missing");
  return{ok:reasons.length===0,reasons,evidence:value};
}
export function writePhysicalQualificationEvidence(input){const out=buildPhysicalQualificationEvidence(input),dir=path.join(ROOT,"release","reports","physical");mkdirSync(dir,{recursive:true});const safe=`${out.target}-${out.mechanism.toLowerCase().replace(/[^a-z0-9_-]/g,"-")}.json`,file=path.join(dir,safe);writeFileSync(file,JSON.stringify(out,null,2)+"\n",{encoding:"utf8",mode:0o600});return{file,evidence:out}}
