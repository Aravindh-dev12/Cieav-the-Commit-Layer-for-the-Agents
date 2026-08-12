import crypto from "node:crypto";
import {chmod,mkdir,readFile,rename,writeFile} from "node:fs/promises";
import path from "node:path";
import type {IncomingMessage} from "node:http";
import {ActionManifestSchema} from "@latch/contracts";
import {IntentContractSchema,IntentCreateRequestSchema,OpenLoopCreateRequestSchema,OpenLoopSchema,OpenLoopUpdateRequestSchema,RealityEvaluateRequestSchema,CommitPermitSchema,ActionProposalSchema,type IntentContract,type OpenLoop} from "@latch/contracts/reality";
import {assessConsequences,createIntentContract,evaluateAuthority,issueCommitPermit,proposalFromManifest,verifyCommitPermit} from "@latch/core/reality";

const MAX_BODY=256000,MAX_INTENTS=5000,MAX_LOOPS=10000,MAX_CONSUMED=20000;
const canonical=(v:unknown):string=>Array.isArray(v)?`[${v.map(canonical).join(",")}]`:v&&typeof v==="object"?`{${Object.keys(v as Record<string,unknown>).sort().map(k=>`${JSON.stringify(k)}:${canonical((v as Record<string,unknown>)[k])}`).join(",")}}`:JSON.stringify(v);
async function parseBody(req:IncomingMessage){const chunks:Buffer[]=[];let size=0;for await(const c of req){const b=Buffer.from(c);size+=b.length;if(size>MAX_BODY)throw new Error("body_too_large");chunks.push(b)}return chunks.length?JSON.parse(Buffer.concat(chunks).toString("utf8")):{};}

type ScopedIntent={deviceId:string;value:IntentContract};type ScopedLoop={deviceId:string;value:OpenLoop};type ConsumedPermit={deviceId:string;id:string;consumedAt:string};
type Persisted={version:1;intents:ScopedIntent[];openLoops:ScopedLoop[];consumedPermits:ConsumedPermit[]};type Envelope={payload:Persisted;mac:string};
const key=(deviceId:string,id:string)=>`${deviceId}\u0000${id}`;
export class CieavRealityStore{
  private loaded=false;private intents=new Map<string,ScopedIntent>();private loops=new Map<string,ScopedLoop>();private consumed=new Map<string,ConsumedPermit>();private chain:Promise<void>=Promise.resolve();
  constructor(private readonly file:string,private readonly secret:string){if(secret.length<32)throw new Error("CIEAV reality-store signing secret is too weak")}
  private mac(payload:Persisted){return crypto.createHmac("sha256",this.secret).update(canonical(payload)).digest("base64url")}
  private async load(){if(this.loaded)return;await mkdir(path.dirname(this.file),{recursive:true,mode:0o700});try{const env=JSON.parse(await readFile(this.file,"utf8")) as Envelope;if(!env?.payload||env.payload.version!==1||typeof env.mac!=="string")throw new Error("invalid envelope");const expected=this.mac(env.payload);if(expected.length!==env.mac.length||!crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(env.mac)))throw new Error("integrity check failed");for(const x of env.payload.intents){if(typeof x.deviceId!=="string")throw new Error("invalid intent scope");const value=IntentContractSchema.parse(x.value);this.intents.set(key(x.deviceId,value.id),{deviceId:x.deviceId,value})}for(const x of env.payload.openLoops){if(typeof x.deviceId!=="string")throw new Error("invalid open-loop scope");const value=OpenLoopSchema.parse(x.value);this.loops.set(key(x.deviceId,value.id),{deviceId:x.deviceId,value})}for(const x of env.payload.consumedPermits??[]){if(typeof x.deviceId==="string"&&typeof x.id==="string"&&typeof x.consumedAt==="string")this.consumed.set(key(x.deviceId,x.id),x)}}catch(e:any){if(e?.code!=="ENOENT")throw new Error(`CIEAV reality store is unreadable, corrupt, or unauthenticated: ${String(e?.message??e)}`)}this.loaded=true}
  private enqueue<T>(fn:()=>Promise<T>):Promise<T>{const t=this.chain.then(fn,fn);this.chain=t.then(()=>undefined,()=>undefined);return t}
  private async persist(){const intents=[...this.intents.values()].sort((a,b)=>b.value.createdAt.localeCompare(a.value.createdAt)).slice(0,MAX_INTENTS),openLoops=[...this.loops.values()].sort((a,b)=>b.value.createdAt.localeCompare(a.value.createdAt)).slice(0,MAX_LOOPS),consumedPermits=[...this.consumed.values()].sort((a,b)=>b.consumedAt.localeCompare(a.consumedAt)).slice(0,MAX_CONSUMED),payload:Persisted={version:1,intents,openLoops,consumedPermits},env:Envelope={payload,mac:this.mac(payload)},tmp=`${this.file}.${process.pid}.${crypto.randomUUID()}.tmp`;await writeFile(tmp,JSON.stringify(env,null,2)+"\n",{encoding:"utf8",mode:0o600,flag:"wx"});await rename(tmp,this.file);try{await chmod(this.file,0o600)}catch{}this.intents=new Map(intents.map(x=>[key(x.deviceId,x.value.id),x]));this.loops=new Map(openLoops.map(x=>[key(x.deviceId,x.value.id),x]));this.consumed=new Map(consumedPermits.map(x=>[key(x.deviceId,x.id),x]))}
  saveIntent(deviceId:string,value:IntentContract){return this.enqueue(async()=>{await this.load();this.intents.set(key(deviceId,value.id),{deviceId,value});await this.persist();return value})}
  getIntent(deviceId:string,id:string){return this.enqueue(async()=>{await this.load();return this.intents.get(key(deviceId,id))?.value??null})}
  listIntents(deviceId:string){return this.enqueue(async()=>{await this.load();return[...this.intents.values()].filter(x=>x.deviceId===deviceId).map(x=>x.value).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))})}
  saveLoop(deviceId:string,value:OpenLoop){return this.enqueue(async()=>{await this.load();this.loops.set(key(deviceId,value.id),{deviceId,value});await this.persist();return value})}
  getLoop(deviceId:string,id:string){return this.enqueue(async()=>{await this.load();return this.loops.get(key(deviceId,id))?.value??null})}
  listLoops(deviceId:string){return this.enqueue(async()=>{await this.load();return[...this.loops.values()].filter(x=>x.deviceId===deviceId).map(x=>x.value).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))})}
  consumePermit(deviceId:string,id:string){return this.enqueue(async()=>{await this.load();const k=key(deviceId,id);if(this.consumed.has(k))return false;this.consumed.set(k,{deviceId,id,consumedAt:new Date().toISOString()});await this.persist();return true})}
  async close(){await this.chain}
}

