#!/usr/bin/env node
import crypto from "node:crypto";
import {existsSync,mkdirSync,readdirSync,readFileSync,writeFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {verifyPhysicalQualificationEvidence} from "./physical-qualification-evidence.mjs";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),DIR=path.join(ROOT,"release","reports"),PHYSICAL_DIR=path.join(DIR,"physical");
const canonical=v=>Array.isArray(v)?`[${v.map(canonical).join(",")}]`:v&&typeof v==="object"?`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`:JSON.stringify(v)??"undefined";
const sha256=v=>crypto.createHash("sha256").update(v).digest("hex");
const head=spawnSync("git",["rev-parse","HEAD"],{cwd:ROOT,encoding:"utf8",shell:false});if(head.status!==0)throw new Error("cannot resolve current Git commit");const commit=head.stdout.trim(),version=JSON.parse(readFileSync(path.join(ROOT,"package.json"),"utf8")).version;
const maxAgeHours=Number(process.env.CIEAV_PHYSICAL_EVIDENCE_MAX_AGE_HOURS??168);if(!Number.isFinite(maxAgeHours)||maxAgeHours<=0||maxAgeHours>720)throw new Error("CIEAV_PHYSICAL_EVIDENCE_MAX_AGE_HOURS must be in (0,720]");
const files=existsSync(PHYSICAL_DIR)?readdirSync(PHYSICAL_DIR).filter(x=>x.endsWith(".json")).map(x=>path.join(PHYSICAL_DIR,x)):[],valid=[];
for(const file of files){let value;try{value=JSON.parse(readFileSync(file,"utf8"))}catch{continue}const check=verifyPhysicalQualificationEvidence(value,{commit,productVersion:version,maxAgeMs:maxAgeHours*60*60*1000});if(check.ok)valid.push({...value,file:path.relative(ROOT,file).split(path.sep).join("/")})}
const requirements=[
 {id:"windows",accept:new Set(["WINDOWS_TPM_NATIVE_AIK","WINDOWS_TPM_MAA"])},
 {id:"macos",accept:new Set(["MACOS_SECURE_ENCLAVE"])},
 {id:"linux",accept:new Set(["LINUX_TPM2_ESAPI_EK_AK_MEASURED_BOOT"])}
],reasons=[],selected={};
for(const req of requirements){const matches=valid.filter(x=>req.accept.has(x.mechanism));if(!matches.length){reasons.push(`physical_${req.id}_qualification_missing`);continue}matches.sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));selected[req.id]={file:matches[0].file,target:matches[0].target,mechanism:matches[0].mechanism,digest:matches[0].digest,createdAt:matches[0].createdAt}}
const verdict=reasons.length?"FAIL":"PASS",evidence={schemaVersion:1,product:"CIEAV",kind:"PHYSICAL_QUALIFICATION_SET",verdict,reasons,createdAt:new Date().toISOString(),version,commit,maxEvidenceAgeHours:maxAgeHours,selected};const out={...evidence,digestAlgorithm:"SHA-256",digest:sha256(canonical(evidence))};mkdirSync(DIR,{recursive:true});writeFileSync(path.join(DIR,"latest-physical-qualification.json"),JSON.stringify(out,null,2)+"\n","utf8");const text=["CIEAV Physical Qualification","============================",`Verdict: ${verdict}`,`Version: ${version}`,`Commit: ${commit}`,...Object.entries(selected).map(([k,v])=>`PASS  ${k} · ${v.mechanism} · ${v.target}`),...reasons.map(x=>`FAIL  ${x}`),"",`PHYSICAL QUALIFICATION: ${verdict}`].join("\n")+"\n";writeFileSync(path.join(DIR,"latest-physical-qualification.txt"),text,"utf8");console.log(text);if(verdict!=="PASS")process.exitCode=1;
