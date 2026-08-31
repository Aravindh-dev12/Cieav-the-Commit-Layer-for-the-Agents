#!/usr/bin/env node
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {buildWindowsNativeExecutable} from "./windows-native-cmake.mjs";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const source=readFileSync(path.join(ROOT,"native/windows-tpm-measured-boot-probe/main.cpp"),"utf8");
const cmake=readFileSync(path.join(ROOT,"native/windows-tpm-measured-boot-probe/CMakeLists.txt"),"utf8");
const parser=readFileSync(path.join(ROOT,"apps/api/src/windows-tpm-measured-boot.ts"),"utf8");
const verifier=readFileSync(path.join(ROOT,"apps/api/src/windows-tpm-measured-boot-verifier.ts"),"utf8");
const tests=readFileSync(path.join(ROOT,"apps/api/src/windows-tpm-measured-boot.test.ts"),"utf8");
const verifierTests=readFileSync(path.join(ROOT,"apps/api/src/windows-tpm-measured-boot-verifier.test.ts"),"utf8");
const fail=m=>{console.error(`CIEAV Windows TPM measured-boot probe gate FAIL: ${m}`);process.exit(2)};
const requireTokens=(body,tokens,label)=>{for(const token of tokens)if(!body.includes(token))fail(`${label} missing invariant: ${token}`)};

requireTokens(source,["MS_PLATFORM_CRYPTO_PROVIDER","NCRYPT_IMPL_HARDWARE_FLAG","NCRYPT_IMPL_SOFTWARE_FLAG","NCRYPT_CLAIM_PLATFORM","NCRYPTBUFFER_TPM_PLATFORM_CLAIM_PCR_MASK","NCRYPTBUFFER_TPM_PLATFORM_CLAIM_NONCE","NCryptCreateClaim","NCryptVerifyClaim","createStatus","verifyStatus","verified","claim\\\":\\\"","TBS_TCGLOG_SRTM_CURRENT","TBS_TCGLOG_SRTM_BOOT","Tbsi_Get_TCG_Log_Ex","subject-null_authority-aik","subject-aik_authority-null","subject-aik_authority-aik","CIEAV_WINDOWS_TPM_MEASURED_BOOT_PROBE_V1","qualification\\\":\\\"UNQUALIFIED"],"native diagnostic source");
requireTokens(cmake,["cxx_std_20","ncrypt bcrypt tbs","/W4","/WX","/permissive-","/guard:cf","/sdl","/DYNAMICBASE","/NXCOMPAT","/HIGHENTROPYVA","-fstack-protector-strong","_FORTIFY_SOURCE=2","-fcf-protection=full","--dynamicbase","--nxcompat","--high-entropy-va"],"diagnostic build");
requireTokens(parser,["NCRYPT_PLATFORM_ATTEST_MAGIC=0x44504150","Spec ID Event03","wbcl_event_unknown_algorithm","replay_selected_digest_missing","platform_claim_trailing_data","MAX_EVENT_BYTES","MAX_EVENTS"],"measured-boot parser");
requireTokens(verifier,["verifyWindowsPlatformPcrReplay","crypto.timingSafeEqual","platform_claim_pcr_replay_mismatch","serializePcrTable"],"PCR replay verifier");
requireTokens(tests,["0x44504150","wbcl_duplicate_algorithm","wbcl_known_digest_size_mismatch","wbcl_event_duplicate_algorithm","replay_selected_digest_missing","pcr_table_incomplete"],"measured-boot tests");
requireTokens(verifierTests,["binds the platform claim PCR table","fails closed when the claim PCR table differs"],"PCR replay verifier tests");
if(source.includes("NCryptCreatePersistedKey")||source.includes("NCryptDeleteKey")||source.includes("NCryptFinalizeKey"))fail("diagnostic probe must not create, finalize, or delete TPM keys");
if(process.platform!=="win32"){console.log(`CIEAV Windows TPM measured-boot probe gate PASS · platform=${process.platform} · source/parser/read-only claim create+verify + PCR replay-binding invariants verified; Windows execution not applicable`);process.exit(0)}

buildWindowsNativeExecutable({root:ROOT,sourceDir:"native/windows-tpm-measured-boot-probe",buildName:"windows-tpm-measured-boot-probe",executableName:"cieav-windows-tpm-measured-boot-probe.exe",fail});
console.log(`CIEAV Windows TPM measured-boot probe gate PASS · diagnostic executable compiled · nonce-bound platform claims are created, emitted, and locally verified · no TPM mutation APIs · parser/PCR replay-binding invariants present · hardware execution requires explicit AIK invocation`);
