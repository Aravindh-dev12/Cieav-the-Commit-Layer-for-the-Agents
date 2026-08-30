import crypto from "node:crypto";
import {chmod,mkdir,open,readFile,rename,writeFile} from "node:fs/promises";
import path from "node:path";
import {
  CausalProvenanceLinkSchema,
  CausalRecallEventSchema,
  ConsequenceRecoveryCapabilitySchema,
  ConsequenceRecoveryClosureSchema,
  ConsequenceSettlementSchema,
  type CausalProvenanceLink,
  type CausalRecallEvent,
  type ConsequenceRecoveryCapability,
  type ConsequenceRecoveryClosure,
  type ConsequenceSettlement
} from "@cieav/contracts";
import {
  causalRecallDigest,
  computeConsequenceRecoveryClosure,
  verifyConsequenceRecoveryClosureDigest
} from "@cieav/core/causal-recall";

const canonical=(value:unknown):string=>Array.isArray(value)
  ?`[${value.map(canonical).join(",")}]`
  :value&&typeof value==="object"
    ?`{${Object.keys(value as Record<string,unknown>).sort().map(key=>`${JSON.stringify(key)}:${canonical((value as Record<string,unknown>)[key])}`).join(",")}}`
    :JSON.stringify(value)??"undefined";

async function durableReplace(file:string,contents:string){
  const dir=path.dirname(file),tmp=`${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await writeFile(tmp,contents,{encoding:"utf8",mode:0o600,flag:"wx"});
  const fh=await open(tmp,"r+");try{await fh.sync()}finally{await fh.close()}
  await rename(tmp,file);try{await chmod(file,0o600)}catch{}
  if(process.platform!=="win32")try{const dh=await open(dir,"r");try{await dh.sync()}finally{await dh.close()}}catch{}
}

type Payload={
  version:1;
  links:CausalProvenanceLink[];
  events:CausalRecallEvent[];
  closures:ConsequenceRecoveryClosure[];
};
type Envelope={payload:Payload;mac:string};
const empty=():Payload=>({version:1,links:[],events:[],closures:[]});

export class CieavCausalRecallStore{
  private loaded=false;
  private payload:Payload=empty();
  private chain:Promise<void>=Promise.resolve();

  constructor(private readonly file:string,private readonly secret:string){
    if(secret.length<32)throw new Error("CIEAV causal-recall state secret is too weak");
  }

  private mac(payload:Payload){return crypto.createHmac("sha256",this.secret).update(canonical(payload)).digest("base64url")}
  private enqueue<T>(fn:()=>Promise<T>):Promise<T>{const task=this.chain.then(fn,fn);this.chain=task.then(()=>undefined,()=>undefined);return task}
  private verifyLink(link:CausalProvenanceLink){
    const parsed=CausalProvenanceLinkSchema.parse(link),{id:_,basisDigest:__,...base}=parsed;
    if(causalRecallDigest(base)!==parsed.basisDigest)throw new Error(`causal_provenance_link_integrity_mismatch:${parsed.id}`);
  }
  private verifyEvent(event:CausalRecallEvent){
    const parsed=CausalRecallEventSchema.parse(event),{id:_,eventDigest:__,...base}=parsed;
    if(causalRecallDigest(base)!==parsed.eventDigest)throw new Error(`causal_recall_event_integrity_mismatch:${parsed.id}`);
  }
  private verifyAll(){
    for(const link of this.payload.links)this.verifyLink(link);
    for(const event of this.payload.events)this.verifyEvent(event);
    for(const closure of this.payload.closures)if(!verifyConsequenceRecoveryClosureDigest(closure))throw new Error(`consequence_recovery_closure_integrity_mismatch:${closure.id}`);
  }
  private async load(){
    if(this.loaded)return;
    await mkdir(path.dirname(this.file),{recursive:true,mode:0o700});
    try{
      const envelope=JSON.parse(await readFile(this.file,"utf8")) as Envelope;
      if(envelope?.payload?.version!==1||typeof envelope.mac!=="string")throw new Error("invalid envelope");
      const expected=this.mac(envelope.payload);
      if(expected.length!==envelope.mac.length||!crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(envelope.mac)))throw new Error("integrity check failed");
      this.payload={
        version:1,
        links:(envelope.payload.links??[]).map(value=>CausalProvenanceLinkSchema.parse(value)),
        events:(envelope.payload.events??[]).map(value=>CausalRecallEventSchema.parse(value)),
        closures:(envelope.payload.closures??[]).map(value=>ConsequenceRecoveryClosureSchema.parse(value))
      };
      this.verifyAll();
    }catch(error:any){if(error?.code!=="ENOENT")throw new Error(`CIEAV causal-recall store is unreadable, corrupt, or unauthenticated: ${String(error?.message??error)}`)}
    this.loaded=true;
  }
  private async persist(){this.verifyAll();const payload:Payload={...this.payload,version:1};await durableReplace(this.file,JSON.stringify({payload,mac:this.mac(payload)},null,2)+"\n");this.payload=payload}

  addLink(raw:unknown){return this.enqueue(async()=>{
    await this.load();const link=CausalProvenanceLinkSchema.parse(raw);this.verifyLink(link);
    if(this.payload.links.some(value=>value.id===link.id))throw new Error("causal_provenance_link_already_exists");
    const equivalent=this.payload.links.find(value=>value.basisDigest===link.basisDigest);if(equivalent)return equivalent;
    this.payload.links.push(link);await this.persist();return link;
  })}
  listLinks(){return this.enqueue(async()=>{await this.load();this.verifyAll();return this.payload.links.slice().reverse()})}
  listEvents(){return this.enqueue(async()=>{await this.load();this.verifyAll();return this.payload.events.slice().reverse()})}
  listClosures(){return this.enqueue(async()=>{await this.load();this.verifyAll();return this.payload.closures.slice().reverse()})}
  getClosure(recallEventRef:string){return this.enqueue(async()=>{await this.load();this.verifyAll();return this.payload.closures.findLast(value=>value.recallEventRef===recallEventRef)??null})}

  recordRecall(rawEvent:unknown,rawSettlements:unknown[]=[],rawCapabilities:unknown[]=[],at=new Date()){return this.enqueue(async()=>{
    await this.load();const event=CausalRecallEventSchema.parse(rawEvent);this.verifyEvent(event);
    if(this.payload.events.some(value=>value.id===event.id))throw new Error("causal_recall_event_already_exists");
    const settlements=rawSettlements.map(value=>ConsequenceSettlementSchema.parse(value)),capabilities=rawCapabilities.map(value=>ConsequenceRecoveryCapabilitySchema.parse(value));
    const closure=computeConsequenceRecoveryClosure(event,this.payload.links,settlements,capabilities,at);
    this.payload.events.push(event);this.payload.closures.push(closure);await this.persist();return{event,closure};
  })}

  recomputeClosure(recallEventRef:string,rawSettlements:unknown[]=[],rawCapabilities:unknown[]=[],at=new Date()){return this.enqueue(async()=>{
    await this.load();const event=this.payload.events.find(value=>value.id===recallEventRef);if(!event)throw new Error("causal_recall_event_not_found");
    const settlements=rawSettlements.map(value=>ConsequenceSettlementSchema.parse(value)),capabilities=rawCapabilities.map(value=>ConsequenceRecoveryCapabilitySchema.parse(value)),closure=computeConsequenceRecoveryClosure(event,this.payload.links,settlements,capabilities,at);
    this.payload.closures.push(closure);await this.persist();return closure;
  })}

  assertConsequenceNotRecallBlocked(consequenceRef:string){return this.enqueue(async()=>{
    await this.load();this.verifyAll();
    const latestByEvent=new Map<string,ConsequenceRecoveryClosure>();for(const closure of this.payload.closures)latestByEvent.set(closure.recallEventRef,closure);
    const blocker=[...latestByEvent.values()].find(closure=>closure.futureConsequencesToBlock.includes(consequenceRef));
    if(blocker)throw new Error(`consequence_blocked_by_causal_recall:${blocker.recallEventRef}`);
    return true;
  })}

  stats(){return this.enqueue(async()=>{await this.load();this.verifyAll();const latestByEvent=new Map<string,ConsequenceRecoveryClosure>();for(const closure of this.payload.closures)latestByEvent.set(closure.recallEventRef,closure);const latest=[...latestByEvent.values()];return{links:this.payload.links.length,events:this.payload.events.length,closures:this.payload.closures.length,blockedConsequences:new Set(latest.flatMap(value=>value.futureConsequencesToBlock)).size,recoveryPrograms:latest.reduce((sum,value)=>sum+value.proposedRecoveryPrograms.length,0)}})}
  async close(){await this.chain}
}
