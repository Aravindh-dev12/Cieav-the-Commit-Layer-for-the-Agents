import crypto from "node:crypto";
import {chmod,mkdir,readFile,rename,writeFile} from "node:fs/promises";
import path from "node:path";
import {z} from "zod";
import {deviceIdFor,issueAgentToken,type AgentTokenPayload,type TokenRisk} from "./auth.js";

const RiskSchema=z.enum(["LOW","MEDIUM","HIGH","CRITICAL"]);
export const AgentSessionCreateSchema=z.object({
  installId:z.string().min(12).max(200),
  agent:z.object({id:z.string().min(1).max(240),displayName:z.string().min(1).max(240).optional(),provider:z.string().min(1).max(160).optional()}).strict(),
  allowedIntentIds:z.array(z.string().uuid()).min(1).max(100),
  allowedActionTypes:z.array(z.string().min(1).max(160)).min(1).max(100),
  maxRisk:RiskSchema.default("HIGH"),
  ttlSeconds:z.number().int().min(60).max(3600).default(900)
}).strict();
export type AgentSessionCreate=z.infer<typeof AgentSessionCreateSchema>;
export interface AgentSessionRecord{id:string;scopeDeviceId:string;agentId:string;agentName?:string;provider?:string;allowedIntentIds:string[];allowedActionTypes:string[];maxRisk:TokenRisk;createdAt:string;expiresAt:string;revokedAt?:string}
type Payload={version:1;sessions:AgentSessionRecord[]};type Envelope={payload:Payload;mac:string};
const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value as Record<string,unknown>).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(",")}}`:JSON.stringify(value);
export class CieavAgentSessionStore{
  private loaded=false;private sessions=new Map<string,AgentSessionRecord>();private chain:Promise<void>=Promise.resolve();
  constructor(private readonly file:string,private readonly stateSecret:string,private readonly jwtSecret:string){if(stateSecret.length<32||jwtSecret.length<32)throw new Error("CIEAV agent-session secrets are too weak")}
  private mac(payload:Payload){return crypto.createHmac("sha256",this.stateSecret).update(canonical(payload)).digest("base64url")}
  private async load(){if(this.loaded)return;await mkdir(path.dirname(this.file),{recursive:true,mode:0o700});try{const env=JSON.parse(await readFile(this.file,"utf8")) as Envelope;if(env?.payload?.version!==1||!Array.isArray(env.payload.sessions)||typeof env.mac!=="string")throw new Error("invalid envelope");const expected=this.mac(env.payload);if(expected.length!==env.mac.length||!crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(env.mac)))throw new Error("integrity check failed");for(const raw of env.payload.sessions){if(!raw?.id||!raw.scopeDeviceId||!raw.agentId||!Array.isArray(raw.allowedIntentIds)||!Array.isArray(raw.allowedActionTypes)||!["LOW","MEDIUM","HIGH","CRITICAL"].includes(raw.maxRisk))throw new Error("invalid session");this.sessions.set(raw.id,raw)}}catch(err:any){if(err?.code!=="ENOENT")throw new Error(`CIEAV agent-session store is unreadable, corrupt, or unauthenticated: ${String(err?.message??err)}`)}this.loaded=true}
  private enqueue<T>(fn:()=>Promise<T>):Promise<T>{const task=this.chain.then(fn,fn);this.chain=task.then(()=>undefined,()=>undefined);return task}
  private async persist(){const sessions=[...this.sessions.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,5000),payload:Payload={version:1,sessions},env:Envelope={payload,mac:this.mac(payload)},tmp=`${this.file}.${process.pid}.${crypto.randomUUID()}.tmp`;await writeFile(tmp,JSON.stringify(env,null,2)+"\n",{encoding:"utf8",mode:0o600,flag:"wx"});await rename(tmp,this.file);try{await chmod(this.file,0o600)}catch{}this.sessions=new Map(sessions.map(x=>[x.id,x]))}
  issue(raw:unknown){return this.enqueue(async()=>{await this.load();const input=AgentSessionCreateSchema.parse(raw),id=crypto.randomUUID(),created=new Date(),expires=new Date(created.getTime()+input.ttlSeconds*1000),record:AgentSessionRecord={id,scopeDeviceId:deviceIdFor(input.installId,this.jwtSecret),agentId:input.agent.id,...(input.agent.displayName?{agentName:input.agent.displayName}:{}),...(input.agent.provider?{provider:input.agent.provider}:{}),allowedIntentIds:[...new Set(input.allowedIntentIds)],allowedActionTypes:[...new Set(input.allowedActionTypes)],maxRisk:input.maxRisk,createdAt:created.toISOString(),expiresAt:expires.toISOString()};this.sessions.set(id,record);await this.persist();const issued=issueAgentToken({sub:`agt_${id}`,sessionId:id,scopeDeviceId:record.scopeDeviceId,agentId:record.agentId,...(record.agentName?{agentName:record.agentName}:{}),...(record.provider?{provider:record.provider}:{}),allowedIntentIds:record.allowedIntentIds,allowedActionTypes:record.allowedActionTypes,maxRisk:record.maxRisk},this.jwtSecret,input.ttlSeconds);return{session:record,token:issued.token,expiresAt:issued.expiresAt}})}
  list(){return this.enqueue(async()=>{await this.load();return[...this.sessions.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt))})}
  revoke(id:string){return this.enqueue(async()=>{await this.load();const current=this.sessions.get(id);if(!current)return null;if(current.revokedAt)return current;const next={...current,revokedAt:new Date().toISOString()};this.sessions.set(id,next);await this.persist();return next})}
  validate(payload:AgentTokenPayload){return this.enqueue(async()=>{await this.load();const record=this.sessions.get(payload.sessionId);if(!record||record.revokedAt||Date.parse(record.expiresAt)<=Date.now())return null;if(record.scopeDeviceId!==payload.scopeDeviceId||record.agentId!==payload.agentId||record.maxRisk!==payload.maxRisk)return null;if(record.allowedIntentIds.join("\u0000")!==payload.allowedIntentIds.join("\u0000")||record.allowedActionTypes.join("\u0000")!==payload.allowedActionTypes.join("\u0000"))return null;return record})}
  async close(){await this.chain}
}
