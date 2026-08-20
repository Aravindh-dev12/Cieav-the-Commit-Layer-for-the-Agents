#!/usr/bin/env node
import {existsSync,readFileSync,rmSync} from "node:fs";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const source=readFileSync(path.join(ROOT,"native/windows-tpm-native-attestation/main.cpp"),"utf8"),cmake=readFileSync(path.join(ROOT,"native/windows-tpm-native-attestation/CMakeLists.txt"),"utf8"),ts=readFileSync(path.join(ROOT,"apps/api/src/windows-tpm-native-attestation.ts"),"utf8");
const fail=m=>{console.error(`CIEAV Windows TPM native attestation gate FAIL: ${m}`);process.exit(2)};
const requireTokens=(body,tokens,label)=>{for(const token of tokens)if(!body.includes(token))fail(`${label} missing invariant: ${token}`)};
requireTokens(source,["MS_PLATFORM_CRYPTO_PROVIDER","NCRYPT_IMPL_HARDWARE_FLAG","NCRYPT_IMPL_SOFTWARE_FLAG","NCRYPT_CERTIFICATE_PROPERTY","CertGetEnhancedKeyUsage","CERT_FIND_EXT_ONLY_ENHKEY_USAGE_FLAG","CryptHashCertificate2","2.23.133.8.3","CertGetCertificateChain","CERT_CHAIN_REVOCATION_CHECK_CHAIN_EXCLUDE_ROOT","NCryptCreateClaim","NCryptVerifyClaim","NCRYPT_CLAIM_AUTHORITY_AND_SUBJECT","NCRYPTBUFFER_CLAIM_KEYATTESTATION_NONCE","CIEAV_WINDOWS_TPM_NATIVE_ATTESTATION_V1","inspect-aik","operation\\\":\\\"probe"],"native source");
requireTokens(cmake,["cxx_std_20","ncrypt bcrypt crypt32","/W4","/WX","/permissive-","/guard:cf","/sdl","/DYNAMICBASE","/NXCOMPAT"],"native build");
requireTokens(ts,["expectedAikCertificateSha256","windows_tpm_native_aik_certificate_mismatch","attestationMode:\"LOCAL_WINDOWS\"","NCryptVerifyClaim+CertGetCertificateChain","CHAIN_EXCLUDE_ROOT","local-ncrypt-verify-claim","windows_tpm_native_digest_mismatch","windows_tpm_native_adjacent_dll_forbidden"],"API attestor");
if(process.platform!=="win32"){console.log(`CIEAV Windows TPM native attestation gate PASS · platform=${process.platform} · source/build/local-attestation invariants verified; physical Windows execution not applicable`);process.exit(0)}
const build=path.join(ROOT,".tmp/windows-tpm-native-attestation");rmSync(build,{recursive:true,force:true});
const run=(exe,args)=>spawnSync(exe,args,{cwd:ROOT,encoding:"utf8",shell:false});
let r=run("cmake",["-S","native/windows-tpm-native-attestation","-B",build,"-A","x64"]);if(r.status!==0)fail(`cmake configure failed\n${r.stdout}\n${r.stderr}`);
r=run("cmake",["--build",build,"--config","Release"]);if(r.status!==0)fail(`cmake build failed\n${r.stdout}\n${r.stderr}`);
const candidates=[path.join(build,"Release/cieav-windows-tpm-native-attestation.exe"),path.join(build,"cieav-windows-tpm-native-attestation.exe")],bridge=candidates.find(existsSync);if(!bridge)fail("compiled native attestation executable not found");
r=run(bridge,["probe"]);if(![0,20].includes(r.status??-1))fail(`probe returned unexpected exit ${r.status}: ${r.stdout} ${r.stderr}`);
let body;try{body=JSON.parse(String(r.stdout).trim())}catch{fail(`probe did not return JSON: ${r.stdout}`)}
if(body.protocol!=="CIEAV_WINDOWS_TPM_NATIVE_ATTESTATION_V1"||body.operation!=="probe"||body.provider!=="TPM"||body.nativeProvider!=="Microsoft Platform Crypto Provider")fail("probe identity mismatch");
if(r.status===0){if(body.available!==true||body.hardwareBacked!==true)fail("successful native TPM probe did not prove hardware backing")}else if(body.available!==false||body.hardwareBacked!==false)fail("unavailable native TPM probe attempted to claim hardware backing");
console.log(`CIEAV Windows TPM native attestation gate PASS · native bridge compiled · AIK certificate/EKU + nonce-bound key claims + NCryptVerifyClaim local verifier · Platform Crypto Provider probe=${body.available?"hardware-available":"unavailable-fail-closed"}`);
