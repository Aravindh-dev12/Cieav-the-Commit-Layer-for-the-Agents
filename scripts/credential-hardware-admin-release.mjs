#!/usr/bin/env node
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(path.join(ROOT,p),"utf8"),fail=m=>{console.error(`CIEAV credential/hardware admin gate FAIL: ${m}`);process.exit(2)};
const expectTokens=(file,tokens)=>{const body=read(file);for(const token of tokens)if(!body.includes(token))fail(`${file} missing invariant: ${token}`)};
expectTokens("apps/api/src/credential-hardware-admin-api.ts",["/v1/agent-kernel/credential-authority","rawVerifiedAttestationImport:false","CieavSecureEnclaveAttestor","CieavWindowsTpmMaaCollector","CieavWindowsTpmNativeAttestor","/windows-tpm-native/attest","linux_hardware_attestation_verifier_required"]);
expectTokens("apps/api/src/windows-tpm-native-attestation.ts",["expectedAikCertificateSha256","windows_tpm_native_aik_certificate_mismatch","attestationMode:\"LOCAL_WINDOWS\"","NCryptVerifyClaim+CertGetCertificateChain","CHAIN_EXCLUDE_ROOT","local-ncrypt-verify-claim","windows_tpm_native_digest_mismatch","windows_tpm_native_verifier_key_mismatch"]);
expectTokens("native/windows-tpm-native-attestation/main.cpp",["MS_PLATFORM_CRYPTO_PROVIDER","NCryptCreateClaim","NCryptVerifyClaim","NCRYPT_CLAIM_AUTHORITY_AND_SUBJECT","NCRYPTBUFFER_CLAIM_KEYATTESTATION_NONCE","NCRYPT_CERTIFICATE_PROPERTY","CertGetEnhancedKeyUsage","CERT_FIND_EXT_ONLY_ENHKEY_USAGE_FLAG","CryptHashCertificate2","inspect-aik","2.23.133.8.3","CERT_CHAIN_REVOCATION_CHECK_CHAIN_EXCLUDE_ROOT","aikCertificateTrusted"]);
expectTokens("native/windows-tpm-native-attestation/CMakeLists.txt",["cxx_std_20","ncrypt bcrypt crypt32","/W4 /WX /permissive- /guard:cf /sdl"]);
expectTokens("apps/api/src/windows-tpm-native-attestation.test.ts",["pinned AIK certificate","windows_tpm_native_aik_certificate_mismatch","LOCAL_WINDOWS","NCryptVerifyClaim+CertGetCertificateChain","windows_tpm_native_digest_mismatch"]);
expectTokens("apps/api/src/agent-kernel-api.ts",["CieavCredentialHardwareAdminApi","this.credentialHardwareAdmin=new CieavCredentialHardwareAdminApi(store)","const admin=await this.credentialHardwareAdmin.handle(req,pathname)"]);
expectTokens("apps/api/src/server.ts",["gatewayKernelPath=url.pathname.startsWith(\"/v1/agent-kernel\")","if(agentKernelApi&&gatewayKernelPath&&gatewayAuth(req))","const handled=await agentKernelApi.handleGateway(req,url.pathname)"]);
expectTokens("apps/api/src/credential-hardware-admin-api.test.ts",["mounts software credential lifecycle only beneath the Agent Kernel gateway namespace","raw verified hardware evidence cannot be imported","Linux hardware assurance fail-closed","does not allow registration without verifier-produced attestation evidence"]);
const npm=process.platform==="win32"?"npm.cmd":"npm";
function run(args){const exe=process.platform==="win32"?(process.env.ComSpec||"cmd.exe"):npm,finalArgs=process.platform==="win32"?["/d","/s","/c",`${npm} ${args.join(" ")}`]:args,r=spawnSync(exe,finalArgs,{cwd:ROOT,stdio:"inherit",shell:false});if(r.error)throw r.error;if(r.status!==0)fail(`${npm} ${args.join(" ")} exited ${r.status}`)}
run(["run","build:api"]);
run(["run","test","-w","@cieav/api","--","credential-hardware-admin-api.test.ts","windows-tpm-native-attestation.test.ts"]);
console.log(`CIEAV credential/hardware admin gate PASS · platform=${process.platform} · Gateway-only lifecycle + MAA/native Windows TPM verifier-produced evidence + pinned AIK identity + Linux fail-closed boundary verified`);
