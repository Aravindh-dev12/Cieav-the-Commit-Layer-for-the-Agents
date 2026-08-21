#!/usr/bin/env node
import crypto from "node:crypto";
import {lstatSync,readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const arg=name=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:undefined},has=name=>process.argv.includes(name);
const run=(cmd,args,opts={})=>{const r=spawnSync(cmd,args,{cwd:ROOT,encoding:"utf8",shell:false,maxBuffer:8*1024*1024,...opts});if(r.error)throw r.error;if(r.status!==0)throw new Error(`${cmd} ${args.join(" ")} failed: ${String(r.stderr||r.stdout||"").trim().slice(-3000)}`);return String(r.stdout||"").trim()};
const regularAbsolute=(name,value)=>{if(!value)throw new Error(`${name} is required`);const file=path.resolve(value);if(!path.isAbsolute(file))throw new Error(`${name} must be absolute`);let st;try{st=lstatSync(file)}catch{throw new Error(`${name} is unavailable: ${file}`)}if(st.isSymbolicLink()||!st.isFile())throw new Error(`${name} must be a regular non-symlink file`);return file};
const sha=file=>crypto.createHash("sha256").update(readFileSync(file)).digest("hex");
const jsonObject=(name,file)=>{let v;try{v=JSON.parse(readFileSync(file,"utf8"))}catch{throw new Error(`${name} must contain valid JSON`)}if(!v||typeof v!=="object"||Array.isArray(v))throw new Error(`${name} must contain a JSON object`);return v};
const target=String(arg("--target")||"").toLowerCase();if(!["windows","macos","linux"].includes(target))throw new Error("usage: production-physical-pins-bootstrap.mjs --target <windows|macos|linux> [target options] [--configure-github]");
const vars={};
if(target==="windows"){
 const bridge=regularAbsolute("--bridge",arg("--bridge")),config=regularAbsolute("--config",arg("--config")),cfg=jsonObject("--config",config);
 for(const k of ["executablePath","executableSha256","aikName","requestKeyName","consequenceKeyName","expectedAikCertificateSha256","expectedAikRootCertificateSha256"])if(typeof cfg[k]!=="string"||!cfg[k])throw new Error(`Windows config missing ${k}`);
 vars.CIEAV_WINDOWS_TPM_CNG_BRIDGE=bridge;vars.CIEAV_WINDOWS_TPM_CNG_BRIDGE_SHA256=sha(bridge);vars.CIEAV_WINDOWS_NATIVE_ATTESTATION_CONFIG=config;vars.CIEAV_WINDOWS_NATIVE_ATTESTATION_CONFIG_SHA256=sha(config);
}else if(target==="macos"){
 const bridge=regularAbsolute("--bridge",arg("--bridge")),keyName=String(arg("--key-name")||"").trim();if(!keyName||keyName.length>200)throw new Error("--key-name is required and must be <=200 characters");vars.CIEAV_MACOS_SECURE_ENCLAVE_BRIDGE=bridge;vars.CIEAV_MACOS_SECURE_ENCLAVE_BRIDGE_SHA256=sha(bridge);vars.CIEAV_MACOS_SECURE_ENCLAVE_KEY_NAME=keyName;
}else{
 const config=regularAbsolute("--config",arg("--config")),cfg=jsonObject("--config",config);for(const k of ["collector","eventLog","bootPolicy","ekCertificate","readPublic","makeCredential","activateCredential","ekTrust"])if(!cfg[k])throw new Error(`Linux TPM2 config missing ${k}`);vars.CIEAV_LINUX_TPM2_PHYSICAL_CONFIG=config;vars.CIEAV_LINUX_TPM2_PHYSICAL_CONFIG_SHA256=sha(config);
}
let repository=null,configured=false;
if(has("--configure-github")){
 repository=String(arg("--repository")??process.env.CIEAV_GITHUB_REPOSITORY??JSON.parse(run("gh",["repo","view","--json","nameWithOwner"])).nameWithOwner??"").trim();if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository))throw new Error("unable to resolve GitHub repository identity");for(const [name,value] of Object.entries(vars))run("gh",["variable","set",name,"--repo",repository,"--body",value]);configured=true;
}
console.log(JSON.stringify({schemaVersion:1,product:"CIEAV",kind:"PRODUCTION_PHYSICAL_PIN_BOOTSTRAP",authority:false,target,repository,configuredGitHub:configured,variables:Object.fromEntries(Object.entries(vars).map(([k,v])=>[k,k.endsWith("SHA256")?v:path.basename(v)===v?v:path.resolve(v)])),hardwareQualified:false,next:configured?"run the corresponding physical qualification preflight on that self-hosted runner":"review the computed pins, then rerun with --configure-github on the target host"},null,2));
