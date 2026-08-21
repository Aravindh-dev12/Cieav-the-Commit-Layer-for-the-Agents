import crypto from "node:crypto";
import {spawn} from "node:child_process";
import type {HardwarePublicJwk} from "@cieav/contracts/hardware-key-provider";
import type {CieavHardwareKeyProviderRegistry} from "./hardware-key-provider.js";

export type SecureEnclaveBridgeRunner=(executable:string,args:string[],timeoutMs:number,maxOutputBytes:number)=>Promise<unknown>;
const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value as Record<string,unknown>).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(",")}}`:JSON.stringify(value)??"undefined";
const sha256=(value:Buffer|string)=>crypto.createHash("sha256").update(value).digest("hex");
const defaultRunner:SecureEnclaveBridgeRunner=async(executable,args,timeoutMs,maxOutputBytes)=>await new Promise((resolve,reject)=>{const child=spawn(executable,args,{shell:false,windowsHide:true,stdio:["ignore","pipe","pipe"],env:{HOME:process.env.HOME,TMPDIR:process.env.TMPDIR}});let stdout=Buffer.alloc(0),stderr=Buffer.alloc(0),settled=false;let timer:NodeJS.Timeout;const finish=(fn:()=>void)=>{if(settled)return;settled=true;if(timer)clearTimeout(timer);fn()};const append=(current:Buffer,chunk:Buffer,limit:number)=>{const next=Buffer.concat([current,chunk]);if(next.length>limit){child.kill();throw new Error("secure_enclave_attestor_output_too_large")}return next};child.stdout.on("data",chunk=>{try{stdout=append(stdout,Buffer.from(chunk),maxOutputBytes)}catch(err){finish(()=>reject(err))}});child.stderr.on("data",chunk=>{try{stderr=append(stderr,Buffer.from(chunk),64*1024)}catch(err){finish(()=>reject(err))}});child.on("error",err=>finish(()=>reject(new Error(`secure_enclave_attestor_spawn_failed:${err.message}`))));child.on("close",code=>finish(()=>{if(code!==0)return reject(new Error(`secure_enclave_attestor_bridge_failed:${code}:${stderr.toString("utf8").trim().slice(0,1000)}`));try{resolve(JSON.parse(stdout.toString("utf8")))}catch{reject(new Error("secure_enclave_attestor_invalid_json"))}}));timer=setTimeout(()=>{child.kill();finish(()=>reject(new Error("secure_enclave_attestor_timeout")))},timeoutMs)});
function ecJwk(raw:any):Extract<HardwarePublicJwk,{kty:"EC"}>{if(!raw||raw.kty!=="EC"||raw.crv!=="P-256"||typeof raw.x!=="string"||!raw.x||typeof raw.y!=="string"||!raw.y)throw new Error("secure_enclave_attestor_p256_jwk_required");return{kty:"EC",crv:"P-256",x:raw.x,y:raw.y}}

export class CieavSecureEnclaveAttestor{
  constructor(private readonly registry:CieavHardwareKeyProviderRegistry,private readonly runner:SecureEnclaveBridgeRunner=defaultRunner,private readonly timeoutMs=5000,private readonly runtimePlatform:NodeJS.Platform=process.platform){}
  async attest(providerManifestId:string,providerKeyRef:string,expectedPublicJwk?:Extract<HardwarePublicJwk,{kty:"EC"}>){
    if(this.runtimePlatform!=="darwin")throw new Error("secure_enclave_attestor_macos_required");
    const manifest=(await this.registry.listManifests()).find(x=>x.id===providerManifestId);if(!manifest)throw new Error("secure_enclave_attestor_manifest_not_found");
    if(manifest.provider!=="SECURE_ENCLAVE"||manifest.platform!=="MACOS"||!manifest.enabled)throw new Error("secure_enclave_attestor_manifest_invalid");
    if(!manifest.capabilities.includes("ATTEST_KEY")||!manifest.capabilities.includes("SIGN_ES256"))throw new Error("secure_enclave_attestor_capability_missing");
    const probe=await this.runner(manifest.executablePath,["probe"],this.timeoutMs,16*1024) as any;
    if(probe?.protocol!=="CIEAV_KEY_PROVIDER_V1"||probe?.provider!=="SECURE_ENCLAVE"||probe?.nativeProvider!=="Security.framework Secure Enclave"||probe?.available!==true||probe?.hardwareBacked!==true)throw new Error("secure_enclave_attestor_probe_not_hardware_backed");
    const description=await this.runner(manifest.executablePath,["describe",providerKeyRef],this.timeoutMs,32*1024) as any;
    if(description?.protocol!=="CIEAV_KEY_PROVIDER_V1"||description?.operation!=="describe"||description?.provider!=="SECURE_ENCLAVE"||description?.algorithm!=="ES256"||description?.keyName!==providerKeyRef||description?.hardwareBacked!==true||description?.exportable!==false)throw new Error("secure_enclave_attestor_description_invalid");
    const publicJwk=ecJwk(description.publicJwk);if(expectedPublicJwk&&canonical(publicJwk)!==canonical(expectedPublicJwk))throw new Error("secure_enclave_attestor_public_key_mismatch");
    const nonce=crypto.randomBytes(32).toString("base64url"),challenge=Buffer.from(canonical({protocol:"CIEAV_SECURE_ENCLAVE_ATTESTATION_V1",providerManifestId,providerKeyRef,publicJwk,nonce}),"utf8"),challengeDigest=sha256(challenge);
    const signed=await this.runner(manifest.executablePath,["sign-es256",providerKeyRef,challengeDigest],this.timeoutMs,16*1024) as any;
    if(signed?.protocol!=="CIEAV_KEY_PROVIDER_V1"||signed?.operation!=="sign-es256"||signed?.provider!=="SECURE_ENCLAVE"||signed?.keyName!==providerKeyRef||signed?.signatureEncoding!=="IEEE-P1363"||typeof signed?.signature!=="string")throw new Error("secure_enclave_attestor_proof_invalid");
    let signature:Buffer;try{signature=Buffer.from(signed.signature,"base64url")}catch{throw new Error("secure_enclave_attestor_proof_invalid")};if(signature.length!==64)throw new Error("secure_enclave_attestor_proof_invalid");
    let publicKey:crypto.KeyObject;try{publicKey=crypto.createPublicKey({key:publicJwk,format:"jwk"} as any)}catch{throw new Error("secure_enclave_attestor_public_key_invalid")}
    if(!crypto.verify(null,Buffer.from(challengeDigest,"hex"),{key:publicKey,dsaEncoding:"ieee-p1363"},signature))throw new Error("secure_enclave_attestor_proof_mismatch");
    const fingerprint=sha256(canonical(publicJwk)),verifiedAt=new Date().toISOString(),expiresAt=new Date(Date.now()+10*60*1000).toISOString(),proof={proofOfPossession:"ES256_FRESH_CHALLENGE",challengeDigest};
    const attestation=await this.registry.putAttestation({id:crypto.randomUUID(),version:1,providerManifestId:manifest.id,provider:"SECURE_ENCLAVE",kind:"APPLE_SECURE_ENCLAVE_KEY",platform:"MACOS",verificationScope:"LOCAL_HOST",keyProtection:"SECURE_ENCLAVE",platformState:"KEY_ATTESTED",assurance:"HARDWARE_KEY",publicKeyFingerprint:fingerprint,evidenceDigest:sha256(canonical({manifestDigest:manifest.executableSha256,probe,description,proof,signature:signed.signature})),claimsDigest:sha256(canonical({providerKeyRef,publicJwk,nativeProvider:probe.nativeProvider,nonExportable:true,...proof})),verification:"VERIFIED",verifiedBy:"cieav:macos-security-framework-local",verifiedAt,expiresAt});
    return{attestation,publicJwk};
  }
}
