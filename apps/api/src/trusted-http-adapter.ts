import crypto from "node:crypto";
import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import {existsSync,readFileSync} from "node:fs";
import path from "node:path";
import {z} from "zod";
import type {FederatedTool} from "@cieav/contracts/execution-fabric";
import type {AdapterExecutionResult,CieavExecutionAdapter,ToolProtocol,TrustedDispatchContext} from "./execution-router.js";

const ScalarSchema=z.union([z.string().max(4000),z.number().finite(),z.boolean(),z.null()]);
const QueryValueSchema=z.union([ScalarSchema,z.array(ScalarSchema).max(100)]);
const TrustedHttpArgumentsSchema=z.object({body:z.unknown().optional(),query:z.record(QueryValueSchema).default({})}).strict();
const CredentialSchema=z.discriminatedUnion("kind",[
  z.object({kind:z.literal("NONE")}).strict(),
  z.object({kind:z.literal("BEARER_ENV"),env:z.string().regex(/^[A-Z][A-Z0-9_]{1,127}$/)}).strict(),
  z.object({kind:z.literal("HEADER_ENV"),header:z.string().regex(/^[A-Za-z0-9-]{1,80}$/),env:z.string().regex(/^[A-Z][A-Z0-9_]{1,127}$/)}).strict()
]);
export const TrustedHttpToolConfigSchema=z.object({
  toolId:z.string().min(1).max(240),protocol:z.enum(["HTTP","A2A","CLOUD_API"]),endpoint:z.string().url().max(2000),method:z.enum(["GET","POST","PUT","PATCH","DELETE"]),
  timeoutMs:z.number().int().min(500).max(30000).default(10000),maxResponseBytes:z.number().int().min(1024).max(1048576).default(65536),allowLoopback:z.boolean().default(false),
  staticHeaders:z.record(z.string().max(4000)).default({}),credential:CredentialSchema.default({kind:"NONE"}),successStatusMin:z.number().int().min(100).max(599).default(200),successStatusMax:z.number().int().min(100).max(599).default(299)
}).strict().superRefine((value,ctx)=>{if(value.successStatusMin>value.successStatusMax)ctx.addIssue({code:z.ZodIssueCode.custom,message:"successStatusMin must be <= successStatusMax"})});
export type TrustedHttpToolConfig=z.infer<typeof TrustedHttpToolConfigSchema>;
const CatalogSchema=z.object({version:z.literal(1),http:z.array(TrustedHttpToolConfigSchema).max(1000).default([])}).passthrough();
type Catalog=z.infer<typeof CatalogSchema>;
type ResolvedAddress={address:string;family:4|6};
const sha256=(value:Buffer|string)=>crypto.createHash("sha256").update(value).digest("hex");

