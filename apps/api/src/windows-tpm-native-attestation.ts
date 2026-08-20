import crypto from "node:crypto";
import {spawn} from "node:child_process";
import {lstat,mkdtemp,readFile,readdir,rm,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {HardwareKeyAttestationSchema,type HardwareKeyAttestation} from "@cieav/contracts/hardware-key-provider";
import {z} from "zod";

export const MICROSOFT_TPM_ROOT_CA_2014_SHA256="870c7a35ceab3d59979f2c6a524042d404cb71518004350925fb2ced79a999da" as const;
export const WINDOWS_TPM_NATIVE_APPROVED_AIK_ROOTS=Object.freeze({
  [MICROSOFT_TPM_ROOT_CA_2014_SHA256]:Object.freeze({policyId:"microsoft-tpm-root-ca-2014",subject:"Microsoft TPM Root Certificate Authority 2014",validFrom:"2014-12-10",validTo:"2039-12-10"})
});
const isApprovedAikRoot=(digest:string):digest is keyof typeof WINDOWS_TPM_NATIVE_APPROVED_AIK_ROOTS=>Object.prototype.hasOwnProperty.call(WINDOWS_TPM_NATIVE_APPROVED_AIK_ROOTS,digest);

const DigestSchema=z.string().regex(/^[0-9a-f]{64}$/),B64UrlSchema=z.string().regex(/^[A-Za-z0-9_-]+$/).min(16).max(512*1024);
const RsaJwkSchema=z.object({kty:z.literal("RSA"),n:z.string().min(32),e:z.string().min(1)}).strict();
const EcJwkSchema=z.object({kty:z.literal("EC"),crv:z.literal("P-256"),x:z.string().min(1),y:z.string().min(1)}).strict();
const NativeConfigSchema=z.object({
  executablePath:z.string().min(1).max(4096),executableSha256:DigestSchema,
  aikName:z.string().min(1).max(200),aikMachineKey:z.boolean().default(true),expectedAikCertificateSha256:DigestSchema,expectedAikRootCertificateSha256:DigestSchema,
  requestKeyName:z.string().min(1).max(200),consequenceKeyName:z.string().min(1).max(200),
  timeoutMs:z.number().int().min(1000).max(120000).default(30000),attestationTtlSeconds:z.number().int().min(60).max(3600).default(900)
}).strict();
export type WindowsTpmNativeAttestationConfig=z.infer<typeof NativeConfigSchema>;
export type WindowsTpmNativeAttestationInput={providerManifestId:string;expectedPublicJwk:z.infer<typeof RsaJwkSchema>;expectedConsequencePublicJwk:z.infer<typeof EcJwkSchema>};
const KeyCollectSchema=z.object({keyName:z.string(),hardwareBacked:z.literal(true),exportable:z.literal(false),publicJwk:z.union([RsaJwkSchema,EcJwkSchema]),claim:B64UrlSchema}).strict();
const CollectSchema=z.object({protocol:z.literal("CIEAV_WINDOWS_TPM_NATIVE_ATTESTATION_V1"),operation:z.literal("collect"),provider:z.literal("TPM"),nativeProvider:z.literal("Microsoft Platform Crypto Provider"),hardwareBacked:z.literal(true),trustAnchorMode:z.literal("PINNED_EXCLUSIVE_ROOT"),aikRootCertificateSha256:DigestSchema,aikName:z.string(),aikMachineKey:z.boolean(),nonce:z.string(),aikCertificateDer:B64UrlSchema,aikPublicJwk:RsaJwkSchema,requestKey:KeyCollectSchema,consequenceKey:KeyCollectSchema}).strict();
const KeyVerifySchema=z.object({keyName:z.string(),hardwareBacked:z.literal(true),exportable:z.literal(false),publicJwk:z.union([RsaJwkSchema,EcJwkSchema])}).strict();
const VerifySchema=z.object({protocol:z.literal("CIEAV_WINDOWS_TPM_NATIVE_ATTESTATION_V1"),operation:z.literal("verify"),provider:z.literal("TPM"),nativeProvider:z.literal("Microsoft Platform Crypto Provider"),verification:z.literal("VERIFIED"),hardwareBacked:z.literal(true),aikCertificateTrusted:z.literal(true),aikCertificateEku:z.literal("2.23.133.8.3"),revocationChecked:z.literal(true),trustAnchorMode:z.literal("PINNED_EXCLUSIVE_ROOT"),aikRootCertificateSha256:DigestSchema,aikName:z.string(),aikMachineKey:z.boolean(),nonce:z.string(),aikCertificateDer:B64UrlSchema,aikPublicJwk:RsaJwkSchema,requestKey:KeyVerifySchema,consequenceKey:KeyVerifySchema}).strict();
export type NativeRunner=(executable:string,args:string[],env:NodeJS.ProcessEnv,timeoutMs:number,maxBytes:number)=>Promise<string>;

const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value as Record<string,unknown>).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(",")}}`:JSON.stringify(value)??"undefined";
const sha256=(value:Buffer|string)=>crypto.createHash("sha256").update(value).digest("hex");
const jwkFingerprint=(jwk:unknown)=>sha256(canonical(jwk));
const equalRsa=(a:z.infer<typeof RsaJwkSchema>,b:z.infer<typeof RsaJwkSchema>)=>a.kty===b.kty&&a.n===b.n&&a.e===b.e;
const equalEc=(a:z.infer<typeof EcJwkSchema>,b:z.infer<typeof EcJwkSchema>)=>a.kty===b.kty&&a.crv===b.crv&&a.x===b.x&&a.y===b.y;
const defaultRunner:NativeRunner=async(executable,args,env,timeoutMs,maxBytes)=>await new Promise<string>((resolve,reject)=>{const child=spawn(executable,args,{env,cwd:path.dirname(executable),windowsHide:true,stdio:["ignore","pipe","pipe"]});let stdout=Buffer.alloc(0),stderr=Buffer.alloc(0),settled=false;let timer:NodeJS.Timeout;const finish=(fn:()=>void)=>{if(settled)return;settled=true;if(timer)clearTimeout(timer);fn()};const append=(current:Buffer,chunk:Buffer,limit:number)=>{const next=Buffer.concat([current,chunk]);if(next.length>limit){child.kill();throw new Error("windows_tpm_native_output_too_large")}return next};child.stdout.on("data",chunk=>{try{stdout=append(stdout,Buffer.from(chunk),maxBytes)}catch(err){finish(()=>reject(err))}});child.stderr.on("data",chunk=>{try{stderr=append(stderr,Buffer.from(chunk),64*1024)}catch(err){finish(()=>reject(err))}});child.on("error",err=>finish(()=>reject(new Error(`windows_tpm_native_spawn_failed:${err.message}`))));child.on("close",code=>finish(()=>code===0?resolve(stdout.toString("utf8").trim()):reject(new Error(`windows_tpm_native_failed:${code}:${stderr.toString("utf8").trim().slice(0,1000)}`))));timer=setTimeout(()=>{child.kill();finish(()=>reject(new Error("windows_tpm_native_timeout")))},timeoutMs)});

export class CieavWindowsTpmNativeAttestor{
  private readonly config:WindowsTpmNativeAttestationConfig;
  constructor(rawConfig:unknown,private readonly runtimePlatform:NodeJS.Platform=process.platform,private readonly runner:NativeRunner=defaultRunner,private readonly env:NodeJS.ProcessEnv=process.env){this.config=NativeConfigSchema.parse(rawConfig);if(!isApprovedAikRoot(this.config.expectedAikRootCertificateSha256))throw new Error("windows_tpm_native_unapproved_aik_root")}
  private async assertPinnedExecutable(){if(!path.isAbsolute(this.config.executablePath))throw new Error("windows_tpm_native_absolute_path_required");const info=await lstat(this.config.executablePath);if(info.isSymbolicLink()||!info.isFile())throw new Error("windows_tpm_native_not_regular_file");if(sha256(await readFile(this.config.executablePath))!==this.config.executableSha256)throw new Error("windows_tpm_native_digest_mismatch");const adjacentDlls=(await readdir(path.dirname(this.config.executablePath))).filter(x=>x.toLowerCase().endsWith(".dll"));if(adjacentDlls.length)throw new Error("windows_tpm_native_adjacent_dll_forbidden")}
  private childEnv(){const out:NodeJS.ProcessEnv={};for(const name of ["SystemRoot","WINDIR","TEMP","TMP"]){const value=this.env[name];if(value)out[name]=value}return out}
  private async invoke(args:string[]){const raw=await this.runner(this.config.executablePath,args,this.childEnv(),this.config.timeoutMs,1024*1024);try{return JSON.parse(raw)}catch{throw new Error("windows_tpm_native_invalid_json")}}
  async attest(input:WindowsTpmNativeAttestationInput):Promise<{attestation:HardwareKeyAttestation;publicJwk:z.infer<typeof EcJwkSchema>;requestPublicJwk:z.infer<typeof RsaJwkSchema>;claims:{attestationMode:"LOCAL_WINDOWS";nonce:string;aikCertificateFingerprint:string;aikRootCertificateFingerprint:string;aikRootPolicyId:string;aikPublicKeyFingerprint:string;requestKeyFingerprint:string;consequenceKeyFingerprint:string;aikCertificateEku:"2.23.133.8.3";trustAnchorMode:"PINNED_EXCLUSIVE_ROOT";verifier:"NCryptVerifyClaim+CertCreateCertificateChainEngine";revocationPolicy:"CHAIN_EXCLUDE_ROOT";revocationChecked:true}}>{
    if(this.runtimePlatform!=="win32")throw new Error("windows_tpm_native_windows_required");
    await this.assertPinnedExecutable();
    const expectedRequest=RsaJwkSchema.parse(input.expectedPublicJwk),expectedConsequence=EcJwkSchema.parse(input.expectedConsequencePublicJwk),nonce=crypto.randomBytes(32).toString("base64url"),common=["--aik",this.config.aikName,"--expected-root-sha256",this.config.expectedAikRootCertificateSha256,"--request-key",this.config.requestKeyName,"--consequence-key",this.config.consequenceKeyName,"--nonce",nonce,...(this.config.aikMachineKey?[]:["--aik-user"])];
    const collected=CollectSchema.parse(await this.invoke(["collect",...common]));
    if(collected.nonce!==nonce||collected.aikName!==this.config.aikName||collected.aikMachineKey!==this.config.aikMachineKey||collected.aikRootCertificateSha256!==this.config.expectedAikRootCertificateSha256||collected.requestKey.keyName!==this.config.requestKeyName||collected.consequenceKey.keyName!==this.config.consequenceKeyName)throw new Error("windows_tpm_native_collect_identity_mismatch");
    const certificateBytes=Buffer.from(collected.aikCertificateDer,"base64url"),aikCertificateFingerprint=sha256(certificateBytes);
    if(aikCertificateFingerprint!==this.config.expectedAikCertificateSha256)throw new Error("windows_tpm_native_aik_certificate_mismatch");
    const collectedRequest=RsaJwkSchema.parse(collected.requestKey.publicJwk),collectedConsequence=EcJwkSchema.parse(collected.consequenceKey.publicJwk);
    if(!equalRsa(collectedRequest,expectedRequest))throw new Error("windows_tpm_native_request_key_mismatch");
    if(!equalEc(collectedConsequence,expectedConsequence))throw new Error("windows_tpm_native_consequence_key_mismatch");
    const temp=await mkdtemp(path.join(os.tmpdir(),"cieav-tpm-native-"));
    try{
      const requestClaim=path.join(temp,"request.claim"),consequenceClaim=path.join(temp,"consequence.claim"),requestBytes=Buffer.from(collected.requestKey.claim,"base64url"),consequenceBytes=Buffer.from(collected.consequenceKey.claim,"base64url");
      if(!requestBytes.length||!consequenceBytes.length)throw new Error("windows_tpm_native_empty_claim");
      await writeFile(requestClaim,requestBytes,{flag:"wx",mode:0o600});await writeFile(consequenceClaim,consequenceBytes,{flag:"wx",mode:0o600});
      const verified=VerifySchema.parse(await this.invoke(["verify",...common,"--request-claim-file",requestClaim,"--consequence-claim-file",consequenceClaim]));
      if(verified.nonce!==nonce||verified.aikName!==collected.aikName||verified.aikMachineKey!==collected.aikMachineKey||verified.aikRootCertificateSha256!==this.config.expectedAikRootCertificateSha256||verified.aikCertificateDer!==collected.aikCertificateDer||!equalRsa(verified.aikPublicJwk,collected.aikPublicJwk))throw new Error("windows_tpm_native_verifier_identity_mismatch");
      const verifiedRequest=RsaJwkSchema.parse(verified.requestKey.publicJwk),verifiedConsequence=EcJwkSchema.parse(verified.consequenceKey.publicJwk);
      if(verified.requestKey.keyName!==this.config.requestKeyName||verified.consequenceKey.keyName!==this.config.consequenceKeyName||!equalRsa(verifiedRequest,expectedRequest)||!equalEc(verifiedConsequence,expectedConsequence))throw new Error("windows_tpm_native_verifier_key_mismatch");
      const rootPolicy=WINDOWS_TPM_NATIVE_APPROVED_AIK_ROOTS[this.config.expectedAikRootCertificateSha256],aikRootCertificateFingerprint=this.config.expectedAikRootCertificateSha256,aikRootPolicyId=rootPolicy.policyId,aikPublicKeyFingerprint=jwkFingerprint(collected.aikPublicJwk),requestKeyFingerprint=jwkFingerprint(expectedRequest),consequenceKeyFingerprint=jwkFingerprint(expectedConsequence),verifiedAt=new Date().toISOString(),expiresAt=new Date(Date.now()+this.config.attestationTtlSeconds*1000).toISOString(),claims={attestationMode:"LOCAL_WINDOWS" as const,nonce,aikCertificateFingerprint,aikRootCertificateFingerprint,aikRootPolicyId,aikPublicKeyFingerprint,requestKeyFingerprint,consequenceKeyFingerprint,aikCertificateEku:"2.23.133.8.3" as const,trustAnchorMode:"PINNED_EXCLUSIVE_ROOT" as const,verifier:"NCryptVerifyClaim+CertCreateCertificateChainEngine" as const,revocationPolicy:"CHAIN_EXCLUDE_ROOT" as const,revocationChecked:true as const},evidenceDigest=sha256(Buffer.concat([Buffer.from(nonce),certificateBytes,Buffer.from(aikRootCertificateFingerprint,"hex"),requestBytes,consequenceBytes])),claimsDigest=sha256(canonical(claims));
      const attestation=HardwareKeyAttestationSchema.parse({id:crypto.randomUUID(),version:1,providerManifestId:input.providerManifestId,provider:"TPM",kind:"WINDOWS_TPM_KEY_ATTESTATION",publicKeyFingerprint:consequenceKeyFingerprint,evidenceDigest,claimsDigest,verification:"VERIFIED",verifiedBy:"cieav:windows-tpm-native:local-ncrypt-verify-claim+pinned-root",verifiedAt,expiresAt});
      return{attestation,publicJwk:expectedConsequence,requestPublicJwk:expectedRequest,claims};
    } finally {await rm(temp,{recursive:true,force:true})}
  }
}
