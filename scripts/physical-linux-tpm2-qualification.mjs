#!/usr/bin/env node
import crypto from "node:crypto";
import {lstatSync,readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {writePhysicalQualificationEvidence} from "./physical-qualification-evidence.mjs";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const fail=m=>{console.error(`CIEAV physical Linux TPM2 qualification FAIL: ${m}`);process.exit(2)};
const required=name=>{const v=process.env[name]?.trim();if(!v)fail(`${name} is required`);return v};
const sha256=b=>crypto.createHash("sha256").update(b).digest("hex");
const canonical=v=>Array.isArray(v)?`[${v.map(canonical).join(",")}]`:v&&typeof v==="object"?`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`:JSON.stringify(v)??"undefined";
const assertPinned=(ref,what)=>{if(!ref||typeof ref.path!=="string"||!/^[0-9a-f]{64}$/.test(String(ref.sha256??"")))fail(`${what} must provide path + SHA-256`);if(!path.isAbsolute(ref.path))fail(`${what} path must be absolute`);let st;try{st=lstatSync(ref.path)}catch{fail(`${what} unavailable`)}if(st.isSymbolicLink()||!st.isFile())fail(`${what} must be a regular file`);const body=readFileSync(ref.path);if(sha256(body)!==ref.sha256)fail(`${what} digest mismatch`);return body};
const run=(exe,args)=>{const r=spawnSync(exe,args,{cwd:ROOT,encoding:"utf8",shell:false});if(r.error)fail(r.error.message);if(r.status!==0)fail(`${path.basename(exe)} exited ${r.status}: ${r.stderr}`);return r};
const buildApi=()=>{const npm=process.platform==="win32"?"npm.cmd":"npm",exe=process.platform==="win32"?(process.env.ComSpec||"cmd.exe"):npm,args=process.platform==="win32"?["/d","/s","/c",`${npm} run build:api`]:["run","build:api"];run(exe,args)};

if(process.env.CIEAV_PHYSICAL_HARDWARE_QUALIFICATION!=="1")fail("CIEAV_PHYSICAL_HARDWARE_QUALIFICATION=1 is required");
if(process.platform!=="linux")fail(`Linux TPM2 physical qualification requires linux, got ${process.platform}`);
const configPath=required("CIEAV_LINUX_TPM2_PHYSICAL_CONFIG"),configDigest=required("CIEAV_LINUX_TPM2_PHYSICAL_CONFIG_SHA256").toLowerCase();if(!/^[0-9a-f]{64}$/.test(configDigest))fail("CIEAV_LINUX_TPM2_PHYSICAL_CONFIG_SHA256 must be SHA-256 hex");
let configBody;try{configBody=readFileSync(configPath)}catch{fail("Linux TPM2 physical config unavailable")};if(sha256(configBody)!==configDigest)fail("Linux TPM2 physical config digest mismatch");let config;try{config=JSON.parse(configBody)}catch{fail("Linux TPM2 physical config is invalid JSON")};
for(const key of ["collector","eventLog","bootPolicy","ekCertificate","readPublic","makeCredential","activateCredential","ekTrust"])if(!config?.[key])fail(`Linux TPM2 physical config missing ${key}`);
assertPinned(config.eventLog,"firmware event log");assertPinned(config.bootPolicy,"boot reference policy");assertPinned(config.ekCertificate,"EK certificate");
buildApi();
const dist=p=>pathToFileURL(path.join(ROOT,"apps/api/dist",p)).href;
const [{CieavLinuxTpm2EsapiCollector},{verifyLinuxTpm2FirmwareLogQuote},{verifyLinuxTpm2BootPolicy},{CieavLinuxTpm2ReadPublic},{CieavLinuxTpm2MakeCredential},{CieavLinuxTpm2ActivateCredential},{CieavLinuxTpm2EkOpenSslTrust},{CieavLinuxTpm2EnrollmentOrchestrator}]=await Promise.all([
 import(dist("linux-tpm2-esapi-collector.js")),import(dist("linux-tpm2-measured-boot.js")),import(dist("linux-tpm2-boot-policy.js")),import(dist("linux-tpm2-readpublic.js")),import(dist("linux-tpm2-make-credential.js")),import(dist("linux-tpm2-activate-credential.js")),import(dist("linux-tpm2-ek-openssl-trust.js")),import(dist("linux-tpm2-enrollment-orchestrator.js"))
]);
const collector=new CieavLinuxTpm2EsapiCollector(config.collector,"linux"),evidence=await collector.collect();
const eventLog=assertPinned(config.eventLog,"firmware event log"),binding=verifyLinuxTpm2FirmwareLogQuote({rawQuote:evidence.quoteAttest,rawSignature:evidence.quoteSignature,expectedNonce:evidence.quoteNonce,akPublicJwk:evidence.akPublicJwk,eventLog});
const policyRaw=JSON.parse(assertPinned(config.bootPolicy,"boot reference policy").toString("utf8")),policy=verifyLinuxTpm2BootPolicy(binding,policyRaw);
const readPublic=new CieavLinuxTpm2ReadPublic(config.readPublic,"linux"),makeCredential=new CieavLinuxTpm2MakeCredential(config.makeCredential,"linux"),activateCredential=new CieavLinuxTpm2ActivateCredential(config.activateCredential,"linux"),ekTrust=new CieavLinuxTpm2EkOpenSslTrust(config.ekTrust),orchestrator=new CieavLinuxTpm2EnrollmentOrchestrator(readPublic,makeCredential,activateCredential,certificate=>ekTrust.verify(certificate));
const enrollment=await orchestrator.enroll({ekCertificate:assertPinned(config.ekCertificate,"EK certificate"),rawEkPublic:evidence.ekPublic,ekHandle:config.collector.ekHandle,rawAkPublic:evidence.akPublic,akHandle:config.collector.akHandle});
if(enrollment.kind!=="LINUX_TPM2_EK_AK_ENROLLMENT_PROOF"||enrollment.activation?.activationVerified!==true)fail("EK/AK enrollment activation was not verified");
const subjectFingerprint=sha256(canonical(evidence.subjectPublicJwk)),akFingerprint=sha256(canonical(evidence.akPublicJwk));
const out=writePhysicalQualificationEvidence({mechanism:"LINUX_TPM2_ESAPI_EK_AK_MEASURED_BOOT",claims:{hardwareBacked:true,verification:"VERIFIED",subjectKeyFingerprint:subjectFingerprint,akFingerprint,ekProfile:enrollment.ekProfile,activationVerified:true,bootPolicyVerification:policy.verification,bootPolicyId:policy.policyId,bootPolicyDigest:policy.policyDigest,secureBootPolicyPcr7Covered:policy.secureBootPolicyPcr7Covered,pcrMask:evidence.pcrMask,eventCount:binding.eventCount}});
console.log(`CIEAV physical Linux TPM2 qualification PASS · fresh ESAPI Certify/Quote + EK trust + MakeCredential/ActivateCredential + event-log replay + reference PCR policy · subject=${subjectFingerprint} · evidence=${out.file}`);
