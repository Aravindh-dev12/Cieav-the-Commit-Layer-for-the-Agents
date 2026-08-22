import crypto from "node:crypto";
import {chmod,mkdir,open,readFile,rename,writeFile} from "node:fs/promises";
import path from "node:path";
import {UniversalIntelligencePersistedStateSchema,type CognitiveCellDescriptor,type EpistemicClaim,type WorkspaceContribution,type UniversalIntelligencePersistedState,type AuthorizedOutcomeTrajectory} from "@cieav/contracts";
import {UniversalIntelligenceRuntime} from "@cieav/core";

type Envelope={payload:UniversalIntelligencePersistedState;mac:string};
const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value as Record<string,unknown>).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(",")}}`:JSON.stringify(value);

async function durableReplace(file:string,contents:string){
  const dir=path.dirname(file),tmp=`${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await writeFile(tmp,contents,{encoding:"utf8",mode:0o600,flag:"wx"});
  const fh=await open(tmp,"r+");try{await fh.sync()}finally{await fh.close()}
  await rename(tmp,file);try{await chmod(file,0o600)}catch{}
  if(process.platform!=="win32")try{const dh=await open(dir,"r");try{await dh.sync()}finally{await dh.close()}}catch{}
}

export class CieavUniversalIntelligenceStore{
  private loaded=false;
  private chain:Promise<void>=Promise.resolve();
  readonly runtime=new UniversalIntelligenceRuntime();

  constructor(private readonly file:string,private readonly stateSecret:string){
    if(stateSecret.length<32)throw new Error("CIEAV universal-intelligence state secret is too weak");
  }

  private mac(payload:UniversalIntelligencePersistedState){return crypto.createHmac("sha256",this.stateSecret).update(canonical(payload)).digest("base64url")}
  private enqueue<T>(fn:()=>Promise<T>):Promise<T>{const task=this.chain.then(fn,fn);this.chain=task.then(()=>undefined,()=>undefined);return task}

  private async load(){
    if(this.loaded)return;
    await mkdir(path.dirname(this.file),{recursive:true,mode:0o700});
    try{
      const env=JSON.parse(await readFile(this.file,"utf8")) as Envelope;
      if(!env||typeof env.mac!=="string")throw new Error("invalid envelope");
      const payload=UniversalIntelligencePersistedStateSchema.parse(env.payload);
      const expected=this.mac(payload);
      if(expected.length!==env.mac.length||!crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(env.mac)))throw new Error("integrity check failed");
      this.runtime.restorePersistedState(payload);
    }catch(err:any){if(err?.code!=="ENOENT")throw new Error(`CIEAV universal-intelligence store is unreadable, corrupt, or unauthenticated: ${String(err?.message??err)}`)}
    this.loaded=true;
  }

  private async persist(){
    const payload=UniversalIntelligencePersistedStateSchema.parse(this.runtime.exportPersistedState());
    const env:Envelope={payload,mac:this.mac(payload)};
    await durableReplace(this.file,JSON.stringify(env,null,2)+"\n");
  }

  snapshot(input:{now:string;privacy:"LOCAL_ONLY"|"REDACTED_REMOTE_ALLOWED"|"REMOTE_ALLOWED";staleAfterMs?:number}){return this.enqueue(async()=>{await this.load();return this.runtime.snapshot(input)})}
  listCells(){return this.enqueue(async()=>{await this.load();return this.runtime.cells.list()})}
  registerCell(cell:CognitiveCellDescriptor){return this.enqueue(async()=>{await this.load();const value=this.runtime.registerCell(cell);await this.persist();return value})}
  upsertCell(cell:CognitiveCellDescriptor){return this.enqueue(async()=>{await this.load();const value=this.runtime.upsertCell(cell);await this.persist();return value})}
  revokeCell(id:string,at:string){return this.enqueue(async()=>{await this.load();const value=this.runtime.cells.revoke(id,at);await this.persist();return value})}
  heartbeatCell(id:string,health:CognitiveCellDescriptor["health"],at:string){return this.enqueue(async()=>{await this.load();const value=this.runtime.cells.heartbeat(id,health,at);await this.persist();return value})}

  createWorkspace(input:{workspaceId:string;objective:string;createdAt:string;privacy:"LOCAL_ONLY"|"REDACTED_REMOTE_ALLOWED"|"REMOTE_ALLOWED"}){return this.enqueue(async()=>{await this.load();const value=this.runtime.createWorkspace(input);await this.persist();return value})}
  contribute(input:WorkspaceContribution){return this.enqueue(async()=>{await this.load();const value=this.runtime.contribute(input);await this.persist();return value})}
  plan(workspaceId:string,input:any){return this.enqueue(async()=>{await this.load();return this.runtime.plan(workspaceId,input)})}

  upsertClaim(claim:EpistemicClaim){return this.enqueue(async()=>{await this.load();const value=this.runtime.upsertClaim(claim);await this.persist();return value})}
  addClaimEvidence(claimId:string,kind:"SUPPORT"|"CONTRADICT",evidence:any){return this.enqueue(async()=>{await this.load();const value=this.runtime.addClaimEvidence(claimId,kind,evidence);await this.persist();return value})}
  invalidateClaims(condition:string,observedAt:string){return this.enqueue(async()=>{await this.load();const value=this.runtime.invalidateClaims(condition,observedAt);if(value.length)await this.persist();return value})}

  ingestVerifiedExperience(trajectory:AuthorizedOutcomeTrajectory){return this.enqueue(async()=>{await this.load();const value=this.runtime.ingestVerifiedExperience(trajectory);await this.persist();return value})}
  exportState(){return this.enqueue(async()=>{await this.load();return this.runtime.exportPersistedState()})}
  async close(){await this.chain}
}
