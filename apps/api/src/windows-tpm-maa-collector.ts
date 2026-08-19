import crypto from "node:crypto";
import {spawn} from "node:child_process";
import {readFile,stat} from "node:fs/promises";
import path from "node:path";
import {z} from "zod";
import {CieavMaaTpmAttestationVerifier,type MaaTpmVerificationResult} from "./maa-tpm-attestation.js";

const DigestSchema=z.string().regex(/^[0-9a-f]{64}$/),EnvNameSchema=z.string().regex(/^[A-Z][A-Z0-9_]{1,127}$/);
export const WindowsTpmMaaCollectorConfigSchema=z.object({
  executablePath:z.string().min(1).max(4096),executableSha256:DigestSchema,
  aikName:z.string().min(1).max(200),aikMachineKey:z.boolean().default(true),requestKeyName:z.string().min(1).max(200),relyingPartyId:z.string().min(1).max(1000),
  tenantIdEnv:EnvNameSchema.default("AZURE_TENANT_ID"),clientIdEnv:EnvNameSchema.default("AZURE_CLIENT_ID"),clientSecretEnv:EnvNameSchema.default("AZURE_CLIENT_SECRET"),maaUriEnv:EnvNameSchema.default("AZURE_MAA_URI"),
  timeoutMs:z.number().int().min(1000).max(120000).default(30000),maxReportBytes:z.number().int().min(1024).max(1024*1024).default(256*1024)
}).strict();
export type WindowsTpmMaaCollectorConfig=z.infer<typeof WindowsTpmMaaCollectorConfigSchema>;
export type WindowsTpmMaaCollectInput={nonce:string;issuer:string;expectedPolicyHash:string;expectedPublicJwk:{kty:"RSA";n:string;e:string};providerManifestId:string;maxTokenAgeSeconds?:number};
export type MaaCollectorRunner=(executable:string,args:string[],env:NodeJS.ProcessEnv,timeoutMs:number,maxReportBytes:number)=>Promise<string>;

const sha256=(value:Buffer)=>crypto.createHash("sha256").update(value).digest("hex");
const forbiddenEnv=new Set(["NODE_OPTIONS","NODE_PATH","PYTHONPATH","PYTHONHOME","LD_PRELOAD","DYLD_INSERT_LIBRARIES","ELECTRON_RUN_AS_NODE"]);
const defaultCollectorRunner:MaaCollectorRunner=async(executable,args,env,timeoutMs,maxReportBytes)=>await new Promise<string>((resolve,reject)=>{const child=spawn(executable,args,{env,windowsHide:true,stdio:["ignore","pipe","pipe"]});let stdout=Buffer.alloc(0),stderr=Buffer.alloc(0),settled=false;let timer:NodeJS.Timeout;const finish=(fn:()=>void)=>{if(settled)return;settled=true;if(timer)clearTimeout(timer);fn()};const append=(current:Buffer,chunk:Buffer,limit:number)=>{const next=Buffer.concat([current,chunk]);if(next.length>limit){child.kill();throw new Error("maa_collector_output_too_large")}return next};child.stdout.on("data",chunk=>{try{stdout=append(stdout,Buffer.from(chunk),maxReportBytes)}catch(err){finish(()=>reject(err))}});child.stderr.on("data",chunk=>{try{stderr=append(stderr,Buffer.from(chunk),64*1024)}catch(err){finish(()=>reject(err))}});child.on("error",err=>finish(()=>reject(new Error(`maa_collector_spawn_failed:${err.message}`))));child.on("close",code=>finish(()=>{if(code!==0)return reject(new Error(`maa_collector_failed:${code}:${stderr.toString("utf8").trim().slice(0,1000)}`));const report=stdout.toString("utf8").trim();if(!report||report.split(".").length!==3)return reject(new Error("maa_collector_invalid_report"));resolve(report)}));timer=setTimeout(()=>{child.kill();finish(()=>reject(new Error("maa_collector_timeout")))},timeoutMs)});

export class CieavWindowsTpmMaaCollector{
  private readonly config:WindowsTpmMaaCollectorConfig;
  constructor(rawConfig:unknown,private readonly verifier:CieavMaaTpmAttestationVerifier,private readonly env:NodeJS.ProcessEnv=process.env,private readonly runtimePlatform:NodeJS.Platform=process.platform,private readonly runner:MaaCollectorRunner=defaultCollectorRunner){this.config=WindowsTpmMaaCollectorConfigSchema.parse(rawConfig)}
  private async assertExecutable(){if(!path.isAbsolute(this.config.executablePath))throw new Error("maa_collector_absolute_path_required");const info=await stat(this.config.executablePath);if(!info.isFile())throw new Error("maa_collector_not_regular_file");if(sha256(await readFile(this.config.executablePath))!==this.config.executableSha256)throw new Error("maa_collector_digest_mismatch")}
  private sourceEnv(name:string){if(forbiddenEnv.has(name))throw new Error("maa_collector_forbidden_env_mapping");const value=this.env[name];if(!value)throw new Error(`maa_collector_required_env_missing:${name}`);return value}
  private collectorEnv(){const out:NodeJS.ProcessEnv={AZURE_TENANT_ID:this.sourceEnv(this.config.tenantIdEnv),AZURE_CLIENT_ID:this.sourceEnv(this.config.clientIdEnv),AZURE_CLIENT_SECRET:this.sourceEnv(this.config.clientSecretEnv),AZURE_MAA_URI:this.sourceEnv(this.config.maaUriEnv)};for(const name of ["SystemRoot","WINDIR","PATH","TEMP","TMP"]){const value=this.env[name];if(value)out[name]=value}return out}
  private async collectRaw(nonce:string){if(this.runtimePlatform!=="win32")throw new Error("maa_collector_windows_required");if(!nonce||nonce.length>4096)throw new Error("maa_collector_nonce_required");await this.assertExecutable();const args=["collect","--aik",this.config.aikName,"--request-key",this.config.requestKeyName,"--rp-id",this.config.relyingPartyId,"--nonce",nonce,...(this.config.aikMachineKey?[]:["--aik-user"])];return await this.runner(this.config.executablePath,args,this.collectorEnv(),this.config.timeoutMs,this.config.maxReportBytes)}
  async collectAndVerify(input:WindowsTpmMaaCollectInput):Promise<MaaTpmVerificationResult>{const token=await this.collectRaw(input.nonce);return await this.verifier.verify({token,issuer:input.issuer,providerManifestId:input.providerManifestId,expectedNonce:input.nonce,expectedPolicyHash:input.expectedPolicyHash,expectedPublicJwk:input.expectedPublicJwk,...(input.maxTokenAgeSeconds?{maxTokenAgeSeconds:input.maxTokenAgeSeconds}:{})})}
}
