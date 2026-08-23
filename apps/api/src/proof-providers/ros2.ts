import crypto from "node:crypto";
import {spawn} from "node:child_process";
import {existsSync,readFileSync,realpathSync,statSync} from "node:fs";
import path from "node:path";
import {z} from "zod";
import {ProofObservationRequestSchema,ProofProviderResultSchema,ProviderHealthSchema,type ProofObservationRequest,type ProofProviderResult} from "@cieav/contracts";
import type {ProofProvider} from "@cieav/core/provider-runtime";

const PROVIDER_ID="cieav.ros2-proof.v1";
const Digest=z.string().regex(/^[0-9a-f]{64}$/);
export const Ros2ProofTargetSchema=z.object({
  id:z.string().regex(/^[A-Za-z0-9._-]{1,160}$/),
  rosName:z.string().min(1).max(1000),
  rosType:z.string().min(1).max(1000),
  command:z.string().min(1).max(2000),
  commandSha256:Digest,
  prefixArgs:z.array(z.string().max(4000)).max(20).default([]),
  staticEnv:z.record(z.string().max(16_000)).default({}),
  timeoutMs:z.number().int().min(500).max(120_000).default(15_000),
  maxStdoutBytes:z.number().int().min(128).max(4*1024*1024).default(256*1024),
  maxStderrBytes:z.number().int().min(128).max(1024*1024).default(128*1024)
}).strict();
export type Ros2ProofTarget=z.infer<typeof Ros2ProofTargetSchema>;
const CatalogSchema=z.object({version:z.literal(1),ros2Proof:z.array(Ros2ProofTargetSchema).max(1000).default([])}).passthrough();
const forbiddenEnv=new Set(["NODE_OPTIONS","NODE_PATH","BASH_ENV","ENV","PROMPT_COMMAND","RUBYOPT","PERL5OPT","PYTHONPATH","PYTHONHOME","LD_PRELOAD","LD_LIBRARY_PATH","DYLD_INSERT_LIBRARIES","DYLD_LIBRARY_PATH"]);
const sha256=(value:Buffer|string)=>crypto.createHash("sha256").update(value).digest("hex");
function verifyBinary(target:Ros2ProofTarget){if(!path.isAbsolute(target.command))throw new Error("ros2_proof_command_must_be_absolute");const resolved=realpathSync(target.command),stat=statSync(resolved);if(!stat.isFile())throw new Error("ros2_proof_command_not_file");if(sha256(readFileSync(resolved))!==target.commandSha256)throw new Error("ros2_proof_command_digest_mismatch");return resolved}
function childEnv(target:Ros2ProofTarget){const env:Record<string,string>={};for(const[key,value]of Object.entries(target.staticEnv)){if(forbiddenEnv.has(key.toUpperCase()))throw new Error(`ros2_proof_forbidden_env:${key}`);env[key]=value}if(process.platform==="win32")for(const key of ["SystemRoot","WINDIR","TEMP","TMP"]){const value=process.env[key];if(value)env[key]=value}return env}
function targetRef(id:string){if(!/^[A-Za-z0-9._-]{1,160}$/.test(id))throw new Error("ros2_proof_target_id_invalid");return`ros2-proof:${id}`}
export function ros2ProofTargetRef(id:string){return targetRef(id)}
function parseTargetRef(value:string){const match=value.match(/^ros2-proof:([A-Za-z0-9._-]{1,160})$/);if(!match)throw new Error("ros2_proof_target_ref_invalid");return match[1]!}
function normalizeOutput(buffer:Buffer){return buffer.toString("utf8").replace(/\r\n/g,"\n").trimEnd()}
function run(target:Ros2ProofTarget,command:string,timeoutMs:number){return new Promise<{started:boolean;exitCode:number|null;timedOut:boolean;stdout:Buffer;stderr:Buffer}>((resolve,reject)=>{let started=false,timedOut=false,stdout=Buffer.alloc(0),stderr=Buffer.alloc(0),settled=false;let timer:NodeJS.Timeout|undefined;const done=(value:{started:boolean;exitCode:number|null;timedOut:boolean;stdout:Buffer;stderr:Buffer})=>{if(settled)return;settled=true;if(timer)clearTimeout(timer);resolve(value)},child=spawn(command,[...target.prefixArgs,"topic","echo","--once",target.rosName,target.rosType],{shell:false,windowsHide:true,env:childEnv(target),stdio:["ignore","pipe","pipe"]});child.once("spawn",()=>{started=true});child.once("error",error=>{if(!started&&!settled){settled=true;if(timer)clearTimeout(timer);reject(error)}});child.stdout.on("data",chunk=>{const next=Buffer.concat([stdout,Buffer.from(chunk)]);if(next.length>target.maxStdoutBytes){try{child.kill("SIGKILL")}catch{};stdout=next.subarray(0,target.maxStdoutBytes);return}stdout=next});child.stderr.on("data",chunk=>{stderr=Buffer.concat([stderr,Buffer.from(chunk)]).subarray(0,target.maxStderrBytes)});child.once("close",code=>done({started,exitCode:code,timedOut,stdout,stderr}));timer=setTimeout(()=>{timedOut=true;try{child.kill("SIGKILL")}catch{}},Math.min(timeoutMs,target.timeoutMs));timer.unref?.()})}