export type RealityRouteResult={status:number;body:unknown};
export class CieavRealityApi{
  readonly store:CieavRealityStore;
  constructor(file:string,private readonly permitSecret:string){this.store=new CieavRealityStore(file,permitSecret)}
  async handle(req:IncomingMessage,pathname:string,deviceId:string):Promise<RealityRouteResult|null>{
    if(req.method==="POST"&&pathname==="/v1/intents"){const input=IntentCreateRequestSchema.parse(await parseBody(req));return{status:201,body:{intent:await this.store.saveIntent(deviceId,createIntentContract(input))}}}
    if(req.method==="GET"&&pathname==="/v1/intents")return{status:200,body:{intents:await this.store.listIntents(deviceId)}};
    const intentMatch=pathname.match(/^\/v1\/intents\/([0-9a-f-]+)$/i);
    if(req.method==="GET"&&intentMatch?.[1]){const intent=await this.store.getIntent(deviceId,intentMatch[1]);return intent?{status:200,body:{intent}}:{status:404,body:{error:"not_found"}}}
    if(req.method==="POST"&&pathname==="/v1/reality/evaluate"){
      const raw=await parseBody(req),base=RealityEvaluateRequestSchema.parse(raw),manifest=ActionManifestSchema.parse((raw as any).manifest),intent=await this.store.getIntent(deviceId,base.intentId);if(!intent)return{status:404,body:{error:"intent_not_found"}};
      const proposal=proposalFromManifest(intent.id,base.actor,manifest,base.delegationChain,base.amount),assessment=assessConsequences(proposal),authority=evaluateAuthority(intent,proposal),humanApproved=(raw as any).humanApproved===true;
      const permit=(authority.decision==="ALLOW"||(authority.decision==="ASK"&&humanApproved))?issueCommitPermit(proposal,this.permitSecret,90):undefined;
      return{status:200,body:{intent,proposal,assessment,authority,...(permit?{permit}:{})}};
    }
    if(req.method==="POST"&&pathname==="/v1/reality/consume"){
      const raw=await parseBody(req),permit=CommitPermitSchema.parse((raw as any).permit),proposal=ActionProposalSchema.parse((raw as any).proposal);if(!await this.store.getIntent(deviceId,permit.intentId))return{status:404,body:{error:"intent_not_found"}};if(!verifyCommitPermit(permit,proposal,this.permitSecret))return{status:403,body:{error:"invalid_or_expired_permit"}};if(!await this.store.consumePermit(deviceId,permit.id))return{status:409,body:{error:"permit_already_consumed"}};return{status:200,body:{ok:true,permitId:permit.id,consumedAt:new Date().toISOString()}};
    }
    if(req.method==="POST"&&pathname==="/v1/open-loops"){const input=OpenLoopCreateRequestSchema.parse(await parseBody(req)),intent=await this.store.getIntent(deviceId,input.intentId);if(!intent)return{status:404,body:{error:"intent_not_found"}};const loop:OpenLoop=OpenLoopSchema.parse({id:crypto.randomUUID(),...input,status:"OPEN",createdAt:new Date().toISOString()});return{status:201,body:{openLoop:await this.store.saveLoop(deviceId,loop)}}}
    if(req.method==="GET"&&pathname==="/v1/open-loops")return{status:200,body:{openLoops:await this.store.listLoops(deviceId)}};
    const loopMatch=pathname.match(/^\/v1\/open-loops\/([0-9a-f-]+)$/i);
    if(req.method==="PATCH"&&loopMatch?.[1]){const current=await this.store.getLoop(deviceId,loopMatch[1]);if(!current)return{status:404,body:{error:"not_found"}};const patch=OpenLoopUpdateRequestSchema.parse(await parseBody(req)),next=OpenLoopSchema.parse({...current,...patch});return{status:200,body:{openLoop:await this.store.saveLoop(deviceId,next)}}}
    return null;
  }
}
