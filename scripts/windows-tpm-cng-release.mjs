#!/usr/bin/env node
import {readFileSync,existsSync} from "node:fs";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const source=readFileSync(path.join(ROOT,"native/windows-tpm-cng/main.cpp"),"utf8");
const cmake=readFileSync(path.join(ROOT,"native/windows-tpm-cng/CMakeLists.txt"),"utf8");
const fail=m=>{console.error(`CIEAV Windows TPM/CNG gate FAIL: ${m}`);process.exit(2)};
for(const token of ["MS_PLATFORM_CRYPTO_PROVIDER","NCRYPT_IMPL_HARDWARE_FLAG","NCRYPT_IMPL_SOFTWARE_FLAG","BCRYPT_ECDSA_P256_ALGORITHM","BCRYPT_RSA_ALGORITHM","BCRYPT_RSAPUBLIC_BLOB","BCRYPT_PKCS1_PADDING_INFO","NCRYPT_PAD_PKCS1_FLAG","create-rsa-2048","sign-rs256","MAA_REQUEST_KEY","NCRYPT_EXPORT_POLICY_PROPERTY","NCRYPT_ALLOW_PLAINTEXT_EXPORT_FLAG","BCRYPT_ECCPUBLIC_BLOB","NCryptSignHash","CIEAV_KEY_PROVIDER_V1"])if(!source.includes(token))fail(`native bridge missing ${token}`);
for(const token of ["ncrypt","bcrypt","/W4","/WX","/guard:cf","/DYNAMICBASE","/NXCOMPAT"])if(!cmake.includes(token))fail(`native build missing ${token}`);
if(process.platform!=="win32"){console.log(`CIEAV Windows TPM/CNG gate PASS · platform=${process.platform} · P-256 consequence + RSA MAA attestation-key source/build invariants verified; Windows runtime probe not applicable`);process.exit(0)}
const run=(exe,args,opts={})=>spawnSync(exe,args,{cwd:ROOT,encoding:"utf8",shell:false,...opts});
let r=run("cmake",["-S","native/windows-tpm-cng","-B",".tmp/windows-tpm-cng","-A","x64"]);if(r.status!==0)fail(`cmake configure failed\n${r.stdout}\n${r.stderr}`);
r=run("cmake",["--build",".tmp/windows-tpm-cng","--config","Release"]);if(r.status!==0)fail(`cmake build failed\n${r.stdout}\n${r.stderr}`);
const candidates=[path.join(ROOT,".tmp/windows-tpm-cng/Release/cieav-windows-tpm-cng.exe"),path.join(ROOT,".tmp/windows-tpm-cng/cieav-windows-tpm-cng.exe")],bridge=candidates.find(existsSync);if(!bridge)fail("compiled bridge executable not found");
r=run(bridge,["probe"]);if(![0,20].includes(r.status??-1))fail(`probe returned unexpected exit ${r.status}: ${r.stdout} ${r.stderr}`);
let body;try{body=JSON.parse(String(r.stdout).trim())}catch{fail(`probe did not return JSON: ${r.stdout}`)}
if(body.protocol!=="CIEAV_KEY_PROVIDER_V1"||body.provider!=="TPM"||body.nativeProvider!=="Microsoft Platform Crypto Provider")fail("probe identity mismatch");
if(r.status===0){if(body.available!==true||body.hardwareBacked!==true)fail("successful Platform Crypto Provider probe did not prove hardware backing");}
else{if(body.available!==false||body.hardwareBacked!==false)fail("unavailable TPM probe attempted to claim hardware backing");}
console.log(`CIEAV Windows TPM/CNG gate PASS · native bridge compiled · P-256 + RSA attestation lane · Platform Crypto Provider probe=${body.available?"hardware-available":"unavailable-fail-closed"}`);
