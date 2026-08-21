import crypto from "node:crypto";
import {spawn} from "node:child_process";
import {lstat,mkdtemp,readFile,rm,stat,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {z} from "zod";

const DigestSchema=z.string().regex(/^[0-9a-f]{64}$/);
const PersistentHandleSchema=z.string().regex(/^0x81[0-9a-fA-F]{6}$/);
const ConfigSchema=z.object({executablePath:z.string().min(1).max(4096),executableSha256:DigestSchema,akHandle:PersistentHandleSchema,ekHandle:PersistentHandleSchema,tcti:z.string().min(1).max(300).regex(/^[A-Za-z0-9_.,:=+\-\/]+$/).optional(),timeoutMs:z.number().int().min(1000).max(120000).default(15000)}).strict();
export type LinuxTpm2ActivateCredentialConfig=z.infer<typeof ConfigSchema>;
export type LinuxTpm2ActivateCredentialRunner=(executable:string,args:string[],env:NodeJS.ProcessEnv,timeoutMs:number,maxOutputBytes:number)=>Promise<{stdout:string;stderr:string}>;
const MAX_CREDENTIAL_BYTES=32*1024,MAX_ACTIVATION_BYTES=1024,MAX_STDOUT_BYTES=64*1024;

function fail(code:string):never{throw new Error(`linux_tpm2_activate_credential_${code}`)}
const sha256=(value:Buffer)=>crypto.createHash("sha256").update(value).digest("hex");
const defaultRunner:LinuxTpm2ActivateCredentialRunner=async(executable,args,env,timeoutMs,maxOutputBytes)=>await new Promise((resolve,reject)=>{
  const child=spawn(executable,args,{cwd:path.dirname(executable),env,shell:false,stdio:["ignore","pipe","pipe"]});let stdout=Buffer.alloc(0),stderr=Buffer.alloc(0),settled=false;let timer:NodeJS.Timeout;
  const finish=(fn:()=>void)=>{if(settled)return;settled=true;if(timer)clearTimeout(timer);fn()},append=(current:Buffer,chunk:Buffer,limit:number)=>{const next=Buffer.concat([current,chunk]);if(next.length>limit){child.kill();throw new Error("linux_tpm2_activate_credential_output_too_large")}return next};
  child.stdout.on("data",chunk=>{try{stdout=append(stdout,Buffer.from(chunk),maxOutputBytes)}catch(err){finish(()=>reject(err))}});child.stderr.on("data",chunk=>{try{stderr=append(stderr,Buffer.from(chunk),64*1024)}catch(err){finish(()=>reject(err))}});child.on("error",err=>finish(()=>reject(new Error(`linux_tpm2_activate_credential_spawn_failed:${err.message}`))));child.on("close",code=>finish(()=>code===0?resolve({stdout:stdout.toString("utf8"),stderr:stderr.toString("utf8")}):reject(new Error(`linux_tpm2_activate_credential_failed:${code}:${stderr.toString("utf8").trim().slice(0,1000)}`))));timer=setTimeout(()=>{child.kill();finish(()=>reject(new Error("linux_tpm2_activate_credential_timeout")))},timeoutMs);
});

export class CieavLinuxTpm2ActivateCredential{
  private readonly config:LinuxTpm2ActivateCredentialConfig;
  constructor(rawConfig:unknown,private readonly runtimePlatform:NodeJS.Platform=process.platform,private readonly runner:LinuxTpm2ActivateCredentialRunner=defaultRunner){this.config=ConfigSchema.parse(rawConfig)}
  private async assertPinnedExecutable(){if(!path.isAbsolute(this.config.executablePath))fail("absolute_path_required");const info=await lstat(this.config.executablePath);if(info.isSymbolicLink()||!info.isFile())fail("executable_not_regular");if(sha256(await readFile(this.config.executablePath))!==this.config.executableSha256)fail("executable_digest_mismatch")}
  private env(){return this.config.tcti?{TPM2TOOLS_TCTI:this.config.tcti}:{} as NodeJS.ProcessEnv}
  async activate(credentialBlob:Buffer):Promise<Buffer>{
    if(this.runtimePlatform!=="linux")fail("linux_required");if(!Buffer.isBuffer(credentialBlob)||credentialBlob.length===0||credentialBlob.length>MAX_CREDENTIAL_BYTES)fail("credential_blob_size");await this.assertPinnedExecutable();
    const temp=await mkdtemp(path.join(os.tmpdir(),"cieav-tpm2-activate-"));try{const credentialPath=path.join(temp,"credential.blob"),outputPath=path.join(temp,"activation.bin");await writeFile(credentialPath,credentialBlob,{flag:"wx",mode:0o600});
      await this.runner(this.config.executablePath,["-c",this.config.akHandle,"-C",this.config.ekHandle,"-i",credentialPath,"-o",outputPath],this.env(),this.config.timeoutMs,MAX_STDOUT_BYTES);
      let info;try{info=await stat(outputPath)}catch{fail("activation_output_missing")};if(!info.isFile()||info.size<=0||info.size>MAX_ACTIVATION_BYTES)fail("activation_output_size");const activated=await readFile(outputPath);if(activated.length!==info.size)fail("activation_output_changed");return Buffer.from(activated);
    } finally {await rm(temp,{recursive:true,force:true})}
  }
}
