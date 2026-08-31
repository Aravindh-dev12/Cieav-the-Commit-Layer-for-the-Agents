#!/usr/bin/env node
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {buildWindowsNativeExecutable,describeWindowsNativeRun} from "./windows-native-cmake.mjs";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const nativeSource=readFileSync(path.join(ROOT,"native/windows-tpm-measured-boot/main.cpp"),"utf8");
const cmake=readFileSync(path.join(ROOT,"native/windows-tpm-measured-boot/CMakeLists.txt"),"utf8");
const parser=readFileSync(path.join(ROOT,"apps/api/src/windows-tpm-measured-boot.ts"),"utf8");
const fail=m=>{console.error(`CIEAV Windows measured-boot release gate FAIL: ${m}`);process.exit(2)};
const requireTokens=(body,tokens,label)=>{for(const token of tokens)if(!body.includes(token))fail(`${label} missing invariant: ${token}`)};

requireTokens(nativeSource,["CIEAV_WINDOWS_TPM_MEASURED_BOOT_V1","Tbsi_Get_TCG_Log_Ex","TBS_TCGLOG_SRTM_CURRENT","TBS_TCGLOG_SRTM_BOOT","TBS_TCGLOG_SRTM_RESUME","kMaxLogBytes=8u*1024u*1024u","qualification\\\":\\\"UNQUALIFIED","pcrRange\\\":\\\"0-15"],"native collector");
if(nativeSource.includes("NCryptCreateClaim")||nativeSource.includes("NCRYPT_CLAIM_PLATFORM"))fail("diagnostic collector must not add an unverified platform-claim call");
requireTokens(cmake,["cxx_std_20","PRIVATE tbs","/W4","/WX","/permissive-","/guard:cf","/sdl","/DYNAMICBASE","/NXCOMPAT","/HIGHENTROPYVA","-fstack-protector-strong","_FORTIFY_SOURCE=2","-fcf-protection=full","--dynamicbase","--nxcompat","--high-entropy-va"],"native build");
requireTokens(parser,["NCRYPT_PLATFORM_ATTEST_MAGIC=0x44504150","parseWindowsPlatformClaim","parseWindowsWbcl","replaySrtmPcrs","replay_selected_digest_missing"],"parser/replay");

if(process.platform!=="win32"){
  console.log(`CIEAV Windows measured-boot release gate PASS · platform=${process.platform} · TBS collector source + parser/replay invariants verified · physical collection not applicable · qualification=UNQUALIFIED`);
  process.exit(0);
}

const {run}=buildWindowsNativeExecutable({root:ROOT,sourceDir:"native/windows-tpm-measured-boot",buildName:"windows-tpm-measured-boot",executableName:"cieav-windows-tpm-measured-boot.exe",fail});
let r=run(["probe"]);if(![0,20].includes(r.status??-1))fail(`probe process did not complete: ${describeWindowsNativeRun(r)}`);
let body;try{body=JSON.parse(String(r.stdout).trim())}catch{fail(`probe did not return JSON: ${r.stdout}`)}
if(body.protocol!=="CIEAV_WINDOWS_TPM_MEASURED_BOOT_V1"||body.operation!=="probe"||body.collector!=="Windows TBS"||body.qualification!=="UNQUALIFIED")fail("probe identity/qualification boundary mismatch");
if(r.status===0){if(body.available!==true||body.logType!=="SRTM_CURRENT"||body.pcrRange!=="0-15"||!Number.isInteger(body.bytes)||body.bytes<=0)fail("successful TBS probe returned invalid evidence metadata")}else if(body.available!==false)fail("failed TBS probe attempted to claim availability");
console.log(`CIEAV Windows measured-boot release gate PASS · read-only TBS collector compiled · SRTM_CURRENT probe=${body.available?"available":"unavailable-fail-closed"} · qualification=UNQUALIFIED`);
