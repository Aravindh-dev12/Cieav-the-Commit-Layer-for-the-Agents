import crypto from "node:crypto";
import {chmod,mkdir,readFile,rename,writeFile} from "node:fs/promises";
import path from "node:path";
import {ProofCaseCreateSchema,ProofCaseSchema,ProofObservationCreateSchema,type ProofCase,type ProofProvenance} from "@latch/contracts/proof";
import type {OpenLoop} from "@latch/contracts/reality";
import {evaluateProof} from "@latch/core/proof";
import type {CieavRealityApi} from "./reality-api.js";
import type {ReceiptStore} from "./store/types.js";

type ScopedProof={deviceId:string;value:ProofCase};type Payload={version:1;proofs:ScopedProof[]};type Envelope={payload:Payload;mac:string};
const key=(deviceId:string,id:string)=>`${deviceId}\u0000${id}`;
const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value as Record<string,unknown>).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(",")}}`:JSON.stringify(value);
export class CieavProofStore{
  private loaded=false;private proofs=new Map<string,ScopedProof>();private chain:Promise<void>=Promise.resolve();
  constructor(private readonly file:string,private readonly secret:string){if(secret.length<32)throw new Error("CIEAV proof-store signing secret is too weak")}
  private mac(payload:Payload){return crypto.createHmac("sha256",this.secret).update(canonical(payload)).digest("base64url")}
  private async load(){if(this.loaded)return;await mkdir(path.dirname(this.file),{recursive:true,mode:0o700});try{const env=JSON.parse(await readFile(this.file,"utf8")) as Envelope;if(env?.payload?.version!==1||!Array.isArray(env.payload.proofs)||typeof env.mac!=="string")throw new Error("invalid envelope");const expected=this.mac(env.payload);if(expected.length!==env.mac.length||!crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(env.mac)))throw new Error("integrity check failed");for(const item of env.payload.proofs){if(typeof item.deviceId!=="string")throw new Error("invalid proof scope");const value=ProofCaseSchema.parse(item.value);this.proofs.set(key(item.deviceId,value.id),{deviceId:item.deviceId,value})}}catch(err:any){if(err?.code!=="ENOENT")throw new Error(`CIEAV proof store is unreadable, corrupt, or unauthenticated: ${String(err?.message??err)}`)}this.loaded=true}
  private enqueue<T>(fn:()=>Promise<T>):Promise<T>{const task=this.chain.then(fn,fn);this.chain=task.then(()=>undefined,()=>undefined);return task}
  private async persist(){const values=[...this.proofs.values()].sort((a,b)=>b.value.updatedAt.localeCompare(a.value.updatedAt)).slice(0,10_000),payload:Payload={version:1,proofs:values},env:Envelope={payload,mac:this.mac(payload)},tmp=`${this.file}.${process.pid}.${crypto.randomUUID()}.tmp`;await writeFile(tmp,JSON.stringify(env,null,2)+"\n",{encoding:"utf8",mode:0o600,flag:"wx"});await rename(tmp,this.file);try{await chmod(this.file,0o600)}catch{}this.proofs=new Map(values.map(x=>[key(x.deviceId,x.value.id),x]))}
  save(deviceId:string,value:ProofCase){return this.enqueue(async()=>{await this.load();this.proofs.set(key(deviceId,value.id),{deviceId,value});await this.persist();return value})}
  get(deviceId:string,id:string){return this.enqueue(async()=>{await this.load();return this.proofs.get(key(deviceId,id))?.value??null})}
  list(deviceId:string){return this.enqueue(async()=>{await this.load();return[...this.proofs.values()].filter(x=>x.deviceId===deviceId).map(x=>x.value).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))})}
  async close(){await this.chain}
}

export class CieavProofApi{
  readonly store:CieavProofStore;
  constructor(file:string,secret:string,private readonly reality:CieavRealityApi,private readonly receipts:ReceiptStore){this.store=new CieavProofStore(file,secret)}
  async create(deviceId:string,raw:unknown){const input=ProofCaseCreateSchema.parse(raw);if(!await this.reality.store.getIntent(deviceId,input.intentId))throw new Error("proof_intent_not_found");if(input.receiptId&&!await this.receipts.get(deviceId,input.receiptId))throw new Error("proof_receipt_not_found");if(input.openLoopId){const loop=await this.reality.store.getLoop(deviceId,input.openLoopId);if(!loop)throw new Error("proof_open_loop_not_found");if(loop.intentId!==input.intentId)throw new Error("proof_open_loop_intent_mismatch")}const at=new Date().toISOString(),value=ProofCaseSchema.parse({id:crypto.randomUUID(),...input,observations:[],assessment:evaluateProof(input.plan,[]),createdAt:at,updatedAt:at});return this.store.save(deviceId,value)}
  async observe(deviceId:string,id:string,raw:unknown,provenance:ProofProvenance){const current=await this.store.get(deviceId,id);if(!current)throw new Error("proof_not_found");const input=ProofObservationCreateSchema.parse(raw),observation={id:crypto.randomUUID(),...input,observedAt:new Date().toISOString(),provenance},observations=[...current.observations,observation].slice(-200),assessment=evaluateProof(current.plan,observations),next=ProofCaseSchema.parse({...current,observations,assessment,updatedAt:new Date().toISOString()});await this.store.save(deviceId,next);let openLoop:OpenLoop|undefined;if(current.openLoopId){const loop=await this.reality.store.getLoop(deviceId,current.openLoopId);if(loop){if(assessment.status==="PROVEN")openLoop=await this.reality.store.saveLoop(deviceId,{...loop,status:"RESOLVED",lastCheckedAt:assessment.evaluatedAt,observedState:`Proof ${next.id} satisfied independent requirements.`,resolution:`CIEAV Proof Mesh settled the expected outcome with confidence ${assessment.confidence.toFixed(3)}.`});else if(assessment.status==="CONTRADICTED"||assessment.status==="FAILED")openLoop=await this.reality.store.saveLoop(deviceId,{...loop,status:"BREACHED",lastCheckedAt:assessment.evaluatedAt,observedState:`Proof ${next.id} contradicts the expected outcome.`});else openLoop=await this.reality.store.saveLoop(deviceId,{...loop,status:loop.status==="OPEN"?"WAITING":loop.status,lastCheckedAt:assessment.evaluatedAt,observedState:`Proof ${next.id} is ${assessment.status}.`})}}
    return{proof:next,...(openLoop?{openLoop}:{})};
  }
}
