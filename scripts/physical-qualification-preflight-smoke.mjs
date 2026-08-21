#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {preflightWindowsNative,preflightMacos,preflightLinuxTpm2} from "./physical-qualification-preflight.mjs";

const root=mkdtempSync(path.join(os.tmpdir(),"cieav-physical-preflight-")),sha256=p=>crypto.createHash("sha256").update(readFileSync(p)).digest("hex");
const file=(name,body)=>{const p=path.join(root,name);writeFileSync(p,body);return p};
try{
 const winBridge=file("win-cng.bin","bridge"),winNative=file("win-native.bin","native"),winConfigPath=file("win-config.json",JSON.stringify({executablePath:winNative,executableSha256:sha256(winNative),aikName:"aik",requestKeyName:"request",consequenceKeyName:"consequence",expectedAikCertificateSha256:"1".repeat(64),expectedAikRootCertificateSha256:"870c7a35ceab3d59979f2c6a524042d404cb71518004350925fb2ced79a999da"}));
 const winEnv={CIEAV_WINDOWS_TPM_CNG_BRIDGE:winBridge,CIEAV_WINDOWS_TPM_CNG_BRIDGE_SHA256:sha256(winBridge),CIEAV_WINDOWS_NATIVE_ATTESTATION_CONFIG:winConfigPath,CIEAV_WINDOWS_NATIVE_ATTESTATION_CONFIG_SHA256:sha256(winConfigPath)};
 assert.equal(preflightWindowsNative(winEnv,"win32").target,"windows-native");
 const badWin={...winEnv,CIEAV_WINDOWS_TPM_CNG_BRIDGE_SHA256:"0".repeat(64)};assert.throws(()=>preflightWindowsNative(badWin,"win32"),/digest mismatch/);
 const badRootConfig=file("win-config-bad-root.json",JSON.stringify({...JSON.parse(readFileSync(winConfigPath,"utf8")),expectedAikRootCertificateSha256:"2".repeat(64)})),badRootEnv={...winEnv,CIEAV_WINDOWS_NATIVE_ATTESTATION_CONFIG:badRootConfig,CIEAV_WINDOWS_NATIVE_ATTESTATION_CONFIG_SHA256:sha256(badRootConfig)};assert.throws(()=>preflightWindowsNative(badRootEnv,"win32"),/unapproved AIK root/);
 const macBridge=file("mac-bridge.bin","mac");assert.equal(preflightMacos({CIEAV_MACOS_SECURE_ENCLAVE_BRIDGE:macBridge,CIEAV_MACOS_SECURE_ENCLAVE_BRIDGE_SHA256:sha256(macBridge),CIEAV_MACOS_SECURE_ENCLAVE_KEY_NAME:"cieav-release-key"},"darwin").target,"macos");
 const eventLog=file("event.log","event"),bootPolicy=file("boot-policy.json","{}"),ekCert=file("ek.der","ek"),linuxConfigPath=file("linux-config.json",JSON.stringify({collector:{ekHandle:"0x81010001",akHandle:"0x81010002"},eventLog:{path:eventLog,sha256:sha256(eventLog)},bootPolicy:{path:bootPolicy,sha256:sha256(bootPolicy)},ekCertificate:{path:ekCert,sha256:sha256(ekCert)},readPublic:{command:"tpm2_readpublic"},makeCredential:{command:"tpm2_makecredential"},activateCredential:{command:"tpm2_activatecredential"},ekTrust:{roots:[]}})),linuxEnv={CIEAV_LINUX_TPM2_PHYSICAL_CONFIG:linuxConfigPath,CIEAV_LINUX_TPM2_PHYSICAL_CONFIG_SHA256:sha256(linuxConfigPath)};
 assert.equal(preflightLinuxTpm2(linuxEnv,"linux").target,"linux-tpm2");
 const badLinux=file("linux-bad.json",JSON.stringify({...JSON.parse(readFileSync(linuxConfigPath,"utf8")),eventLog:{path:eventLog,sha256:"0".repeat(64)}})),badLinuxEnv={CIEAV_LINUX_TPM2_PHYSICAL_CONFIG:badLinux,CIEAV_LINUX_TPM2_PHYSICAL_CONFIG_SHA256:sha256(badLinux)};assert.throws(()=>preflightLinuxTpm2(badLinuxEnv,"linux"),/firmware event log digest mismatch/);
 console.log("CIEAV physical qualification preflight smoke PASS - pinned Windows/macOS/Linux inputs + AIK root policy + digest/malformed evidence rejection; hardware execution not claimed");
}finally{rmSync(root,{recursive:true,force:true})}
