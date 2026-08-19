import crypto from "node:crypto";
import {existsSync,readFileSync,realpathSync,statSync} from "node:fs";
import path from "node:path";
import {z} from "zod";
import {Client} from "@modelcontextprotocol/client";
import {StdioClientTransport} from "@modelcontextprotocol/client/stdio";
import type {CieavExecutionAdapter,AdapterExecutionResult,TrustedDispatchContext} from "./execution-router.js";

const DigestSchema=z.string().regex(/^[0-9a-f]{64}$/);
const EnvNameSchema=z.string().regex(/^[A-Z][A-Z0-9_]{1,127}$/);
const ScalarJsonSchema:z.ZodType<unknown>=z.lazy(()=>z.union([z.string().max(100_000),z.number().finite(),z.boolean(),z.null(),z.array(ScalarJsonSchema).max(1000),z.record(ScalarJsonSchema)]));
const ToolArgumentsSchema=z.record(ScalarJsonSchema);

export const TrustedMcpStdioToolConfigSchema=z.object({
  toolId:z.string().min(1).max(240),
  serverId:z.string().regex(/^[A-Za-z0-9._-]{1,160}$/),
  downstreamToolName:z.string().min(1).max(240),
  command:z.string().min(1).max(2000),
  commandSha256:DigestSchema,
  args:z.array(z.string().max(4000)).max(100).default([]),
  cwd:z.string().max(2000).optional(),
  staticEnv:z.record(z.string().max(16_000)).default({}),
  envBindings:z.record(EnvNameSchema).default({}),
  timeoutMs:z.number().int().min(500).max(60_000).default(15_000),
  connectTimeoutMs:z.number().int().min(500).max(30_000).default(8_000),
  maxMessageBytes:z.number().int().min(4096).max(8*1024*1024).default(1024*1024),
  maxArgumentBytes:z.number().int().min(1024).max(1024*1024).default(256*1024),
  maxStderrBytes:z.number().int().min(1024).max(1024*1024).default(32*1024)
}).strict();
export type TrustedMcpStdioToolConfig=z.infer<typeof TrustedMcpStdioToolConfigSchema>;

const CatalogSchema=z.object({version:z.literal(1),mcpStdio:z.array(TrustedMcpStdioToolConfigSchema).max(1000).default([])}).passthrough();
type VerifiedConfig={config:TrustedMcpStdioToolConfig;resolvedCommand:string;commandDigest:string};
const sha256=(value:Buffer|string)=>crypto.createHash("sha256").update(value).digest("hex");
const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value as Record<string,unknown>).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(",")}}`:JSON.stringify(value)??"undefined";
const forbiddenEnv=new Set(["NODE_OPTIONS","NODE_PATH","LD_PRELOAD","LD_LIBRARY_PATH","DYLD_INSERT_LIBRARIES","DYLD_LIBRARY_PATH","PYTHONPATH","RUBYOPT","PERL5OPT","BASH_ENV","ENV","PROMPT_COMMAND"]);
export function mcpStdioDownstreamRef(serverId:string,toolName:string){return`mcp+stdio:${encodeURIComponent(serverId)}#${encodeURIComponent(toolName)}`}

