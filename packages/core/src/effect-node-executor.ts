import {spawn} from "node:child_process";
import crypto from "node:crypto";
import {readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import type {EffectProposal,ToolDescriptor} from "@cieav/contracts";

export interface EffectNodeExecutionResult {ok:boolean;definitiveFailure?:boolean;result?:unknown;errorClass?:string;error?:string}
const MAX_OUTPUT=256_000;
const asObject=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("effect_input_object_required");return value as Record<string,unknown>};
const str=(v:unknown,name:string,max=4000)=>{if(typeof v!=="string"||!v||v.length>max)throw new Error(`invalid_${name}`);return v};
const stringArray=(v:unknown,name:string,maxItems=100,maxLen=2000)=>{if(v===undefined)return[];if(!Array.isArray(v)||v.length>maxItems||v.some(x=>typeof x!=="string"||x.length>maxLen))throw new Error(`invalid_${name}`);return v as string[]};
export const resolveUnderAllowedRoot=(candidate:string,roots:readonly string[])=>{const resolved=path.resolve(candidate);for(const root of roots){const base=path.resolve(root),rel=path.relative(base,resolved);if(rel===""||(!rel.startsWith("..")&&!path.isAbsolute(rel)))return resolved}throw new Error("effect_path_outside_allowed_roots")};
const safeEnv=()=>{const keep=["PATH","Path","PATHEXT","SystemRoot","WINDIR","TEMP","TMP","HOME","USERPROFILE","ComSpec"];const env:Record<string,string>={};for(const key of keep){const value=process.env[key];if(value)env[key]=value}return env};

async function runProcess(input:unknown,tool:ToolDescriptor):Promise<EffectNodeExecutionResult>{
  const obj=asObject(input),command=str(obj.command,"command",500),args=stringArray(obj.args,"args",100,2000);if(!tool.constraints.commands.includes(command))return{ok:false,definitiveFailure:true,errorClass:"command_not_allowed",error:"Requested command is not in the Effect Node capability allowlist."};
  let cwd:string|undefined;if(obj.cwd!==undefined)cwd=resolveUnderAllowedRoot(str(obj.cwd,"cwd",2000),tool.constraints.roots);
  const timeoutMs=Math.max(100,Math.min(tool.constraints.maxRuntimeMs??30_000,3_600_000));
  return new Promise(resolve=>{let stdout="",stderr="",finished=false,timedOut=false;const child=spawn(command,args,{cwd,shell:false,windowsHide:true,env:safeEnv(),stdio:["ignore","pipe","pipe"]});const timer=setTimeout(()=>{timedOut=true;child.kill("SIGKILL")},timeoutMs);const add=(current:string,chunk:Buffer)=>current.length>=MAX_OUTPUT?current:(current+chunk.toString("utf8")).slice(0,MAX_OUTPUT);child.stdout?.on("data",c=>stdout=add(stdout,Buffer.from(c)));child.stderr?.on("data",c=>stderr=add(stderr,Buffer.from(c)));child.once("error",error=>{if(finished)return;finished=true;clearTimeout(timer);resolve({ok:false,definitiveFailure:true,errorClass:"spawn_error",error:error.message})});child.once("close",(code,signal)=>{if(finished)return;finished=true;clearTimeout(timer);const result={exitCode:code,signal,stdout,stderr};if(timedOut)return resolve({ok:false,definitiveFailure:false,result,errorClass:"timeout",error:"Process exceeded the authorized runtime limit."});resolve(code===0?{ok:true,result}:{ok:false,definitiveFailure:true,result,errorClass:"nonzero_exit",error:`Process exited with code ${code}.`})})})
}
async function filesystemRead(input:unknown,tool:ToolDescriptor):Promise<EffectNodeExecutionResult>{const obj=asObject(input),file=resolveUnderAllowedRoot(str(obj.path,"path",2000),tool.constraints.roots),data=await readFile(file);if(data.length>1_000_000)return{ok:false,definitiveFailure:true,errorClass:"file_too_large",error:"File exceeds Effect Node read limit."};return{ok:true,result:{path:file,size:data.length,sha256:crypto.createHash("sha256").update(data).digest("hex"),text:data.toString("utf8")}}}
async function filesystemWrite(input:unknown,tool:ToolDescriptor):Promise<EffectNodeExecutionResult>{const obj=asObject(input),file=resolveUnderAllowedRoot(str(obj.path,"path",2000),tool.constraints.roots),content=str(obj.content,"content",1_000_000);await writeFile(file,content,{encoding:"utf8",flag:obj.overwrite===true?"w":"wx",mode:0o600});return{ok:true,result:{path:file,bytes:Buffer.byteLength(content)}}}

export async function executeEffectNodeTool(proposal:EffectProposal,tool:ToolDescriptor):Promise<EffectNodeExecutionResult>{
  if(tool.provider!=="EFFECT_NODE")return{ok:false,definitiveFailure:true,errorClass:"wrong_provider",error:"Effect Node executor only accepts EFFECT_NODE descriptors."};
  const kind=String(tool.metadata.capabilityKind??"");
  try{if(kind==="PROCESS"&&tool.sourceOperation==="run")return runProcess(proposal.input,tool);if(kind==="FILESYSTEM"&&tool.sourceOperation==="read")return filesystemRead(proposal.input,tool);if(kind==="FILESYSTEM"&&tool.sourceOperation==="write")return filesystemWrite(proposal.input,tool);return{ok:false,definitiveFailure:true,errorClass:"operation_not_supported",error:`Unsupported Effect Node operation ${kind}.${tool.sourceOperation}.`}}catch(error){return{ok:false,definitiveFailure:true,errorClass:"input_or_execution_error",error:error instanceof Error?error.message:String(error)}}
}
