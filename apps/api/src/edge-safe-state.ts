import crypto from "node:crypto";
import {spawn} from "node:child_process";
import {existsSync,readFileSync,realpathSync,statSync} from "node:fs";
import path from "node:path";
import {z} from "zod";

const DigestSchema=z.string().regex(/^[a-f0-9]{64}$/);
export const EdgeSafeStateHookSchema=z.object({
  deviceId:z.string().min(1).max(500),safeState:z.string().min(1).max(500),command:z.string().min(1).max(2000),commandSha256:DigestSchema,
  args:z.array(z.string().max(4000)).max(64).default([]),timeoutMs:z.number().int().min(100).max(10_000).default(2_000),staticEnv:z.record(z.string().max(16_000)).default({})
}).strict();
export type EdgeSafeStateHook=z.infer<typeof EdgeSafeStateHookSchema>;
const CatalogSchema=z.object({version:z.literal(1),edgeSafeState:z.array(EdgeSafeStateHookSchema).max(10_000).default([])}).passthrough();
const sha256=(value:Buffer|string)=>crypto.createHash("sha256").update(value).digest("hex");
const forbiddenEnv=new Set(["NODE_OPTIONS","NODE_PATH","LD_PRELOAD","LD_LIBRARY_PATH","DYLD_INSERT_LIBRARIES","DYLD_LIBRARY_PATH","PYTHONPATH","RUBYOPT","PERL5OPT","BASH_ENV","ENV","PROMPT_COMMAND"]);
function verifyCommand(hook:EdgeSafeStateHook){if(!path.isAbsolute(hook.command))throw new Error("edge_safe_state_command_must_be_absolute");const resolved=realpathSync(hook.command),stat=statSync(resolved);if(!stat.isFile())throw new Error("edge_safe_state_command_not_file");if(sha256(readFileSync(resolved))!==hook.commandSha256)throw new Error("edge_safe_state_command_digest_mismatch");return resolved}
function childEnv(hook:EdgeSafeStateHook){const env:Record<string,string>={};for(const[key,value]of Object.entries(hook.staticEnv)){if(forbiddenEnv.has(key.toUpperCase()))throw new Error(`edge_safe_state_forbidden_env:${key}`);env[key]=value}if(process.platform==="win32")for(const key of ["SystemRoot","WINDIR","TEMP","TMP"]){const value=process.env[key];if(value)env[key]=value}return env}

export class CieavEdgeSafeStateController{
  private readonly hooks=new Map<string,EdgeSafeStateHook>();
  constructor(hooks:EdgeSafeStateHook[]){for(const raw of hooks){const hook=EdgeSafeStateHookSchema.parse(raw),key=`${hook.deviceId}\n${hook.safeState}`;if(this.hooks.has(key))throw new Error("duplicate_edge_safe_state_hook");verifyCommand(hook);childEnv(hook);this.hooks.set(key,hook)}}
  configured(){return[...this.hooks.values()].map(x=>({deviceId:x.deviceId,safeState:x.safeState})).sort((a,b)=>`${a.deviceId}/${a.safeState}`.localeCompare(`${b.deviceId}/${b.safeState}`))}
  async trigger(deviceId:string,safeState:string,reason:string){const hook=this.hooks.get(`${deviceId}\n${safeState}`);if(!hook)throw new Error("edge_safe_state_hook_not_configured");const command=verifyCommand(hook),env=childEnv(hook),startedAt=new Date().toISOString();return await new Promise<{status:"EXECUTED";startedAt:string;completedAt:string;exitCode:0;reasonDigest:string}>((resolve,reject)=>{let settled=false,started=false;const child=spawn(command,hook.args,{shell:false,windowsHide:true,env,stdio:["ignore","ignore","ignore"]});const timer=setTimeout(()=>{try{child.kill("SIGKILL")}catch{};if(!settled){settled=true;reject(new Error("edge_safe_state_timeout"))}},hook.timeoutMs);timer.unref?.();child.once("spawn",()=>{started=true});child.once("error",err=>{if(!settled){settled=true;clearTimeout(timer);reject(new Error(`edge_safe_state_spawn_failed:${String(err?.message??err)}`))}});child.once("close",code=>{if(settled)return;settled=true;clearTimeout(timer);if(!started||code!==0)return reject(new Error(`edge_safe_state_failed:${code??-1}`));resolve({status:"EXECUTED",startedAt,completedAt:new Date().toISOString(),exitCode:0,reasonDigest:sha256(reason)})})})}
}
export function loadEdgeSafeStateControllerSync(stateDir:string,env:NodeJS.ProcessEnv=process.env){const configured=env.CIEAV_EXECUTION_ADAPTERS_FILE?.trim(),file=configured?path.resolve(configured):path.join(stateDir,"execution-adapters.json");if(!existsSync(file)){if(configured)throw new Error(`CIEAV safe-state catalog is unavailable: ${file}`);return new CieavEdgeSafeStateController([])}let catalog:z.infer<typeof CatalogSchema>;try{catalog=CatalogSchema.parse(JSON.parse(readFileSync(file,"utf8")))}catch(err:any){throw new Error(`CIEAV safe-state catalog is invalid: ${String(err?.message??err)}`)}return new CieavEdgeSafeStateController(catalog.edgeSafeState)}