function withTimeout<T>(promise:Promise<T>,ms:number,label:string):Promise<T>{
  let timer:NodeJS.Timeout|undefined;
  const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error(label)),ms);timer.unref?.()});
  return Promise.race([promise,timeout]).finally(()=>{if(timer)clearTimeout(timer)}) as Promise<T>;
}
function validateEnv(config:TrustedMcpStdioToolConfig,env:NodeJS.ProcessEnv){
  const child:Record<string,string>={};
  for(const [key,value] of Object.entries(config.staticEnv)){if(forbiddenEnv.has(key.toUpperCase()))throw new Error(`execution_mcp_forbidden_env:${key}`);child[key]=value}
  for(const [childName,parentName] of Object.entries(config.envBindings)){if(forbiddenEnv.has(childName.toUpperCase()))throw new Error(`execution_mcp_forbidden_env:${childName}`);const value=env[parentName];if(value===undefined||value==="")throw new Error(`execution_mcp_credential_missing:${config.toolId}:${parentName}`);child[childName]=value}
  return child;
}
function verifyBinary(config:TrustedMcpStdioToolConfig):VerifiedConfig{
  if(!path.isAbsolute(config.command))throw new Error("execution_mcp_command_must_be_absolute");
  const resolved=realpathSync(config.command),stat=statSync(resolved);if(!stat.isFile())throw new Error("execution_mcp_command_not_file");
  const actual=sha256(readFileSync(resolved));if(actual!==config.commandSha256)throw new Error("execution_mcp_command_digest_mismatch");
  if(config.cwd){if(!path.isAbsolute(config.cwd))throw new Error("execution_mcp_cwd_must_be_absolute");const cwd=realpathSync(config.cwd),s=statSync(cwd);if(!s.isDirectory())throw new Error("execution_mcp_cwd_not_directory")}
  return{config,resolvedCommand:resolved,commandDigest:actual};
}
function assertToolBinding(context:TrustedDispatchContext,config:TrustedMcpStdioToolConfig){
  if(context.tool.protocol!=="MCP"||context.tool.id!==config.toolId)throw new Error("execution_mcp_tool_binding_mismatch");
  if(context.tool.downstreamRef!==mcpStdioDownstreamRef(config.serverId,config.downstreamToolName))throw new Error("execution_mcp_downstream_ref_mismatch");
  if(context.tool.credentialMode!=="NONE"&&context.tool.credentialMode!=="CIEAV_INJECTED")throw new Error(`execution_mcp_credential_mode_not_implemented:${context.tool.credentialMode}`);
  if(context.tool.credentialMode==="CIEAV_INJECTED"&&Object.keys(config.envBindings).length===0)throw new Error("execution_mcp_injected_credential_required");
  const args=ToolArgumentsSchema.parse(context.normalizedArguments),bytes=Buffer.byteLength(canonical(args));if(bytes>config.maxArgumentBytes)throw new Error("execution_mcp_arguments_too_large");
  return args;
}
function resultDigest(value:unknown){return sha256(canonical(value))}

