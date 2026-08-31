#!/usr/bin/env node
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {buildWindowsNativeExecutable,describeWindowsNativeRun} from "./windows-native-cmake.mjs";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const source=readFileSync(path.join(ROOT,"native/windows-tpm-cng/main.cpp"),"utf8");
const cmake=readFileSync(path.join(ROOT,"native/windows-tpm-cng/CMakeLists.txt"),"utf8");
const fail=m=>{console.error(`CIEAV Windows TPM/CNG gate FAIL: ${m}`);process.exit(2)};
for(const token of ["MS_PLATFORM_CRYPTO_PROVIDER","NCRYPT_IMPL_HARDWARE_FLAG","NCRYPT_IMPL_SOFTWARE_FLAG","BCRYPT_ECDSA_P256_ALGORITHM","BCRYPT_RSA_ALGORITHM","BCRYPT_RSAPUBLIC_BLOB","BCRYPT_PKCS1_PADDING_INFO","NCRYPT_PAD_PKCS1_FLAG","create-rsa-2048","sign-rs256","MAA_REQUEST_KEY","NCRYPT_EXPORT_POLICY_PROPERTY","NCRYPT_ALLOW_PLAINTEXT_EXPORT_FLAG","BCRYPT_ECCPUBLIC_BLOB","NCryptSignHash","CIEAV_KEY_PROVIDER_V1"])if(!source.includes(token))fail(`native bridge missing ${token}`);
for(const token of ["ncrypt","bcrypt","/W4","/WX","/guard:cf","/DYNAMICBASE","/NXCOMPAT","/HIGHENTROPYVA","-fstack-protector-strong","_FORTIFY_SOURCE=2","-fcf-protection=full","--dynamicbase","--nxcompat","--high-entropy-va"])if(!cmake.includes(token))fail(`native build missing ${token}`);
if(process.platform!=="win32"){console.log(`CIEAV Windows TPM/CNG gate PASS · platform=${process.platform} · P-256 consequence + RSA MAA attestation-key source/build invariants verified; Windows runtime probe not applicable`);process.exit(0)}
const {run}=buildWindowsNativeExecutable({root:ROOT,sourceDir:"native/windows-tpm-cng",buildName:"windows-tpm-cng",executableName:"cieav-windows-tpm-cng.exe",fail});
let r=run(["probe"]);if(![0,20].includes(r.status??-1))fail(`probe process did not complete: ${describeWindowsNativeRun(r)}`);
let body;try{body=JSON.parse(String(r.stdout).trim())}catch{fail(`probe did not return JSON: ${r.stdout}`)}
if(body.protocol!=="CIEAV_KEY_PROVIDER_V1"||body.provider!=="TPM"||body.nativeProvider!=="Microsoft Platform Crypto Provider")fail("probe identity mismatch");
if(r.status===0){if(body.available!==true||body.hardwareBacked!==true)fail("successful Platform Crypto Provider probe did not prove hardware backing");}
else{if(body.available!==false||body.hardwareBacked!==false)fail("unavailable TPM probe attempted to claim hardware backing");}
console.log(`CIEAV Windows TPM/CNG gate PASS · native bridge compiled · P-256 + RSA attestation lane · Platform Crypto Provider probe=${body.available?"hardware-available":"unavailable-fail-closed"}`);
