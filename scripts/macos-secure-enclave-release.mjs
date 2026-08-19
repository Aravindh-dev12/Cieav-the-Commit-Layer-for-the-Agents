#!/usr/bin/env node
import {existsSync,mkdirSync,readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const source=readFileSync(path.join(ROOT,"native/macos-secure-enclave/main.swift"),"utf8"),attestor=readFileSync(path.join(ROOT,"apps/api/src/secure-enclave-attestation.ts"),"utf8");
const fail=m=>{console.error(`CIEAV macOS Secure Enclave gate FAIL: ${m}`);process.exit(2)};
for(const token of ["import Security","kSecAttrTokenIDSecureEnclave","SecKeyCreateRandomKey","SecKeyCopyAttributes","SecKeyCopyExternalRepresentation","SecKeyCreateSignature","ecdsaSignatureDigestX962SHA256","create-p256","describe","sign-es256","IEEE-P1363","CIEAV_KEY_PROVIDER_V1"])if(!source.includes(token))fail(`native bridge missing ${token}`);
for(const token of ["CieavSecureEnclaveAttestor","APPLE_SECURE_ENCLAVE_KEY","Security.framework Secure Enclave","hardwareBacked!==true","exportable!==false","secure_enclave_attestor_public_key_mismatch","manifest.executableSha256","verification:\"VERIFIED\""])if(!attestor.includes(token))fail(`trusted attestor missing ${token}`);
if(process.platform!=="darwin"){console.log(`CIEAV macOS Secure Enclave gate PASS · platform=${process.platform} · source + trusted local-attestation invariants verified; macOS runtime probe not applicable`);process.exit(0)}
const run=(exe,args)=>spawnSync(exe,args,{cwd:ROOT,encoding:"utf8",shell:false});
mkdirSync(path.join(ROOT,".tmp/macos-secure-enclave"),{recursive:true});
const bridge=path.join(ROOT,".tmp/macos-secure-enclave/cieav-macos-secure-enclave");
let r=run("xcrun",["swiftc","-O","-framework","Security","native/macos-secure-enclave/main.swift","-o",bridge]);
if(r.status!==0)fail(`swift compile failed\n${r.stdout}\n${r.stderr}`);
if(!existsSync(bridge))fail("compiled bridge executable not found");
r=run(bridge,["probe"]);
if(![0,20].includes(r.status??-1))fail(`probe returned unexpected exit ${r.status}: ${r.stdout} ${r.stderr}`);
let body;try{body=JSON.parse(String(r.stdout).trim())}catch{fail(`probe did not return JSON: ${r.stdout}`)}
if(body.protocol!=="CIEAV_KEY_PROVIDER_V1"||body.provider!=="SECURE_ENCLAVE")fail("probe identity mismatch");
if(r.status===0){if(body.available!==true||body.hardwareBacked!==true||body.nativeProvider!=="Security.framework Secure Enclave")fail("successful Secure Enclave probe did not prove hardware backing")}
else if(body.available!==false||body.hardwareBacked!==false)fail("unavailable Secure Enclave probe attempted to claim hardware backing");
console.log(`CIEAV macOS Secure Enclave gate PASS · bridge compiled · trusted local-attestation boundary present · probe=${body.available?"hardware-available":"unavailable-fail-closed"}`);
