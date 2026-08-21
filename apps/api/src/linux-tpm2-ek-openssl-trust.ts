import crypto from "node:crypto";
import {spawn} from "node:child_process";
import {lstat,mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {z} from "zod";
import type {LinuxTpm2EkCertificate,LinuxTpm2EkTrustResult} from "./linux-tpm2-ak-enrollment.js";

const DigestSchema=z.string().regex(/^[0-9a-f]{64}$/),PinnedFileSchema=z.object({path:z.string().min(1).max(4096),sha256:DigestSchema}).strict();
const ConfigSchema=z.object({policyId:z.string().regex(/^[A-Za-z0-9._-]{1,160}$/),openssl:PinnedFileSchema,roots:PinnedFileSchema,intermediates:PinnedFileSchema.optional(),crls:PinnedFileSchema.optional(),revocationPolicy:z.enum(["CHAIN_ONLY","CRL_ALL_REQUIRED"]),verifyDepth:z.number().int().min(1).max(16).default(6),authLevel:z.number().int().min(1).max(5).default(2),timeoutMs:z.number().int().min(1000).max(60000).default(10000)}).strict().superRefine((v,ctx)=>{if(v.revocationPolicy==="CRL_ALL_REQUIRED"&&!v.crls)ctx.addIssue({code:z.ZodIssueCode.custom,message:"CRL bundle required for CRL_ALL_REQUIRED"})});
export type LinuxTpm2EkOpenSslTrustConfig=z.infer<typeof ConfigSchema>;
export type LinuxTpm2EkOpenSslRunner=(executable:string,args:string[],env:NodeJS.ProcessEnv,timeoutMs:number,maxOutputBytes:number)=>Promise<{stdout:string;stderr:string}>;
const MAX_BUNDLE_BYTES=8*1024*1024,MAX_OUTPUT_BYTES=64*1024;

function fail(code:string):never{throw new Error(`linux_tpm2_ek_trust_${code}`)}
const sha256=(value:Buffer)=>crypto.createHash("sha256").update(value).digest("hex");
const defaultRunner:LinuxTpm2EkOpenSslRunner=async(executable,args,env,timeoutMs,maxOutputBytes)=>await new Promise((resolve,reject)=>{const child=spawn(executable,args,{cwd:path.dirname(executable),env,shell:false,stdio:["ignore","pipe","pipe"]});let stdout=Buffer.alloc(0),stderr=Buffer.alloc(0),settled=false;let timer:NodeJS.Timeout;const finish=(fn:()=>void)=>{if(settled)return;settled=true;if(timer)clearTimeout(timer);fn()},append=(current:Buffer,chunk:Buffer,limit:number)=>{const next=Buffer.concat([current,chunk]);if(next.length>limit){child.kill();throw new Error("linux_tpm2_ek_trust_output_too_large")}return next};child.stdout.on("data",chunk=>{try{stdout=append(stdout,Buffer.from(chunk),maxOutputBytes)}catch(err){finish(()=>reject(err))}});child.stderr.on("data",chunk=>{try{stderr=append(stderr,Buffer.from(chunk),maxOutputBytes)}catch(err){finish(()=>reject(err))}});child.on("error",err=>finish(()=>reject(new Error(`linux_tpm2_ek_trust_spawn_failed:${err.message}`))));child.on("close",code=>finish(()=>code===0?resolve({stdout:stdout.toString("utf8"),stderr:stderr.toString("utf8")}):reject(new Error(`linux_tpm2_ek_trust_verify_failed:${code}:${stderr.toString("utf8").trim().slice(0,1200)}`))));timer=setTimeout(()=>{child.kill();finish(()=>reject(new Error("linux_tpm2_ek_trust_timeout")))},timeoutMs)});

export class CieavLinuxTpm2EkOpenSslTrust{
  private readonly config:LinuxTpm2EkOpenSslTrustConfig;
  constructor(rawConfig:unknown,private readonly runner:LinuxTpm2EkOpenSslRunner=defaultRunner){this.config=ConfigSchema.parse(rawConfig)}
  private async pinnedFile(input:z.infer<typeof PinnedFileSchema>,kind:string){if(!path.isAbsolute(input.path))fail(`${kind}_absolute_path_required`);const info=await lstat(input.path);if(info.isSymbolicLink()||!info.isFile()||info.size<=0||info.size>MAX_BUNDLE_BYTES)fail(`${kind}_file_invalid`);const body=await readFile(input.path);if(sha256(body)!==input.sha256)fail(`${kind}_digest_mismatch`);return body}
  async verify(certificate:LinuxTpm2EkCertificate):Promise<LinuxTpm2EkTrustResult>{
    const [opensslBytes,roots,intermediates,crls]=await Promise.all([this.pinnedFile(this.config.openssl,"openssl"),this.pinnedFile(this.config.roots,"roots"),this.config.intermediates?this.pinnedFile(this.config.intermediates,"intermediates"):undefined,this.config.crls?this.pinnedFile(this.config.crls,"crls"):undefined]);
    // Re-check executable bytes immediately before path-based execution. Installations must additionally protect its directory with OS ACLs/ownership.
    if(sha256(await readFile(this.config.openssl.path))!==sha256(opensslBytes))fail("openssl_changed_before_exec");
    const temp=await mkdtemp(path.join(os.tmpdir(),"cieav-ek-trust-"));try{const leafPath=path.join(temp,"ek.pem"),rootsPath=path.join(temp,"roots.pem"),intermediatesPath=path.join(temp,"intermediates.pem"),crlsPath=path.join(temp,"crls.pem");await writeFile(leafPath,certificate.certificate.toString(),{flag:"wx",mode:0o600});await writeFile(rootsPath,roots,{flag:"wx",mode:0o600});if(intermediates)await writeFile(intermediatesPath,intermediates,{flag:"wx",mode:0o600});if(crls)await writeFile(crlsPath,crls,{flag:"wx",mode:0o600});
      const args=["verify","-x509_strict","-check_ss_sig","-trusted_first","-auth_level",String(this.config.authLevel),"-verify_depth",String(this.config.verifyDepth),"-purpose","any","-CAfile",rootsPath,"-no-CApath","-no-CAstore",...(intermediates?["-untrusted",intermediatesPath]:[]),...(this.config.revocationPolicy==="CRL_ALL_REQUIRED"?["-CRLfile",crlsPath,"-crl_check_all"]:[]),"--",leafPath],result=await this.runner(this.config.openssl.path,args,{},this.config.timeoutMs,MAX_OUTPUT_BYTES);if(!result.stdout.includes(`${leafPath}: OK`)&&!result.stdout.trim().endsWith(": OK"))fail("verification_success_marker_missing");return{trusted:true,verifiedBy:`cieav:openssl-x509:${this.config.policyId}:${this.config.revocationPolicy.toLowerCase()}`};
    }finally{await rm(temp,{recursive:true,force:true})}
  }
}
