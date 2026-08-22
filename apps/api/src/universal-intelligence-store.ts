import crypto from "node:crypto";
import {chmod,copyFile,mkdir,open,readFile,rename,stat,writeFile} from "node:fs/promises";
import path from "node:path";
import {UniversalIntelligencePersistedStateSchema,type AuthorizedOutcomeTrajectory,type CognitiveCellDescriptor,type EpistemicClaim,type EpistemicEvidence,type UniversalIntelligencePersistedState,type WorkspaceContribution} from "@cieav/contracts";
import {UniversalIntelligenceRuntime,type CortexInput} from "@cieav/core";

type Envelope={payload:UniversalIntelligencePersistedState;mac:string};
const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value as Record<string,unknown>).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(",")}}`:JSON.stringify(value);

async function durableReplace(file:string,contents:string){const dir=path.dirname(file),tmp=`${file}.${process.pid}.${crypto.randomUUID()}.tmp`;await writeFile(tmp,contents,{encoding:"utf8",mode:0o600,flag:"wx"});const fh=await open(tmp,"r+");try{await fh.sync()}finally{await fh.close()}await rename(tmp,file);try{await chmod(file,0o600)}catch{}if(process.platform!=="win32")try{const dh=await open(dir,"r");try{await dh.sync()}finally{await dh.close()}}catch{}}

export class CieavUniversalIntelligenceStore{
  private loaded=false;private chain:Promise<void>=Promise.resolve();private runtimeInstance=new UniversalIntelligenceRuntime();private lastLoadedAt:string|null=null;private lastPersistedAt:string|null=null;private persistCount=0;
  get runtime(){return this.runtimeInstance}
  constructor(private readonly file:string,private readonly stateSecret:string){if(stateSecret.length<32)throw new Error("CIEAV universal-intelligence state secret is too weak")}
  private mac(payload:UniversalIntelligencePersistedState){return crypto.createHmac("sha256",this.stateSecret).update(canonical(payload)).digest("base64url")}
  private enqueue<T>(fn:()=>Promise<T>):Promise<T>{const task=this.chain.then(fn,fn);this.chain=task.then(()=>undefined,()=>undefined);return task}
  private parseEnvelope(raw:string):Envelope{const env=JSON.parse(raw) as Envelope;if(!env||typeof env.mac!=="string")throw new Error("invalid envelope");const payload=UniversalIntelligencePersistedStateSchema.parse(env.payload),expected=this.mac(payload);if(expected.length!==env.mac.length||!crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(env.mac)))throw new Error("integrity check failed");return{payload,mac:env.mac}}
  private serialize(payload:UniversalIntelligencePersistedState){const parsed=UniversalIntelligencePersistedStateSchema.parse(payload),env:Envelope={payload:parsed,mac:this.mac(parsed)};return JSON.stringify(env,null,2)+"\n"}
  private async load(){if(this.loaded)return;await mkdir(path.dirname(this.file),{recursive:true,mode:0o700});try{const env=this.parseEnvelope(await readFile(this.file,"utf8"));this.runtimeInstance.restorePersistedState(env.payload)}catch(err:any){if(err?.code!=="ENOENT")throw new Error(`CIEAV universal-intelligence store is unreadable, corrupt, or unauthenticated: ${String(err?.message??err)}`)}this.loaded=true;this.lastLoadedAt=new Date().toISOString()}
  private async persist(){const payload=this.runtimeInstance.exportPersistedState();await durableReplace(this.file,this.serialize(payload));this.lastPersistedAt=payload.updatedAt;this.persistCount++}

  snapshot(input:{now:string;privacy:"LOCAL_ONLY"|"REDACTED_REMOTE_ALLOWED"|"REMOTE_ALLOWED";staleAfterMs?:number}){return this.enqueue(async()=>{await this.load();return this.runtimeInstance.snapshot(input)})}
  listCells(){return this.enqueue(async()=>{await this.load();return this.runtimeInstance.cells.list()})}
  registerCell(cell:CognitiveCellDescriptor){return this.enqueue(async()=>{await this.load();const value=this.runtimeInstance.registerCell(cell);await this.persist();return value})}
  upsertCell(cell:CognitiveCellDescriptor){return this.enqueue(async()=>{await this.load();const value=this.runtimeInstance.upsertCell(cell);await this.persist();return value})}
  revokeCell(id:string,at:string){return this.enqueue(async()=>{await this.load();const value=this.runtimeInstance.cells.revoke(id,at);await this.persist();return value})}
  heartbeatCell(id:string,health:CognitiveCellDescriptor["health"],at:string){return this.enqueue(async()=>{await this.load();const value=this.runtimeInstance.cells.heartbeat(id,health,at);await this.persist();return value})}
  createWorkspace(input:{workspaceId:string;objective:string;createdAt:string;privacy:"LOCAL_ONLY"|"REDACTED_REMOTE_ALLOWED"|"REMOTE_ALLOWED"}){return this.enqueue(async()=>{await this.load();const value=this.runtimeInstance.createWorkspace(input);await this.persist();return value})}
  contribute(input:WorkspaceContribution){return this.enqueue(async()=>{await this.load();const value=this.runtimeInstance.contribute(input);await this.persist();return value})}
  plan(workspaceId:string,input:Omit<CortexInput,"objective"|"epistemicState">){return this.enqueue(async()=>{await this.load();return this.runtimeInstance.plan(workspaceId,input)})}
  upsertClaim(claim:EpistemicClaim){return this.enqueue(async()=>{await this.load();const value=this.runtimeInstance.upsertClaim(claim);await this.persist();return value})}
  addClaimEvidence(claimId:string,kind:"SUPPORT"|"CONTRADICT",evidence:EpistemicEvidence){return this.enqueue(async()=>{await this.load();const value=this.runtimeInstance.addClaimEvidence(claimId,kind,evidence);await this.persist();return value})}
  invalidateClaims(condition:string,observedAt:string){return this.enqueue(async()=>{await this.load();const value=this.runtimeInstance.invalidateClaims(condition,observedAt);if(value.length)await this.persist();return value})}
  ingestVerifiedExperience(trajectory:AuthorizedOutcomeTrajectory){return this.enqueue(async()=>{await this.load();const value=this.runtimeInstance.ingestVerifiedExperience(trajectory);await this.persist();return value})}
  exportState(){return this.enqueue(async()=>{await this.load();return this.runtimeInstance.exportPersistedState()})}

  backup(destination:string){return this.enqueue(async()=>{await this.load();await this.persist();const source=path.resolve(this.file),target=path.resolve(destination);if(source===target)throw new Error("backup_destination_must_differ_from_store");await mkdir(path.dirname(target),{recursive:true,mode:0o700});await copyFile(source,target);try{await chmod(target,0o600)}catch{}const validated=this.parseEnvelope(await readFile(target,"utf8"));return{ok:true,path:target,updatedAt:validated.payload.updatedAt,authority:false as const}})}
  restoreBackup(source:string){return this.enqueue(async()=>{await this.load();const raw=await readFile(path.resolve(source),"utf8"),validated=this.parseEnvelope(raw),replacement=new UniversalIntelligenceRuntime();replacement.restorePersistedState(validated.payload);await durableReplace(this.file,this.serialize(validated.payload));this.runtimeInstance=replacement;this.lastLoadedAt=new Date().toISOString();this.lastPersistedAt=validated.payload.updatedAt;return{ok:true,updatedAt:validated.payload.updatedAt,authority:false as const,mayMintExecutionAuthority:false as const}})}
  health(){return this.enqueue(async()=>{await this.load();let bytes=0;try{bytes=(await stat(this.file)).size}catch{}const state=this.runtimeInstance.exportPersistedState();return{ok:true,version:state.version,file:this.file,bytes,cells:state.cells.length,claims:state.claims.length,workspaces:state.workspaces.length,graphEdges:state.consequenceGraph.edges.length,lastLoadedAt:this.lastLoadedAt,lastPersistedAt:this.lastPersistedAt,persistCount:this.persistCount,authority:false as const,mayMintExecutionAuthority:false as const}})}
  async close(){await this.chain}
}