function isLoopback(ip:string){if(net.isIP(ip)===4)return Number(ip.split(".")[0])===127;const x=ip.toLowerCase();return x==="::1"||x==="0:0:0:0:0:0:0:1"}
function forbiddenAddress(ip:string,allowLoopback:boolean){
  if(allowLoopback&&isLoopback(ip))return false;const family=net.isIP(ip);
  if(family===4){const [a,b]=ip.split(".").map(Number);if(a===0||a===10||a===127||a>=224)return true;if(a===100&&b>=64&&b<=127)return true;if(a===169&&b===254)return true;if(a===172&&b>=16&&b<=31)return true;if(a===192&&b===168)return true;if(a===198&&(b===18||b===19))return true;return false}
  if(family===6){const x=ip.toLowerCase();if(x==="::"||x==="::1"||x.startsWith("fc")||x.startsWith("fd")||x.startsWith("fe8")||x.startsWith("fe9")||x.startsWith("fea")||x.startsWith("feb")||x.startsWith("ff"))return true;if(x.startsWith("2001:db8:"))return true;const mapped=x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);return mapped?.[1]?forbiddenAddress(mapped[1],allowLoopback):false}
  return true;
}
async function resolvePinned(hostname:string,allowLoopback:boolean):Promise<ResolvedAddress>{
  if(net.isIP(hostname)){if(forbiddenAddress(hostname,allowLoopback))throw new Error("execution_adapter_destination_not_public");return{address:hostname,family:net.isIP(hostname) as 4|6}}
  const answers=await dns.lookup(hostname,{all:true,verbatim:true});if(!answers.length)throw new Error("execution_adapter_dns_no_addresses");if(answers.some(a=>forbiddenAddress(a.address,allowLoopback)))throw new Error("execution_adapter_dns_contains_non_public_address");const first=answers[0]!;return{address:first.address,family:first.family as 4|6};
}
function sanitizeStaticHeaders(headers:Record<string,string>){const forbidden=new Set(["host","content-length","connection","transfer-encoding","proxy-authorization","authorization","cookie","set-cookie"]),out:Record<string,string>={};for(const [raw,value] of Object.entries(headers)){const key=raw.toLowerCase();if(forbidden.has(key))throw new Error(`execution_adapter_forbidden_static_header:${key}`);out[key]=value}return out}
function credentialHeader(config:TrustedHttpToolConfig,env:NodeJS.ProcessEnv){if(config.credential.kind==="NONE")return{};const secret=env[config.credential.env];if(!secret)throw new Error(`execution_adapter_credential_missing:${config.toolId}`);if(config.credential.kind==="BEARER_ENV")return{authorization:`Bearer ${secret}`};const header=config.credential.header.toLowerCase();if(["host","content-length","connection","transfer-encoding","cookie"].includes(header))throw new Error("execution_adapter_credential_header_forbidden");return{[header]:secret}}
function appendQuery(url:URL,query:Record<string,z.infer<typeof QueryValueSchema>>){for(const key of Object.keys(query).sort()){const raw=query[key],items=Array.isArray(raw)?raw:[raw];for(const value of items)if(value!==null)url.searchParams.append(key,String(value))}}
function assertToolBinding(tool:FederatedTool,config:TrustedHttpToolConfig){if(tool.id!==config.toolId||tool.protocol!==config.protocol)throw new Error("execution_adapter_tool_binding_mismatch");const configured=new URL(config.endpoint),registered=new URL(tool.downstreamRef);if(configured.href!==registered.href)throw new Error("execution_adapter_registered_endpoint_mismatch");if(tool.credentialMode==="NONE"&&config.credential.kind!=="NONE")throw new Error("execution_adapter_unexpected_credential");if(tool.credentialMode==="CIEAV_INJECTED"&&config.credential.kind==="NONE")throw new Error("execution_adapter_injected_credential_required");if(!["NONE","CIEAV_INJECTED"].includes(tool.credentialMode))throw new Error(`execution_adapter_credential_mode_not_implemented:${tool.credentialMode}`)}
function catalogPath(stateDir:string,env:NodeJS.ProcessEnv){const configured=env.CIEAV_EXECUTION_ADAPTERS_FILE?.trim();return{file:configured?path.resolve(configured):path.join(stateDir,"execution-adapters.json"),required:Boolean(configured)}}
function loadCatalogSync(stateDir:string,env:NodeJS.ProcessEnv):Catalog|null{const {file,required}=catalogPath(stateDir,env);if(!existsSync(file)){if(required)throw new Error(`CIEAV execution adapter catalog is unavailable: ${file}`);return null}try{return CatalogSchema.parse(JSON.parse(readFileSync(file,"utf8")))}catch(err:any){throw new Error(`CIEAV execution adapter catalog is invalid: ${String(err?.message??err)}`)}}