export class TrustedMcpStdioAdapter implements CieavExecutionAdapter{
  readonly protocol="MCP" as const;
  private readonly configs=new Map<string,TrustedMcpStdioToolConfig>();
  private readonly prepared=new Map<string,VerifiedConfig>();
  constructor(configs:TrustedMcpStdioToolConfig[],private readonly env:NodeJS.ProcessEnv=process.env){for(const raw of configs){const config=TrustedMcpStdioToolConfigSchema.parse(raw);if(this.configs.has(config.toolId))throw new Error(`execution_mcp_duplicate_tool:${config.toolId}`);validateEnv(config,env);this.configs.set(config.toolId,config)}}
  toolIds(){return[...this.configs.keys()].sort()}
  async preflight(context:TrustedDispatchContext){
    const config=this.configs.get(context.tool.id);if(!config)throw new Error(`execution_mcp_tool_not_configured:${context.tool.id}`);assertToolBinding(context,config);validateEnv(config,this.env);const verified=verifyBinary(config);this.prepared.set(context.ticket.id,verified);
  }
  async execute(context:TrustedDispatchContext):Promise<AdapterExecutionResult>{
    const prepared=this.prepared.get(context.ticket.id),config=prepared?.config??this.configs.get(context.tool.id);this.prepared.delete(context.ticket.id);if(!config)throw new Error(`execution_mcp_tool_not_configured:${context.tool.id}`);
    const args=assertToolBinding(context,config),verified=verifyBinary(config),childEnv=validateEnv(config,this.env);if(prepared&&(prepared.resolvedCommand!==verified.resolvedCommand||prepared.commandDigest!==verified.commandDigest))return{attemptedAt:new Date().toISOString(),transport:"REJECTED",evidenceSeeds:[{kind:"MCP_PREFLIGHT",source:"cieav:mcp-stdio-adapter",summary:"Trusted MCP executable changed after preflight; tool call was not sent."}],metadata:{serverId:config.serverId,downstreamTool:config.downstreamToolName,callSent:false}};
    const transport=new StdioClientTransport({command:verified.resolvedCommand,args:config.args,env:childEnv,stderr:"pipe",...(config.cwd?{cwd:realpathSync(config.cwd)}:{}),maxBufferSize:config.maxMessageBytes});
    const stderrHash=crypto.createHash("sha256");let stderrBytes=0;transport.stderr?.on("data",chunk=>{const b=Buffer.from(chunk);stderrBytes+=b.length;if(stderrBytes<=config.maxStderrBytes)stderrHash.update(b.subarray(0,Math.max(0,config.maxStderrBytes-(stderrBytes-b.length))))});
    const client=new Client({name:"cieav-trusted-execution",version:"0.8.0"});let callSent=false,connected=false;
    try{
      try{await withTimeout(client.connect(transport),config.connectTimeoutMs,"execution_mcp_connect_timeout");connected=true}catch(err:any){return{attemptedAt:new Date().toISOString(),transport:"REJECTED",evidenceSeeds:[{kind:"MCP_CONNECT",source:"cieav:mcp-stdio-adapter",summary:"Trusted MCP server could not be initialized; downstream tool call was not sent."}],metadata:{serverId:config.serverId,downstreamTool:config.downstreamToolName,callSent:false,errorDigest:resultDigest({name:String(err?.name??"Error"),message:String(err?.message??err).slice(0,500)})}}}
      let tools:any;try{tools=await withTimeout(client.listTools(),config.connectTimeoutMs,"execution_mcp_list_tools_timeout")}catch(err:any){return{attemptedAt:new Date().toISOString(),transport:"REJECTED",evidenceSeeds:[{kind:"MCP_DISCOVERY",source:"cieav:mcp-stdio-adapter",summary:"Trusted MCP tool discovery failed before the consequential tool call was sent."}],metadata:{serverId:config.serverId,downstreamTool:config.downstreamToolName,callSent:false,errorDigest:resultDigest({name:String(err?.name??"Error"),message:String(err?.message??err).slice(0,500)})}}}
      if(!Array.isArray(tools?.tools)||!tools.tools.some((tool:any)=>tool?.name===config.downstreamToolName))return{attemptedAt:new Date().toISOString(),transport:"REJECTED",evidenceSeeds:[{kind:"MCP_DISCOVERY",source:"cieav:mcp-stdio-adapter",summary:"Configured downstream MCP tool was not advertised; consequential call was not sent."}],metadata:{serverId:config.serverId,downstreamTool:config.downstreamToolName,callSent:false}};
      callSent=true;const attemptedAt=new Date().toISOString();
      try{
        const result=await client.callTool({name:config.downstreamToolName,arguments:args},{timeout:config.timeoutMs}),digest=resultDigest(result),isError=Boolean((result as any)?.isError);
        return{attemptedAt,transport:isError?"UNKNOWN":"ACCEPTED",evidenceSeeds:[{kind:"MCP_TOOL_RESULT",source:"cieav:mcp-stdio-adapter",summary:isError?`Downstream MCP tool returned isError after tools/call; consequence is unresolved until proof. Result digest ${digest}.`:`Downstream MCP tools/call returned without protocol error; result digest ${digest}. Independent proof is still required.`}],metadata:{serverId:config.serverId,downstreamTool:config.downstreamToolName,callSent:true,mcpResultDigest:digest,mcpIsError:isError,stderrBytes:Math.min(stderrBytes,config.maxStderrBytes)}};
      }catch(err:any){const digest=resultDigest({name:String(err?.name??"Error"),message:String(err?.message??err).slice(0,500)});return{attemptedAt,transport:"UNKNOWN",evidenceSeeds:[{kind:"MCP_TOOL_ERROR",source:"cieav:mcp-stdio-adapter",summary:`Downstream MCP tools/call outcome is indeterminate; error digest ${digest}.`}],metadata:{serverId:config.serverId,downstreamTool:config.downstreamToolName,callSent:true,errorDigest:digest,stderrBytes:Math.min(stderrBytes,config.maxStderrBytes)}}}
    }finally{if(connected||callSent)try{await client.close()}catch{}else try{await transport.close()}catch{}}
  }
}

export function loadTrustedMcpStdioAdaptersSync(stateDir:string,env:NodeJS.ProcessEnv=process.env):CieavExecutionAdapter[]{
  const configured=env.CIEAV_EXECUTION_ADAPTERS_FILE?.trim(),file=configured?path.resolve(configured):path.join(stateDir,"execution-adapters.json");if(!existsSync(file)){if(configured)throw new Error(`CIEAV execution adapter catalog is unavailable: ${file}`);return[]}
  let catalog:z.infer<typeof CatalogSchema>;try{catalog=CatalogSchema.parse(JSON.parse(readFileSync(file,"utf8")))}catch(err:any){throw new Error(`CIEAV MCP adapter catalog is invalid: ${String(err?.message??err)}`)}
  return catalog.mcpStdio.length?[new TrustedMcpStdioAdapter(catalog.mcpStdio,env)]:[];
}
