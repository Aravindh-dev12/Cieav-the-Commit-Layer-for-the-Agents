import crypto from "node:crypto";
import {chmod,mkdir,open,readFile,rename,writeFile} from "node:fs/promises";
import path from "node:path";
import {ReversibilityEscrowSchema,ReversibilityEscrowReserveRequestSchema,type ReversibilityEscrow} from "@cieav/contracts/reversibility-escrow";
import {activateReversibilityEscrow,consumeReversibilityEscrow,expireReversibilityEscrow,reserveReversibilityEscrow} from "@cieav/core/reversibility-escrow";
import {canonicalIntentReality} from "@cieav/core/intent-reality";
import type {EffectDescriptor} from "@cieav/contracts/reality";

type Payload={version:1;escrows:ReversibilityEscrow[]};
type Envelope={payload:Payload;mac:string};
const scoped=(scopeDeviceId:string,id:string)=>`${scopeDeviceId}\u0000${id}`;
async function durableReplace(file:string,contents:string){const dir=path.dirname(file),tmp=`${file}.${process.pid}.${crypto.randomUUID()}.tmp`;await writeFile(tmp,contents,{encoding:"utf8",mode:0o600,flag:"wx"});const fh=await open(tmp,"r");try{await fh.sync()}finally{await fh.close()}await rename(tmp,file);try{await chmod(file,0o600)}catch{}if(process.platform!=="win32")try{const dh=await open(dir,"r");try{await dh.sync()}finally{await dh.close()}}catch{}}

export class CieavReversibilityEscrowStore{
  private loaded=false;private escrows=new Map<string,ReversibilityEscrow>();private chain:Promise<void>=Promise.resolve();
  constructor(private readonly file:string,private readonly secret:string){if(secret.length<32)throw new Error("CIEAV reversibility-escrow secret is too weak")}
  private mac(payload:Payload){return crypto.createHmac("sha256",this.secret).update(canonicalIntentReality(payload)).digest("base64url")}
  private enqueue<T>(fn:()=>Promise<T>):Promise<T>{const work=this.chain.then(fn,fn);this.chain=work.then(()=>undefined,()=>undefined);return work}
  private async load(){if(this.loaded)return;await mkdir(path.dirname(this.file),{recursive:true,mode:0o700});try{const env=JSON.parse(await readFile(this.file,"utf8")) as Envelope;if(env?.payload?.version!==1||!Array.isArray(env.payload.escrows)||typeof env.mac!=="string")throw new Error("invalid envelope");const expected=this.mac(env.payload);if(expected.length!==env.mac.length||!crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(env.mac)))throw new Error("integrity check failed");for(const raw of env.payload.escrows){const value=ReversibilityEscrowSchema.parse(raw);this.escrows.set(scoped(value.scopeDeviceId,value.id),value)}}catch(err:any){if(err?.code!=="ENOENT")throw new Error(`CIEAV reversibility escrow store is unreadable, corrupt, or unauthenticated: ${String(err?.message??err)}`)}this.loaded=true}
  private async persist(){const escrows=[...this.escrows.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,50_000),payload:Payload={version:1,escrows},env:Envelope={payload,mac:this.mac(payload)};await durableReplace(this.file,JSON.stringify(env,null,2)+"\n");this.escrows=new Map(escrows.map(x=>[scoped(x.scopeDeviceId,x.id),x]))}
  reserve(raw:unknown){return this.enqueue(async()=>{await this.load();const input=ReversibilityEscrowReserveRequestSchema.parse(raw),value=reserveReversibilityEscrow(input);this.escrows.set(scoped(value.scopeDeviceId,value.id),value);await this.persist();return value})}
  get(scopeDeviceId:string,id:string){return this.enqueue(async()=>{await this.load();return this.escrows.get(scoped(scopeDeviceId,id))??null})}
  list(scopeDeviceId?:string){return this.enqueue(async()=>{await this.load();return[...this.escrows.values()].filter(x=>!scopeDeviceId||x.scopeDeviceId===scopeDeviceId)})}
  activateForTask(scopeDeviceId:string,taskId:string,proofCaseId:string){return this.enqueue(async()=>{await this.load();const changed:ReversibilityEscrow[]=[];for(const [key,current] of this.escrows){if(current.scopeDeviceId!==scopeDeviceId||current.taskId!==taskId||current.state!=="RESERVED")continue;const value=activateReversibilityEscrow(current,proofCaseId);this.escrows.set(key,value);changed.push(value)}if(changed.length)await this.persist();return changed})}
  consume(scopeDeviceId:string,id:string,inverseEffect:EffectDescriptor){return this.enqueue(async()=>{await this.load();const key=scoped(scopeDeviceId,id),current=this.escrows.get(key);if(!current)return null;const value=consumeReversibilityEscrow(current,inverseEffect);this.escrows.set(key,value);await this.persist();return value})}
  cancel(scopeDeviceId:string,id:string){return this.enqueue(async()=>{await this.load();const key=scoped(scopeDeviceId,id),current=this.escrows.get(key);if(!current)return null;if(!["RESERVED","ACTIVATED"].includes(current.state))return current;const value=ReversibilityEscrowSchema.parse({...current,state:"CANCELLED",cancelledAt:new Date().toISOString()});this.escrows.set(key,value);await this.persist();return value})}
  recoverOnStartup(){return this.enqueue(async()=>{await this.load();let changed=0;for(const [key,current] of this.escrows){const value=expireReversibilityEscrow(current);if(value.state!==current.state){this.escrows.set(key,value);changed++}}if(changed)await this.persist();return changed})}
  async close(){await this.chain}
}
