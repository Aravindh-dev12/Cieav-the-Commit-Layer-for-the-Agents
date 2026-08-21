#!/usr/bin/env node
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import path from "node:path";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const run=(cmd,args)=>{const r=spawnSync(cmd,args,{cwd:ROOT,encoding:"utf8",shell:false,env:process.env});if(r.error)throw new Error(`${cmd} unavailable: ${r.error.message}`);if(r.status!==0)throw new Error(`${cmd} ${args.join(" ")} failed: ${(r.stderr||r.stdout||"").trim().slice(0,2000)}`);return r.stdout.trim()};
const json=(cmd,args)=>JSON.parse(run(cmd,args));
const repo=String(process.env.CIEAV_GITHUB_REPOSITORY||json("gh",["repo","view","--json","nameWithOwner"]).nameWithOwner||"").trim();
if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))throw new Error("unable to resolve GitHub repository identity");
const varsRaw=json("gh",["api",`repos/${repo}/actions/variables?per_page=100`]),secretsRaw=json("gh",["api",`repos/${repo}/actions/secrets?per_page=100`]);
const vars=new Map((varsRaw.variables||[]).map(x=>[String(x.name),String(x.value??"")])),secrets=new Set((secretsRaw.secrets||[]).map(x=>String(x.name)));
const reasons=[],requiredVar=(name,{pattern,why}={})=>{const v=(vars.get(name)||"").trim();if(!v)reasons.push(`missing_variable:${name}${why?`:${why}`:""}`);else if(pattern&&!pattern.test(v))reasons.push(`invalid_variable:${name}`);return v},requiredSecret=name=>{if(!secrets.has(name))reasons.push(`missing_secret:${name}`)};
const httpsOrigin=name=>requiredVar(name,{pattern:/^https:\/\/[A-Za-z0-9.-]+(?::\d+)?\/?$/i,why:"must be a clean HTTPS origin"});
httpsOrigin("CIEAV_CLOUD_URL");httpsOrigin("CIEAV_DOWNLOAD_BASE_URL");
const provider=(vars.get("CIEAV_WINDOWS_SIGNING_PROVIDER")||"pfx").trim().toLowerCase();
if(!["pfx","store","artifact-signing"].includes(provider))reasons.push("invalid_variable:CIEAV_WINDOWS_SIGNING_PROVIDER");
requiredVar("CIEAV_WINDOWS_TIMESTAMP_URL",{pattern:/^https?:\/\//i});
if(provider==="pfx"){
 requiredVar("CIEAV_WINDOWS_CODE_SIGN_THUMBPRINT",{pattern:/^[A-Fa-f0-9]{40,128}$/});
 requiredSecret("CIEAV_WINDOWS_CODE_SIGN_PFX_B64");requiredSecret("CIEAV_WINDOWS_CODE_SIGN_PFX_PASSWORD");
}else if(provider==="store"){
 requiredVar("CIEAV_WINDOWS_CODE_SIGN_THUMBPRINT",{pattern:/^[A-Fa-f0-9]{40,128}$/});
}else if(provider==="artifact-signing"){
 requiredVar("CIEAV_WINDOWS_CODE_SIGN_SUBJECT");
 for(const n of ["CIEAV_ARTIFACT_SIGNING_ENDPOINT","CIEAV_ARTIFACT_SIGNING_ACCOUNT","CIEAV_ARTIFACT_SIGNING_PROFILE","CIEAV_ARTIFACT_SIGNING_CLIENT_ID","CIEAV_ARTIFACT_SIGNING_TENANT_ID","CIEAV_ARTIFACT_SIGNING_SUBSCRIPTION_ID"])requiredVar(n);
}
requiredVar("CIEAV_MACOS_SIGNING_IDENTITY");requiredSecret("CIEAV_MACOS_DEVELOPER_ID_P12_B64");requiredSecret("CIEAV_MACOS_DEVELOPER_ID_P12_PASSWORD");
requiredVar("CIEAV_APPLE_NOTARY_KEY_ID");requiredVar("CIEAV_APPLE_NOTARY_ISSUER");requiredSecret("CIEAV_APPLE_NOTARY_KEY_B64");
requiredVar("CIEAV_RELEASE_SIGNING_PUBLIC_KEY_B64");requiredVar("CIEAV_RELEASE_SIGNING_KEY_ID",{pattern:/^[a-f0-9]{64}$/});requiredSecret("CIEAV_RELEASE_SIGNING_PRIVATE_KEY_B64");
for(const n of [
 "CIEAV_WINDOWS_TPM_CNG_BRIDGE","CIEAV_WINDOWS_NATIVE_ATTESTATION_CONFIG",
 "CIEAV_MACOS_SECURE_ENCLAVE_BRIDGE","CIEAV_MACOS_SECURE_ENCLAVE_KEY_NAME",
 "CIEAV_LINUX_TPM2_PHYSICAL_CONFIG"
])requiredVar(n);
for(const n of [
 "CIEAV_WINDOWS_TPM_CNG_BRIDGE_SHA256","CIEAV_WINDOWS_NATIVE_ATTESTATION_CONFIG_SHA256",
 "CIEAV_MACOS_SECURE_ENCLAVE_BRIDGE_SHA256","CIEAV_LINUX_TPM2_PHYSICAL_CONFIG_SHA256"
])requiredVar(n,{pattern:/^[a-f0-9]{64}$/});
const report={schemaVersion:1,product:"CIEAV",kind:"PRODUCTION_RELEASE_CONFIGURATION_PREFLIGHT",authority:false,repository:repo,windowsSigningProvider:provider,checkedVariables:vars.size,checkedSecretNames:secrets.size,requiredRunnerLabels:[
 ["self-hosted","windows","cieav-release-hardware","cieav-windows-tpm"],
 ["self-hosted","macOS","cieav-release-hardware","cieav-macos-secure-enclave"],
 ["self-hosted","linux","cieav-release-hardware","cieav-linux-tpm2"],
 ["self-hosted","linux","cieav-release-hardware","cieav-ml-gpu"],
 ["self-hosted","windows|macOS|linux","cieav-release-hardware","cieav-live-installer"]
],optionalQualificationPaths:{linuxPkcs11:"explicit physical target=linux only; not part of production target=all aggregate"},reasons,verdict:reasons.length?"FAIL":"PASS"};
console.log(JSON.stringify(report,null,2));
if(reasons.length){console.error(`CIEAV production release configuration preflight FAIL - ${reasons.join(",")}`);process.exit(2)}
console.log(`CIEAV production release configuration preflight PASS - signing/notarization/CDN/physical configuration names present for ${repo}; secret values were not read; runner availability still requires GitHub self-hosted runner administration`);
