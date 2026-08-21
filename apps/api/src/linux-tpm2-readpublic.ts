import crypto from "node:crypto";
import {spawn} from "node:child_process";
import {lstat,mkdtemp,readFile,rm,stat} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {z} from "zod";

const DigestSchema=z.string().regex(/^[0-9a-f]{64}$/);
const PersistentHandleSchema=z.string().regex(/^0x81[0-9a-fA-F]{6}$/);
const ConfigSchema=z.object({executablePath:z.string().min(1).max(4096),executableSha256:DigestSchema,tcti:z.string().min(1).max(300).regex(/^[A-Za-z0-9_.,:=+\-\/]+$/).optional(),timeoutMs:z.number().int().min(1000).max(120000).default(10000)}).strict();
export type LinuxTpm2ReadPublicConfig=z.infer<typeof ConfigSchema>;
export type LinuxTpm2ReadPublicRunner=(executable:string,args:string[],env:NodeJS.ProcessEnv,timeoutMs:number,maxOutputBytes:number)=>Promise<{stdout:string;stderr:string}>;
export type LinuxTpm2PersistentHandleIdentity={handle:string;name:Buffer;publicJwk:crypto.JsonWebKey;serializedHandle:Buffer};
const MAX_NAME_BYTES=128,MAX_PUBLIC_BYTES=16*1024,MAX_SERIALIZED_HANDLE_BYTES=16*1024,MAX_STDOUT_BYTES=64*1024;

function fail(code:string):never{throw new Error(`linux_tpm2_readpublic_${code}`)}
const sha256=(value:Buffer)=>crypto.createHash("sha256").update(value).digest("hex");
const canonicalJwk=(jwk:crypto.JsonWebKey)=>jwk.kty==="RSA"?{kty:"RSA",n:jwk.n,e:jwk.e}:jwk.kty==="EC"?{kty:"EC",crv:jwk.crv,x:jwk.x,y:jwk.y}:jwk;
const sameJwk=(a:crypto.JsonWebKey,b:crypto.JsonWebKey)=>JSON.stringify(canonicalJwk(a))===JSON.stringify(canonicalJwk(b));
const safeEqual=(a:Buffer,b:Buffer)=>a.length===b.length&&crypto.timingSafeEqual(a,b);
const defaultRunner:LinuxTpm2ReadPublicRunner=async(executable,args,env,timeoutMs,maxOutputBytes)=>await new Promise((resolve,reject)=>{
  const child=spawn(executable,args,{cwd:path.dirname(executable),env,shell:false,stdio:["ignore","pipe","pipe"]});let stdout=Buffer.alloc(0),stderr=Buffer.alloc(0),settled=false;let timer:NodeJS.Timeout;
  const finish=(fn:()=>void)=>{if(settled)return;settled=true;if(timer)clearTimeout(timer);fn()},append=(current:Buffer,chunk:Buffer,limit:number)=>{const next=Buffer.concat([current,chunk]);if(next.length>limit){child.kill();throw new Error("linux_tpm2_readpublic_output_too_large")}return next};
  child.stdout.on("data",chunk=>{try{stdout=append(stdout,Buffer.from(chunk),maxOutputBytes)}catch(err){finish(()=>reject(err))}});child.stderr.on("data",chunk=>{try{stderr=append(stderr,Buffer.from(chunk),64*1024)}catch(err){finish(()=>reject(err))}});child.on("error",err=>finish(()=>reject(new Error(`linux_tpm2_readpublic_spawn_failed:${err.message}`))));child.on("close",code=>finish(()=>code===0?resolve({stdout:stdout.toString("utf8"),stderr:stderr.toString("utf8")}):reject(new Error(`linux_tpm2_readpublic_failed:${code}:${stderr.toString("utf8").trim().slice(0,1000)}`))));timer=setTimeout(()=>{child.kill();finish(()=>reject(new Error("linux_tpm2_readpublic_timeout")))},timeoutMs);
});

export class CieavLinuxTpm2ReadPublic{
  private readonly config:LinuxTpm2ReadPublicConfig;
  constructor(rawConfig:unknown,private readonly runtimePlatform:NodeJS.Platform=process.platform,private readonly runner:LinuxTpm2ReadPublicRunner=defaultRunner){this.config=ConfigSchema.parse(rawConfig)}
  private async assertPinnedExecutable(){if(!path.isAbsolute(this.config.executablePath))fail("absolute_path_required");const info=await lstat(this.config.executablePath);if(info.isSymbolicLink()||!info.isFile())fail("executable_not_regular");if(sha256(await readFile(this.config.executablePath))!==this.config.executableSha256)fail("executable_digest_mismatch")}
  private env(){return this.config.tcti?{TPM2TOOLS_TCTI:this.config.tcti}:{} as NodeJS.ProcessEnv}
  async verify(input:{handle:string;expectedName:Buffer;expectedPublicJwk:crypto.JsonWebKey}):Promise<LinuxTpm2PersistentHandleIdentity>{
    if(this.runtimePlatform!=="linux")fail("linux_required");const handle=PersistentHandleSchema.parse(input.handle);if(!Buffer.isBuffer(input.expectedName)||input.expectedName.length<4||input.expectedName.length>MAX_NAME_BYTES)fail("expected_name_size");await this.assertPinnedExecutable();
    const temp=await mkdtemp(path.join(os.tmpdir(),"cieav-tpm2-readpublic-"));try{const namePath=path.join(temp,"object.name"),publicPath=path.join(temp,"object.pem"),handlePath=path.join(temp,"object.handle");await this.runner(this.config.executablePath,["-Q","-c",handle,"-n",namePath,"-o",publicPath,"-f","pem","-t",handlePath],this.env(),this.config.timeoutMs,MAX_STDOUT_BYTES);
      const [nameInfo,publicInfo,handleInfo]=await Promise.all([stat(namePath).catch(()=>null),stat(publicPath).catch(()=>null),stat(handlePath).catch(()=>null)]);if(!nameInfo?.isFile()||nameInfo.size<=0||nameInfo.size>MAX_NAME_BYTES)fail("name_output_invalid");if(!publicInfo?.isFile()||publicInfo.size<=0||publicInfo.size>MAX_PUBLIC_BYTES)fail("public_output_invalid");if(!handleInfo?.isFile()||handleInfo.size<=0||handleInfo.size>MAX_SERIALIZED_HANDLE_BYTES)fail("serialized_handle_output_invalid");
      const [name,pem,serializedHandle]=await Promise.all([readFile(namePath),readFile(publicPath),readFile(handlePath)]);if(!safeEqual(name,input.expectedName))fail("name_mismatch");let key:crypto.KeyObject;try{key=crypto.createPublicKey(pem)}catch{fail("public_key_invalid")};let actual:crypto.JsonWebKey;try{actual=key.export({format:"jwk"}) as crypto.JsonWebKey}catch{fail("public_jwk_export_failed")};if(!sameJwk(actual,input.expectedPublicJwk))fail("public_key_mismatch");return{handle,name:Buffer.from(name),publicJwk:actual,serializedHandle:Buffer.from(serializedHandle)};
    } finally {await rm(temp,{recursive:true,force:true})}
  }
}