export class Ros2ProofProvider implements ProofProvider{
  readonly descriptor={id:PROVIDER_ID,version:"1",evidenceKinds:["ROS2_TOPIC_SAMPLE"],canObservePreState:true,canObservePostState:true,canSettleOutcome:true,authority:false as const};
  private readonly targets=new Map<string,Ros2ProofTarget>();
  constructor(targets:Ros2ProofTarget[]){if(!targets.length)throw new Error("ros2_proof_target_required");for(const raw of targets){const target=Ros2ProofTargetSchema.parse(raw);if(this.targets.has(target.id))throw new Error(`ros2_proof_duplicate_target:${target.id}`);verifyBinary(target);childEnv(target);this.targets.set(target.id,target)}}
  static fromCatalogFile(file:string){if(!path.isAbsolute(file))throw new Error("ros2_proof_catalog_must_be_absolute");if(!existsSync(file))throw new Error(`ros2_proof_catalog_missing:${file}`);const catalog=CatalogSchema.parse(JSON.parse(readFileSync(file,"utf8")));return catalog.ros2Proof.length?new Ros2ProofProvider(catalog.ros2Proof):null}
  async health(){return ProviderHealthSchema.parse({ok:true,providerId:PROVIDER_ID,checkedAt:new Date().toISOString(),detail:`ROS2 proof provider ready with ${this.targets.size} digest-pinned read-only topic observers.`,authority:false})}
  async observe(raw:ProofObservationRequest):Promise<ProofProviderResult>{const request=ProofObservationRequestSchema.parse(raw);if(request.providerId!==PROVIDER_ID)throw new Error("ros2_proof_provider_id_mismatch");const observedAt=new Date().toISOString();try{if(!["READ","OBSERVE","TOPIC_ECHO"].includes(request.operation.toUpperCase()))throw new Error("ros2_proof_operation_not_read_only");const id=parseTargetRef(request.targetRef),target=this.targets.get(id);if(!target)throw new Error("ros2_proof_target_not_configured");const command=verifyBinary(target),result=await run(target,command,request.timeoutMs);if(!result.started)throw new Error("ros2_proof_process_not_started");if(result.timedOut)throw new Error("ros2_proof_timeout");if(result.exitCode!==0)throw new Error(`ros2_proof_exit_${result.exitCode??"unknown"}`);const normalized=normalizeOutput(result.stdout);if(Buffer.byteLength(normalized)>target.maxStdoutBytes)throw new Error("ros2_proof_stdout_too_large");const sampleDigest=sha256(normalized),source=`ros2:${target.rosName}#${target.rosType}`,observation={kind:"ROS2_TOPIC_SAMPLE",source,observedAt,summary:`sample-sha256=${sampleDigest};bytes=${Buffer.byteLength(normalized)};stderr-sha256=${sha256(result.stderr)}`,digest:sampleDigest,confidence:1};const checks=request.expectedState.map(expected=>{if(expected==="nonempty")return normalized.length>0;if(expected==="empty")return normalized.length===0;if(expected.startsWith("stdout-sha256:"))return sampleDigest===expected.slice(14).toLowerCase();if(expected.startsWith("stdout-base64url:")){let wanted:string;try{wanted=Buffer.from(expected.slice(17),"base64url").toString("utf8")}catch{return null}return normalized===wanted}return null}),understood=checks.filter((x):x is boolean=>x!==null),allUnderstood=understood.length===checks.length,proposedOutcome=request.expectedState.length&&allUnderstood?(understood.every(Boolean)?"SUCCESS":"FAILURE"):undefined;return ProofProviderResultSchema.parse({provider:this.descriptor,requestId:request.requestId,observations:[observation],...(proposedOutcome?{proposedOutcome}:{}),conclusive:Boolean(proposedOutcome),authority:false,mayMintExecutionAuthority:false})}catch(error:any){return ProofProviderResultSchema.parse({provider:this.descriptor,requestId:request.requestId,observations:[],conclusive:false,error:String(error?.message??error).slice(0,1500),authority:false,mayMintExecutionAuthority:false})}}
}
