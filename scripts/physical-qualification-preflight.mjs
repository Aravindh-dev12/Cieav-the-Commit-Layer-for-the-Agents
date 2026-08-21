#!/usr/bin/env node
import crypto from "node:crypto";
import {lstatSync,readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const MICROSOFT_TPM_ROOT_CA_2014_SHA256="870c7a35ceab3d59979f2c6a524042d404cb71518004350925fb2ced79a999da";
const fail=m=>{throw new Error(m)};
const required=(name,env=process.env)=>{const v=env[name]?.trim();if(!v)fail(`${name} is required`);return v};
const sha256=b=>crypto.createHash("sha256").update(b).digest("hex");
const digest=(name,env=process.env)=>{const v=required(name,env).toLowerCase();if(!/^[0-9a-f]{64}$/.test(v))fail(`${name} must be lowercase SHA-256 hex`);return v};
const regularAbsolute=(file,what)=>{if(!path.isAbsolute(file))fail(`${what} path must be absolute`);let st;try{st=lstatSync(file)}catch{fail(`${what} is unavailable`)}if(st.isSymbolicLink()||!st.isFile())fail(`${what} must be a regular non-symlink file`);return file};
const pinnedEnv=(pathName,digestName,what,env=process.env)=>{const file=regularAbsolute(required(pathName,env),what),expected=digest(digestName,env);if(sha256(readFileSync(file))!==expected)fail(`${what} digest mismatch`);return file};
const jsonFile=(file,what)=>{let v;try{v=JSON.parse(readFileSync(file,"utf8"))}catch{fail(`${what} is invalid JSON`)}if(!v||typeof v!=="object"||Array.isArray(v))fail(`${what} must be a JSON object`);return v};
const pinnedRef=(ref,what)=>{if(!ref||typeof ref.path!=="string"||!/^[0-9a-f]{64}$/.test(String(ref.sha256??"")))fail(`${what} must provide absolute path + lowercase SHA-256`);const file=regularAbsolute(ref.path,what);if(sha256(readFileSync(file))!==ref.sha256)fail(`${what} digest mismatch`);return file};

export function preflightWindowsNative(env=process.env,platform=process.platform){
 if(platform!=="win32")fail(`Windows native preflight requires win32, got ${platform}`);
 const bridge=pinnedEnv("CIEAV_WINDOWS_TPM_CNG_BRIDGE","CIEAV_WINDOWS_TPM_CNG_BRIDGE_SHA256","Windows TPM/CNG bridge",env),configPath=pinnedEnv("CIEAV_WINDOWS_NATIVE_ATTESTATION_CONFIG","CIEAV_WINDOWS_NATIVE_ATTESTATION_CONFIG_SHA256","Windows native attestation config",env),config=jsonFile(configPath,"Windows native attestation config");
 for(const name of ["executablePath","executableSha256","aikName","requestKeyName","consequenceKeyName","expectedAikCertificateSha256","expectedAikRootCertificateSha256"])if(typeof config[name]!=="string"||!config[name])fail(`Windows native attestation config must bind ${name}`);
 for(const name of ["executableSha256","expectedAikCertificateSha256","expectedAikRootCertificateSha256"])if(!/^[0-9a-f]{64}$/.test(config[name]))fail(`Windows native attestation config ${name} must be lowercase SHA-256 hex`);
 if(config.expectedAikRootCertificateSha256!==MICROSOFT_TPM_ROOT_CA_2014_SHA256)fail("Windows native attestation config selected an unapproved AIK root");
 const executable=regularAbsolute(config.executablePath,"Windows native attestation bridge");if(sha256(readFileSync(executable))!==config.executableSha256)fail("Windows native attestation bridge digest mismatch");
 return{target:"windows-native",bridge,configPath,executable,aikName:config.aikName,requestKeyName:config.requestKeyName,consequenceKeyName:config.consequenceKeyName,aikRoot:config.expectedAikRootCertificateSha256};
}

export function preflightMacos(env=process.env,platform=process.platform){
 if(platform!=="darwin")fail(`macOS preflight requires darwin, got ${platform}`);
 const bridge=pinnedEnv("CIEAV_MACOS_SECURE_ENCLAVE_BRIDGE","CIEAV_MACOS_SECURE_ENCLAVE_BRIDGE_SHA256","macOS Secure Enclave bridge",env),keyName=required("CIEAV_MACOS_SECURE_ENCLAVE_KEY_NAME",env);
 if(keyName.length>200)fail("CIEAV_MACOS_SECURE_ENCLAVE_KEY_NAME is unexpectedly long");return{target:"macos",bridge,keyName};
}

export function preflightLinuxTpm2(env=process.env,platform=process.platform){
 if(platform!=="linux")fail(`Linux TPM2 preflight requires linux, got ${platform}`);
 const configPath=regularAbsolute(required("CIEAV_LINUX_TPM2_PHYSICAL_CONFIG",env),"Linux TPM2 physical config"),expected=digest("CIEAV_LINUX_TPM2_PHYSICAL_CONFIG_SHA256",env);if(sha256(readFileSync(configPath))!==expected)fail("Linux TPM2 physical config digest mismatch");const config=jsonFile(configPath,"Linux TPM2 physical config");
 for(const key of ["collector","eventLog","bootPolicy","ekCertificate","readPublic","makeCredential","activateCredential","ekTrust"])if(!config[key])fail(`Linux TPM2 physical config missing ${key}`);
 pinnedRef(config.eventLog,"firmware event log");pinnedRef(config.bootPolicy,"boot reference policy");pinnedRef(config.ekCertificate,"EK certificate");
 if(typeof config.collector!=="object"||!config.collector||typeof config.collector.ekHandle!=="string"||!config.collector.ekHandle||typeof config.collector.akHandle!=="string"||!config.collector.akHandle)fail("Linux TPM2 collector must bind ekHandle and akHandle");
 return{target:"linux-tpm2",configPath,ekHandle:config.collector.ekHandle,akHandle:config.collector.akHandle,eventLog:config.eventLog.path,bootPolicy:config.bootPolicy.path,ekCertificate:config.ekCertificate.path};
}

function main(){const arg=process.argv.find(x=>x.startsWith("--target="))?.slice(9);if(!arg||!["windows-native","macos","linux-tpm2"].includes(arg))throw new Error("usage: physical-qualification-preflight.mjs --target=<windows-native|macos|linux-tpm2>");const result=arg==="windows-native"?preflightWindowsNative():arg==="macos"?preflightMacos():preflightLinuxTpm2();console.log(`CIEAV physical qualification preflight PASS · target=${result.target} · pinned configuration and file digests verified · hardware execution not yet claimed`)}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{main()}catch(err){console.error(`CIEAV physical qualification preflight FAIL: ${err?.message??err}`);process.exit(2)}}