export class HardenedHttpFamilyAdapter implements CieavExecutionAdapter{
  readonly protocol:ToolProtocol;private readonly configs=new Map<string,TrustedHttpToolConfig>();
  constructor(protocol:"HTTP"|"A2A"|"CLOUD_API",configs:TrustedHttpToolConfig[],private readonly env:NodeJS.ProcessEnv=process.env){this.protocol=protocol;for(const raw of configs){const c=TrustedHttpToolConfigSchema.parse(raw);if(c.protocol!==protocol)throw new Error("execution_adapter_protocol_config_mismatch");if(this.configs.has(c.toolId))throw new Error(`execution_adapter_duplicate_tool:${c.toolId}`);sanitizeStaticHeaders(c.staticHeaders);credentialHeader(c,env);this.configs.set(c.toolId,c)}}
  toolIds(){return[...this.configs.keys()].sort()}
  private config(context:TrustedDispatchContext){const c=this.configs.get(context.tool.id);if(!c)throw new Error(`execution_adapter_tool_not_configured:${context.tool.id}`);assertToolBinding(context.tool,c);return c}
  async preflight(context:TrustedDispatchContext){const config=this.config(context),args=TrustedHttpArgumentsSchema.parse(context.normalizedArguments),target=new URL(config.endpoint);if(target.username||target.password)throw new Error("execution_adapter_url_userinfo_forbidden");if(target.protocol!=="https:"&&!(config.allowLoopback&&target.protocol==="http:"))throw new Error("execution_adapter_https_required");if(args.body!==undefined&&config.method==="GET")throw new Error("execution_adapter_get_body_forbidden");credentialHeader(config,this.env);const resolved=await resolvePinned(target.hostname,config.allowLoopback);if(target.protocol==="http:"&&!isLoopback(resolved.address))throw new Error("execution_adapter_cleartext_non_loopback_forbidden")}
  async execute(context:TrustedDispatchContext):Promise<AdapterExecutionResult>{
    const config=this.config(context),args=TrustedHttpArgumentsSchema.parse(context.normalizedArguments),target=new URL(config.endpoint);appendQuery(target,args.query);const resolved=await resolvePinned(target.hostname,config.allowLoopback);const staticHeaders=sanitizeStaticHeaders(config.staticHeaders),credentials=credentialHeader(config,this.env),headers:Record<string,string>={accept:"application/json",...staticHeaders,...credentials};let payload:Buffer|undefined;if(args.body!==undefined){payload=Buffer.from(JSON.stringify(args.body));headers["content-type"]="application/json";headers["content-length"]=String(payload.length)}
    const attemptedAt=new Date().toISOString(),result=await new Promise<{statusCode:number;headers:http.IncomingHttpHeaders;body:Buffer}>((resolve,reject)=>{const requestFn=target.protocol==="https:"?https.request:http.request;const req=requestFn(target,{method:config.method,headers,timeout:config.timeoutMs,lookup:((_hostname:any,_options:any,callback:any)=>callback(null,resolved.address,resolved.family)) as any},res=>{const chunks:Buffer[]=[];let size=0,done=false;const fail=(error:Error)=>{if(done)return;done=true;res.destroy();reject(error)};const declared=Number(res.headers["content-length"]??0);if(Number.isFinite(declared)&&declared>config.maxResponseBytes)return fail(new Error("execution_adapter_response_too_large"));res.on("data",chunk=>{if(done)return;const b=Buffer.from(chunk);size+=b.length;if(size>config.maxResponseBytes)return fail(new Error("execution_adapter_response_too_large"));chunks.push(b)});res.on("end",()=>{if(done)return;done=true;resolve({statusCode:res.statusCode??0,headers:res.headers,body:Buffer.concat(chunks)})});res.on("error",fail)});req.on("timeout",()=>req.destroy(new Error("execution_adapter_timeout")));req.on("error",reject);if(payload)req.write(payload);req.end()});
    const responseDigest=sha256(result.body),status=result.statusCode,redirect=status>=300&&status<400,accepted=!redirect&&status>=config.successStatusMin&&status<=config.successStatusMax,requestId=["x-request-id","request-id","x-correlation-id","trace-id"].map(k=>result.headers[k]).find(v=>typeof v==="string") as string|undefined,externalRef=requestId?.slice(0,300),contentType=typeof result.headers["content-type"]==="string"?result.headers["content-type"].slice(0,200):undefined;
    return{attemptedAt,transport:accepted?"ACCEPTED":"REJECTED",...(externalRef?{externalRef}:{}),evidenceSeeds:[{kind:"HTTP_RESPONSE",source:`cieav:${this.protocol.toLowerCase()}-adapter`,summary:`Downstream ${this.protocol} transport returned HTTP ${status}; body digest ${responseDigest}.`,...(externalRef?{externalRef}:{})}],metadata:{statusCode:status,responseDigest,responseBytes:result.body.length,redirectBlocked:redirect,...(contentType?{contentType}:{})}};
  }
}
export function loadTrustedHttpFamilyAdaptersSync(stateDir:string,env:NodeJS.ProcessEnv=process.env):CieavExecutionAdapter[]{const catalog=loadCatalogSync(stateDir,env);if(!catalog)return[];const byProtocol=new Map<"HTTP"|"A2A"|"CLOUD_API",TrustedHttpToolConfig[]>();for(const config of catalog.http){const list=byProtocol.get(config.protocol)??[];list.push(config);byProtocol.set(config.protocol,list)}return([...byProtocol.entries()] as Array<["HTTP"|"A2A"|"CLOUD_API",TrustedHttpToolConfig[]]>).map(([protocol,configs])=>new HardenedHttpFamilyAdapter(protocol,configs,env))}
