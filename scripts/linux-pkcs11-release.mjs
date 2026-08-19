#!/usr/bin/env node
import {existsSync,mkdirSync,readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const source=readFileSync(path.join(ROOT,"native/linux-pkcs11/main.cpp"),"utf8");
const fail=m=>{console.error(`CIEAV Linux PKCS11 gate FAIL: ${m}`);process.exit(2)};
for(const token of ["dlopen","lstat","CKM_ECDSA","C_Initialize","C_GetSlotList","C_OpenSession","C_Login","C_FindObjectsInit","C_GetAttributeValue","C_SignInit","C_Sign","CKA_EC_POINT","CKA_EC_PARAMS","describe","sign-es256","attestationRequired","CIEAV_KEY_PROVIDER_V1"])if(!source.includes(token))fail(`native bridge missing ${token}`);
if(!source.includes("hardwareBacked\\\":false"))fail("PKCS11 probe must not claim hardware backing without verified attestation");
if(process.platform!=="linux"){console.log(`CIEAV Linux PKCS11 gate PASS · platform=${process.platform} · source invariants verified; Linux compile/probe not applicable`);process.exit(0)}
const run=(exe,args,opts={})=>spawnSync(exe,args,{cwd:ROOT,encoding:"utf8",shell:false,...opts});
mkdirSync(path.join(ROOT,".tmp/linux-pkcs11"),{recursive:true});
const bridge=path.join(ROOT,".tmp/linux-pkcs11/cieav-linux-pkcs11");
let r=run("c++",["-std=c++17","-O2","-Wall","-Wextra","-Werror","-fstack-protector-strong","-D_FORTIFY_SOURCE=2","-fPIE","native/linux-pkcs11/main.cpp","-Wl,-z,relro,-z,now","-pie","-ldl","-o",bridge]);
if(r.status!==0)fail(`compile failed\n${r.stdout}\n${r.stderr}`);
if(!existsSync(bridge))fail("compiled bridge executable not found");
r=run(bridge,["probe"],{env:{}});
if(r.status!==20)fail(`unconfigured probe must fail closed with exit 20; got ${r.status}: ${r.stdout} ${r.stderr}`);
let body;try{body=JSON.parse(String(r.stdout).trim())}catch{fail(`probe did not return JSON: ${r.stdout}`)}
if(body.protocol!=="CIEAV_KEY_PROVIDER_V1"||body.provider!=="TPM"||body.nativeProvider!=="PKCS11"||body.available!==false||body.hardwareBacked!==false)fail("unconfigured probe boundary mismatch");
console.log("CIEAV Linux PKCS11 gate PASS · bridge compiled · unconfigured hardware probe fails closed · live token qualification remains deployment-specific");
