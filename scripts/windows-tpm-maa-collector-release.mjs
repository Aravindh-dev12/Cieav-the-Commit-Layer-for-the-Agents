#!/usr/bin/env node
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(path.join(ROOT,p),"utf8"),fail=m=>{console.error(`CIEAV Windows TPM/MAA collector gate FAIL: ${m}`);process.exit(2)};
const native=read("native/windows-tpm-maa-collector/main.cpp"),cmake=read("native/windows-tpm-maa-collector/CMakeLists.txt"),launcher=read("apps/api/src/windows-tpm-maa-collector.ts"),tests=read("apps/api/src/windows-tpm-maa-collector.test.ts");
for(const token of ["MS_PLATFORM_CRYPTO_PROVIDER","NCRYPT_IMPL_HARDWARE_FLAG","NCRYPT_IMPL_SOFTWARE_FLAG","ATT_TPM_AIK_NCRYPT","ATT_TPM_KEY_NCRYPT","ATT_SESSION_TYPE_TPM","att_create_session","att_attest","AttestTpm","att_get_report","AZURE_TENANT_ID","AZURE_CLIENT_ID","AZURE_CLIENT_SECRET","AZURE_MAA_URI"])if(!native.includes(token))fail(`native collector missing ${token}`);
for(const token of ["CIEAV_ATTEST_PACKAGE_DIR","Microsoft.Attestation.Client","azure-attest-manager.lib","azure-attest-manager.dll","AzureAttestManager.dll","AzureAttestNormal.dll","azure-identity-cpp","azure-security-attestation-cpp","/W4","/WX","/guard:cf","/DYNAMICBASE","/NXCOMPAT"])if(!cmake.includes(token))fail(`collector build wiring missing ${token}`);
if(/file\s*\(\s*DOWNLOAD|FetchContent|ExternalProject|nuget\s+install|vcpkg\s+install/i.test(cmake))fail("collector CMake target must not download/install dependencies; release engineering must pre-provision them");
for(const token of ["dependencyFiles","maa_collector_unpinned_adjacent_dll","${errorPrefix}_digest_mismatch","assertRegularPinnedFile(this.config.executablePath,this.config.executableSha256,\"maa_collector\")","maa_collector_windows_required","crypto.randomBytes(32)","expectedPolicyHash","canonicalIssuer","AZURE_MAA_URI:this.config.issuer","forbiddenEnv","cwd:path.dirname(executable)","CieavMaaTpmAttestationVerifier"])if(!launcher.includes(token))fail(`launcher missing ${token}`);
if(/PATH\s*[:=]/.test(launcher)||launcher.includes('"PATH"'))fail("collector launcher must not inherit PATH");
for(const token of ["creates its own nonce","strips inherited PATH/proxy variables","pinned dependency changes","extra adjacent DLL","forbidden credential env mappings","non-HTTPS issuers"])if(!tests.includes(token))fail(`collector tests missing invariant ${token}`);
console.log(`CIEAV Windows TPM/MAA collector gate PASS · platform=${process.platform} · live collector source/build wiring + digest-pinned dependency closure + nonce/issuer/policy ownership + verifier handoff verified; physical TPM/AIK + live MAA exchange remains external qualification`);
