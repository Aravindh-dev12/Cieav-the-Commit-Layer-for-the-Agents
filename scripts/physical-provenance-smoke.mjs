#!/usr/bin/env node
import assert from "node:assert/strict";
import {chmodSync,mkdirSync,rmSync,writeFileSync,readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {buildPhysicalQualificationEvidence} from "./physical-qualification-evidence.mjs";
import {verifyPhysicalProvenanceSet} from "./verify-physical-provenance.mjs";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),physicalDir=path.join(ROOT,"release","reports","physical"),tmp=path.join(ROOT,"release","reports","provenance-smoke-tmp");
mkdirSync(physicalDir,{recursive:true});mkdirSync(tmp,{recursive:true});
const git=(...args)=>{const r=spawnSync("git",args,{cwd:ROOT,encoding:"utf8",shell:false});if(r.status!==0)throw new Error("git failed");return r.stdout.trim()};
const commit=git("rev-parse","HEAD"),version=JSON.parse(readFileSync(path.join(ROOT,"package.json"),"utf8")).version,repo="Aravindh-dev12/Cieav-the-Commit-Layer-for-the-Internet";
const js=path.join(tmp,"fake-gh.mjs"),log=path.join(tmp,"args.json");
writeFileSync(js,`import{writeFileSync}from"node:fs";const a=process.argv.slice(2);writeFileSync(${JSON.stringify(log)},JSON.stringify(a));if(process.env.CIEAV_FAKE_GH_FAIL==="1")process.exit(2);console.log(JSON.stringify([{verificationResult:{statement:{}}}]));\n`,`utf8`);
const wrapper=process.platform==="win32"?path.join(tmp,"gh.cmd"):path.join(tmp,"gh");
if(process.platform==="win32")writeFileSync(wrapper,`@echo off\r\n"${process.execPath}" "${js}" %*\r\n`,`utf8`);else{writeFileSync(wrapper,`#!/bin/sh\nexec "${process.execPath}" "${js}" "$@"\n`,`utf8`);chmodSync(wrapper,0o755)}
const created=[];const old=process.env.CIEAV_PHYSICAL_HARDWARE_QUALIFICATION;process.env.CIEAV_PHYSICAL_HARDWARE_QUALIFICATION="1";
try{
 const selected={};for(const [platform,mechanism,target] of [["windows","WINDOWS_TPM_NATIVE_AIK","windows-x64"],["macos","MACOS_SECURE_ENCLAVE","macos-arm64"],["linux","LINUX_TPM2_ESAPI_EK_AK_MEASURED_BOOT","linux-x64"]]){const evidence=buildPhysicalQualificationEvidence({mechanism,target,claims:{smoke:true},commit,productVersion:version});const file=path.join(physicalDir,`provenance-smoke-${platform}.json`);writeFileSync(file,JSON.stringify(evidence,null,2)+"\n","utf8");created.push(file);selected[platform]={file:path.relative(ROOT,file).split(path.sep).join("/"),target,mechanism,digest:evidence.digest,createdAt:evidence.createdAt}}
 const physicalSet={schemaVersion:1,product:"CIEAV",kind:"PHYSICAL_QUALIFICATION_SET",verdict:"PASS",reasons:[],createdAt:new Date().toISOString(),version,commit,maxEvidenceAgeHours:168,selected};
 const ok=verifyPhysicalProvenanceSet({physicalSet,repo,commit,version,gh:wrapper});assert.equal(ok.verdict,"PASS");assert.equal(ok.authority,false);assert.equal(Object.keys(ok.selected).length,3);
 const args=JSON.parse(readFileSync(log,"utf8"));for(const token of ["attestation","verify","--repo",repo,"--signer-workflow",`${repo}/.github/workflows/physical-hardware-qualification.yml`,"--source-digest",commit])assert(args.includes(token),`missing gh attestation arg ${token}`);
 const bad=structuredClone(physicalSet);bad.selected.windows.digest="0".repeat(64);assert.throws(()=>verifyPhysicalProvenanceSet({physicalSet:bad,repo,commit,version,gh:wrapper}),/selected digest mismatch/);
 process.env.CIEAV_FAKE_GH_FAIL="1";assert.throws(()=>verifyPhysicalProvenanceSet({physicalSet,repo,commit,version,gh:wrapper}),/provenance verification failed/);delete process.env.CIEAV_FAKE_GH_FAIL;
 console.log("CIEAV physical provenance smoke PASS - exact repo/workflow/commit attestation policy + evidence binding + verifier failure rejection + authority=false");
}finally{if(old===undefined)delete process.env.CIEAV_PHYSICAL_HARDWARE_QUALIFICATION;else process.env.CIEAV_PHYSICAL_HARDWARE_QUALIFICATION=old;for(const f of created)rmSync(f,{force:true});rmSync(tmp,{recursive:true,force:true})}
