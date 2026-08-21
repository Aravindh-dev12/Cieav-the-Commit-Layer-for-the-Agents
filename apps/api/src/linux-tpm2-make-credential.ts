import crypto from "node:crypto";
import {spawn} from "node:child_process";
import {lstat,mkdtemp,readFile,rm,stat,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {z} from "zod";
import type {LinuxTpm2CredentialIssuer} from "./linux-tpm2-ak-enrollment.js";

const DigestSchema=z.string().regex(/^[0-9a-f]{64}$/);
const ConfigSchema=z.object({executablePath:z.string().min(1).max(4096),executableSha256:DigestSchema,timeoutMs:z.number().int().min(1000).max(120000).default(15000)}).strict();
export type LinuxTpm2MakeCredentialConfig=z.infer<typeof ConfigSchema>;
export type LinuxTpm2MakeCredentialRunner=(executable:string,args:string[],env:NodeJS.ProcessEnv,timeoutMs:number,maxOutputBytes:number)=>Promise<{stdout:string;stderr:string}>;
const MAX_SECRET_BYTES=128,MAX_CREDENTIAL_BYTES=32*1024,MAX_STDOUT_BYTES=64*1024;
const NAME_LENGTHS=new Set([22,34,50,66]);

function fail(code:string):never{throw new Error(`linux_tpm2_make_credential_${code}`)}
const sha256=(value:Buffer)=>crypto.createHash("sha256").update(value).digest("hex");
const defaultRunner:LinuxTpm2MakeCredentialRunner=async(executable,args,env,timeoutMs,maxOutputBytes)=>await new Promise((resolve,reject)=>{
  const child=spawn(executable,args,{cwd:path.dirname(executable),env,shell:false,stdio:["ignore","pipe","pipe"]});let stdout=Buffer.alloc(0),stderr=Buffer.alloc(0),settled=false;let timer:NodeJS.Timeout;
  const finish=(fn:()=>void)=>{if(settled)return;settled=true;if(timer)clearTimeout(timer);fn()},append=(current:Buffer,chunk:Buffer,limit:number)=>{const next=Buffer.concat([current,chunk]);if(next.length>limit){child.kill();throw new Error("linux_tpm2_make_credential_output_too_large")}return next};
  child.stdout.on("data",chunk=>{try{stdout=append(stdout,Buffer.from(chunk),maxOutputBytes)}catch(err){finish(()=>reject(err))}});child.stderr.on("data",chunk=>{try{stderr=append(stderr,Buffer.from(chunk),64*1024)}catch(err){finish(()=>reject(err))}});child.on("error",err=>finish(()=>reject(new Error(`linux_tpm2_make_credential_spawn_failed:${err.message}`))));child.on("close",code=>finish(()=>code===0?resolve({stdout:stdout.toString("utf8"),stderr:stderr.toString("utf8")}):reject(new Error(`linux_tpm2_make_credential_failed:${code}:${stderr.toString("utf8").trim().slice(0,1000)}`))));timer=setTimeout(()=>{child.kill();finish(()=>reject(new Error("linux_tpm2_make_credential_timeout")))},timeoutMs);
});

export class CieavLinuxTpm2MakeCredential{
  private readonly config:LinuxTpm2MakeCredentialConfig;
  constructor(rawConfig:unknown,private readonly runtimePlatform:NodeJS.Platform=process.platform,private readonly runner:LinuxTpm2MakeCredentialRunner=defaultRunner){this.config=ConfigSchema.parse(rawConfig)}
  private async assertPinnedExecutable(){if(!path.isAbsolute(this.config.executablePath))fail("absolute_path_required");const info=await lstat(this.config.executablePath);if(info.isSymbolicLink()||!info.isFile())fail("executable_not_regular");if(sha256(await readFile(this.config.executablePath))!==this.config.executableSha256)fail("executable_digest_mismatch")}
  private ekPem(jwk:crypto.JsonWebKey){if(jwk.kty!=="RSA"&&!(jwk.kty==="EC"&&jwk.crv==="P-256"))fail("ek_public_key_unsupported");let key:crypto.KeyObject;try{key=crypto.createPublicKey({key:jwk,format:"jwk"})}catch{fail("ek_public_key_invalid")};if(jwk.kty==="RSA"&&key.asymmetricKeyType!=="rsa")fail("ek_public_key_type_mismatch");if(jwk.kty==="EC"&&key.asymmetricKeyType!=="ec")fail("ek_public_key_type_mismatch");return{algorithm:jwk.kty==="RSA"?"rsa":"ecc",pem:key.export({format:"pem",type:"spki"}) as string}}
  issue:LinuxTpm2CredentialIssuer=async({ekPublicJwk,akName,secret})=>{
    if(this.runtimePlatform!=="linux")fail("linux_required");if(!Buffer.isBuffer(akName)||!NAME_LENGTHS.has(akName.length))fail("ak_name_size");if(!Buffer.isBuffer(secret)||secret.length===0||secret.length>MAX_SECRET_BYTES)fail("secret_size");await this.assertPinnedExecutable();const ek=this.ekPem(ekPublicJwk);
    const temp=await mkdtemp(path.join(os.tmpdir(),"cieav-tpm2-makecred-"));try{const ekPath=path.join(temp,"ek.pem"),secretPath=path.join(temp,"secret.bin"),outputPath=path.join(temp,"credential.blob");await writeFile(ekPath,ek.pem,{flag:"wx",mode:0o600});await writeFile(secretPath,secret,{flag:"wx",mode:0o600});
      await this.runner(this.config.executablePath,["-Q","-u",ekPath,"-G",ek.algorithm,"-s",secretPath,"-n",akName.toString("hex"),"-o",outputPath],{TPM2TOOLS_TCTI:"none"},this.config.timeoutMs,MAX_STDOUT_BYTES);
      let info;try{info=await stat(outputPath)}catch{fail("credential_output_missing")};if(!info.isFile()||info.size<=0||info.size>MAX_CREDENTIAL_BYTES)fail("credential_output_size");const credentialBlob=await readFile(outputPath);if(credentialBlob.length!==info.size)fail("credential_output_changed");return{credentialBlob:Buffer.from(credentialBlob)};
    } finally {await rm(temp,{recursive:true,force:true})}
  }
}
