#!/usr/bin/env node
import crypto from "node:crypto";
import {existsSync,lstatSync,readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const fail=m=>{console.error(`CIEAV physical hardware qualification FAIL: ${m}`);process.exit(2)};
const required=name=>{const value=process.env[name]?.trim();if(!value)fail(`${name} is required`);return value};
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`:JSON.stringify(value)??"undefined";
const sha256=value=>crypto.createHash("sha256").update(value).digest("hex");
const parseJson=(raw,what)=>{try{return JSON.parse(String(raw).trim())}catch{fail(`${what} did not return valid JSON`)}};
const assertRegularAbsolute=(file,what)=>{if(!path.isAbsolute(file))fail(`${what} path must be absolute`);let st;try{st=lstatSync(file)}catch{fail(`${what} is unavailable`)}if(st.isSymbolicLink()||!st.isFile())fail(`${what} must be a regular non-symlink file`)};
const assertPinnedExecutable=(pathEnv,digestEnv,what)=>{const file=required(pathEnv),expected=required(digestEnv).toLowerCase();if(!/^[0-9a-f]{64}$/.test(expected))fail(`${digestEnv} must be a SHA-256 hex digest`);assertRegularAbsolute(file,what);const actual=sha256(readFileSync(file));if(actual!==expected)fail(`${what} digest mismatch`);return file};
const run=(exe,args,{env=process.env,maxBuffer=1024*1024}={})=>{const r=spawnSync(exe,args,{cwd:ROOT,env,encoding:"utf8",shell:false,maxBuffer});if(r.error)fail(`${path.basename(exe)} failed to execute: ${r.error.message}`);return r};
const checkedJson=(exe,args,what,opts)=>{const r=run(exe,args,opts);if(r.status!==0)fail(`${what} failed with exit ${r.status}: ${String(r.stderr).trim().slice(0,1000)}`);return parseJson(r.stdout,what)};
function exactEcJwk(raw,what){if(!raw||raw.kty!=="EC"||raw.crv!=="P-256"||typeof raw.x!=="string"||!raw.x||typeof raw.y!=="string"||!raw.y)fail(`${what} did not expose an exact P-256 public JWK`);return{kty:"EC",crv:"P-256",x:raw.x,y:raw.y}}
function verifyOpaqueEs256(bridge,keyRef,jwk,opts){const challenge=crypto.randomBytes(64),digest=sha256(challenge),body=checkedJson(bridge,["sign-es256",keyRef,digest],"opaque ES256 challenge",opts);if(body.protocol!=="CIEAV_KEY_PROVIDER_V1"||body.operation!=="sign-es256"||body.signatureEncoding!=="IEEE-P1363"||typeof body.signature!=="string")fail("hardware signer response identity/encoding mismatch");let signature;try{signature=Buffer.from(body.signature,"base64url")}catch{fail("hardware signer returned invalid base64url")};if(signature.length!==64)fail(`hardware signer returned ${signature.length}-byte ES256 signature`);const publicKey=crypto.createPublicKey({key:jwk,format:"jwk"});if(!crypto.verify("sha256",challenge,{key:publicKey,dsaEncoding:"ieee-p1363"},signature))fail("independent ES256 verification failed");return sha256(canonical(jwk))}
function buildApi(){const npm=process.platform==="win32"?"npm.cmd":"npm",exe=process.platform==="win32"?(process.env.ComSpec||"cmd.exe"):npm,args=process.platform==="win32"?["/d","/s","/c",`${npm} run build:api`]:["run","build:api"],r=run(exe,args);if(r.status!==0)fail(`npm run build:api failed:\n${r.stdout}\n${r.stderr}`)}

async function windows(){
  const bridge=assertPinnedExecutable("CIEAV_WINDOWS_TPM_CNG_BRIDGE","CIEAV_WINDOWS_TPM_CNG_BRIDGE_SHA256","Windows TPM/CNG bridge");
  const probe=checkedJson(bridge,["probe"],"Windows TPM probe");
  if(probe.provider!=="TPM"||probe.nativeProvider!=="Microsoft Platform Crypto Provider"||probe.available!==true||probe.hardwareBacked!==true)fail("Windows physical TPM is not hardware-available");
  const configPath=required("CIEAV_WINDOWS_MAA_CONFIG");assertRegularAbsolute(configPath,"Windows MAA qualification config");const config=parseJson(readFileSync(configPath,"utf8"),"Windows MAA qualification config");
  if(typeof config.requestKeyName!=="string"||!config.requestKeyName||typeof config.consequenceKeyName!=="string"||!config.consequenceKeyName)fail("Windows MAA config must bind requestKeyName and consequenceKeyName");
  const consequence=checkedJson(bridge,["describe",config.consequenceKeyName],"Windows consequence key describe"),request=checkedJson(bridge,["describe-rsa",config.requestKeyName],"Windows MAA request key describe");
  if(consequence.hardwareBacked!==true||consequence.exportable!==false||request.hardwareBacked!==true||request.exportable!==false)fail("Windows release keys are not non-exportable hardware-backed keys");
  const consequenceJwk=exactEcJwk(consequence.publicJwk,"Windows consequence key"),requestJwk=request.publicJwk;
  if(!requestJwk||requestJwk.kty!=="RSA"||typeof requestJwk.n!=="string"||typeof requestJwk.e!=="string")fail("Windows MAA request key did not expose RSA JWK");
  const fingerprint=verifyOpaqueEs256(bridge,config.consequenceKeyName,consequenceJwk);
  buildApi();
  const [{CieavMaaTpmAttestationVerifier},{CieavWindowsTpmMaaCollector}]=await Promise.all([
    import(pathToFileURL(path.join(ROOT,"apps/api/dist/maa-tpm-attestation.js")).href),
    import(pathToFileURL(path.join(ROOT,"apps/api/dist/windows-tpm-maa-collector.js")).href)
  ]);
  const verifier=new CieavMaaTpmAttestationVerifier(),collector=new CieavWindowsTpmMaaCollector(config,verifier);
  const result=await collector.collectAndVerify({expectedPublicJwk:{kty:"RSA",n:requestJwk.n,e:requestJwk.e},expectedConsequencePublicJwk:consequenceJwk,providerManifestId:crypto.randomUUID()});
  if(result.attestation.verification!=="VERIFIED"||result.attestation.kind!=="WINDOWS_TPM_KEY_ATTESTATION"||result.attestation.publicKeyFingerprint!==fingerprint||result.claims.consequenceKeyFingerprint!==fingerprint)fail("live MAA did not verify the exact Windows consequence key");
  console.log(`CIEAV physical hardware qualification PASS · windows · TPM opaque-sign verified · live MAA exact consequence-key attestation verified · fingerprint=${fingerprint}`);
}

async function macos(){
  const bridge=assertPinnedExecutable("CIEAV_MACOS_SECURE_ENCLAVE_BRIDGE","CIEAV_MACOS_SECURE_ENCLAVE_BRIDGE_SHA256","macOS Secure Enclave bridge"),keyName=required("CIEAV_MACOS_SECURE_ENCLAVE_KEY_NAME");
  const probe=checkedJson(bridge,["probe"],"Secure Enclave probe");if(probe.provider!=="SECURE_ENCLAVE"||probe.nativeProvider!=="Security.framework Secure Enclave"||probe.available!==true||probe.hardwareBacked!==true)fail("Secure Enclave is not hardware-available");
  const description=checkedJson(bridge,["describe",keyName],"Secure Enclave key describe");if(description.provider!=="SECURE_ENCLAVE"||description.algorithm!=="ES256"||description.keyName!==keyName||description.hardwareBacked!==true||description.exportable!==false)fail("Secure Enclave key description failed hardware/non-exportability contract");
  const jwk=exactEcJwk(description.publicJwk,"Secure Enclave key"),fingerprint=verifyOpaqueEs256(bridge,keyName,jwk);
  console.log(`CIEAV physical hardware qualification PASS · macos · Secure Enclave key resolved · opaque-sign independently verified · fingerprint=${fingerprint}`);
}

function verifyLinuxAttestation(providerRef,jwk){
  const evidencePath=required("CIEAV_LINUX_ATTESTATION_EVIDENCE"),publicKeyPath=required("CIEAV_LINUX_ATTESTATION_PUBLIC_KEY");assertRegularAbsolute(evidencePath,"Linux hardware attestation evidence");assertRegularAbsolute(publicKeyPath,"Linux attestation verifier public key");
  const raw=parseJson(readFileSync(evidencePath,"utf8"),"Linux attestation evidence"),signatureText=raw?.signature;if(typeof signatureText!=="string"||!signatureText)fail("Linux attestation evidence signature is required");const statement={...raw};delete statement.signature;
  const expectedRefDigest=sha256(providerRef),expectedFingerprint=sha256(canonical(jwk));
  if(statement.version!==1||statement.provider!=="PKCS11"||statement.hardwareBacked!==true||statement.verification!=="VERIFIED"||statement.providerRefDigest!==expectedRefDigest||statement.publicKeyFingerprint!==expectedFingerprint)fail("Linux deployment attestation statement does not bind the exact PKCS11 key as verified hardware");
  const expires=Date.parse(statement.expiresAt),verified=Date.parse(statement.verifiedAt);if(!Number.isFinite(expires)||expires<=Date.now()||!Number.isFinite(verified)||verified>Date.now()+60_000)fail("Linux deployment attestation statement is stale or invalid");
  const verifierKey=crypto.createPublicKey(readFileSync(publicKeyPath));if(verifierKey.asymmetricKeyType!=="ed25519")fail("Linux deployment attestation verifier key must be Ed25519");let signature;try{signature=Buffer.from(signatureText,"base64url")}catch{fail("Linux attestation signature encoding invalid")};if(!crypto.verify(null,Buffer.from(canonical(statement)),verifierKey,signature))fail("Linux deployment attestation verifier signature invalid");
  return expectedFingerprint;
}

async function linux(){
  const bridge=assertPinnedExecutable("CIEAV_LINUX_PKCS11_BRIDGE","CIEAV_LINUX_PKCS11_BRIDGE_SHA256","Linux PKCS11 bridge"),providerRef=required("CIEAV_LINUX_PKCS11_PROVIDER_REF"),probeEnv={...process.env,CIEAV_PKCS11_PROBE_REF:providerRef};
  const probe=checkedJson(bridge,["probe"],"Linux PKCS11 probe",{env:probeEnv});if(probe.provider!=="TPM"||probe.nativeProvider!=="PKCS11"||probe.available!==true||probe.hardwareBacked!==false||probe.attestationRequired!==true)fail("Linux PKCS11 probe must be available while still withholding generic hardware assurance");
  const description=checkedJson(bridge,["describe",providerRef],"Linux PKCS11 key describe"),jwk=exactEcJwk(description.publicJwk,"Linux PKCS11 key"),signingFingerprint=verifyOpaqueEs256(bridge,providerRef,jwk),attestedFingerprint=verifyLinuxAttestation(providerRef,jwk);
  if(signingFingerprint!==attestedFingerprint)fail("Linux signing key and deployment-attested hardware key differ");
  console.log(`CIEAV physical hardware qualification PASS · linux · PKCS11 opaque-sign verified · deployment verifier evidence signature verified · fingerprint=${signingFingerprint}`);
}

if(process.env.CIEAV_PHYSICAL_HARDWARE_QUALIFICATION!=="1")fail("CIEAV_PHYSICAL_HARDWARE_QUALIFICATION=1 is required to prevent accidental hosted-runner qualification");
if(process.platform==="win32")await windows();else if(process.platform==="darwin")await macos();else if(process.platform==="linux")await linux();else fail(`unsupported qualification platform: ${process.platform}`);
