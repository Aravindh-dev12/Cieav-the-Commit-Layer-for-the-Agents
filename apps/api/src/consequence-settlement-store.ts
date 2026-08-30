import crypto from "node:crypto";
import {chmod,mkdir,open,readFile,rename,writeFile} from "node:fs/promises";
import path from "node:path";
import {ConsequenceSettlementSchema,ConsequenceSettlementTransitionSchema,type ConsequenceRealityState,type ConsequenceSettlement,type ConsequenceSettlementTransition} from "@cieav/contracts";
import {createConsequenceSettlement,transitionConsequenceSettlement,verifyConsequenceSettlement,type ConsequenceSettlementPatch,type CreateConsequenceSettlementInput} from "@cieav/core/consequence-settlement";

const canonical=(value:unknown):string=>Array.isArray(value)
  ?`[${value.map(canonical).join(",")}]`
  :value&&typeof value==="object"
    ?`{${Object.keys(value as Record<string,unknown>).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(",")}}`
    :JSON.stringify(value)??"undefined";
const uniq=(values:string[])=>[...new Set(values)].sort();

async function durableReplace(file:string,contents:string){
  const dir=path.dirname(file),tmp=`${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await writeFile(tmp,contents,{encoding:"utf8",mode:0o600,flag:"wx"});
  const fh=await open(tmp,"r+");try{await fh.sync()}finally{await fh.close()}
  await rename(tmp,file);try{await chmod(file,0o600)}catch{}
  if(process.platform!=="win32")try{const dh=await open(dir,"r");try{await dh.sync()}finally{await dh.close()}}catch{}
}

type Payload={version:1;history:ConsequenceSettlement[];transitions:ConsequenceSettlementTransition[]};
type Envelope={payload:Payload;mac:string};
const empty=():Payload=>({version:1,history:[],transitions:[]});
export type ExecutionTransportSettlement="ACCEPTED"|"REJECTED"|"UNKNOWN";

export class CieavConsequenceSettlementStore{
  private loaded=false;
  private payload:Payload=empty();
  private chain:Promise<void>=Promise.resolve();
  constructor(private readonly file:string,private readonly secret:string){if(secret.length<32)throw new Error("CIEAV consequence-settlement state secret is too weak")}
  private mac(payload:Payload){return crypto.createHmac("sha256",this.secret).update(canonical(payload)).digest("base64url")}
  private enqueue<T>(fn:()=>Promise<T>):Promise<T>{const task=this.chain.then(fn,fn);this.chain=task.then(()=>undefined,()=>undefined);return task}
  private verifyPayload(payload:Payload){
    const history=payload.history.map(value=>ConsequenceSettlementSchema.parse(value)),transitions=payload.transitions.map(value=>ConsequenceSettlementTransitionSchema.parse(value));
    for(const settlement of history)if(!verifyConsequenceSettlement(settlement))throw new Error(`consequence_settlement_integrity_mismatch:${settlement.consequenceRef}`);
    const byId=new Map<string,ConsequenceSettlement[]>();for(const settlement of history){const list=byId.get(settlement.id)??[];list.push(settlement);byId.set(settlement.id,list)}
    for(const [settlementId,snapshots] of byId){
      for(let i=1;i<snapshots.length;i++){const previous=snapshots[i-1]!,next=snapshots[i]!,transition=transitions.find(t=>t.settlementRef===settlementId&&t.previousDigest===previous.settlementDigest&&t.nextDigest===next.settlementDigest);if(!transition)throw new Error(`consequence_settlement_transition_chain_missing:${settlementId}`)}
    }
    return{version:1 as const,history,transitions};
  }
  private async load(){if(this.loaded)return;await mkdir(path.dirname(this.file),{recursive:true,mode:0o700});try{const env=JSON.parse(await readFile(this.file,"utf8")) as Envelope;if(env?.payload?.version!==1||typeof env.mac!=="string")throw new Error("invalid envelope");const expected=this.mac(env.payload);if(expected.length!==env.mac.length||!crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(env.mac)))throw new Error("integrity check failed");this.payload=this.verifyPayload(env.payload)}catch(err:any){if(err?.code!=="ENOENT")throw new Error(`CIEAV consequence-settlement store is unreadable, corrupt, or unauthenticated: ${String(err?.message??err)}`)}this.loaded=true}
  private async persist(){const payload=this.verifyPayload({version:1,history:this.payload.history.slice(-250000),transitions:this.payload.transitions.slice(-250000)});await durableReplace(this.file,JSON.stringify({payload,mac:this.mac(payload)},null,2)+"\n");this.payload=payload}
  private latestUnsafe(consequenceRef:string){for(let i=this.payload.history.length-1;i>=0;i--){const settlement=this.payload.history[i]!;if(settlement.consequenceRef===consequenceRef)return settlement}return null}
  private listUnsafe(){const latest=new Map<string,ConsequenceSettlement>();for(const settlement of this.payload.history)latest.set(settlement.consequenceRef,settlement);return[...latest.values()].reverse()}

  create(input:CreateConsequenceSettlementInput){return this.enqueue(async()=>{await this.load();if(this.latestUnsafe(input.consequenceRef))throw new Error("consequence_settlement_already_exists");const settlement=createConsequenceSettlement(input);this.payload.history.push(settlement);await this.persist();return settlement})}
  get(consequenceRef:string){return this.enqueue(async()=>{await this.load();return this.latestUnsafe(consequenceRef)})}
  list(){return this.enqueue(async()=>{await this.load();return this.listUnsafe()})}
  history(consequenceRef:string){return this.enqueue(async()=>{await this.load();return this.payload.history.filter(value=>value.consequenceRef===consequenceRef)})}
  transitions(consequenceRef:string){return this.enqueue(async()=>{await this.load();return this.payload.transitions.filter(value=>value.consequenceRef===consequenceRef)})}
  update(consequenceRef:string,patch:ConsequenceSettlementPatch,reason:string,options:{trustedRealityReconciliation?:boolean;at?:Date}={}){return this.enqueue(async()=>{await this.load();const current=this.latestUnsafe(consequenceRef);if(!current)throw new Error("consequence_settlement_not_found");const result=transitionConsequenceSettlement(current,patch,reason,options);this.payload.history.push(result.settlement);this.payload.transitions.push(result.transition);await this.persist();return result})}

  recordExecutionTransport(consequenceRef:string,transport:ExecutionTransportSettlement,basisRefs:string[]=[],at=new Date()){
    return this.enqueue(async()=>{
      await this.load();const current=this.latestUnsafe(consequenceRef),executionState=transport==="ACCEPTED"?"DISPATCHED" as const:"INTERRUPTED" as const,evidenceRefs=uniq([`transport:${transport.toLowerCase()}`,...basisRefs]);
      if(!current){const settlement=createConsequenceSettlement({consequenceRef,executionState,realityState:"UNKNOWN",legitimacyState:"VALID",evidenceState:"AVAILABLE",recoveryState:"UNKNOWN",evidenceRefs,basisRefs,at});this.payload.history.push(settlement);await this.persist();return{settlement,changed:true as const}}
      if(current.realityState!=="UNKNOWN"||current.executionState==="COMPLETED"||current.executionState==="INTERRUPTED"&&executionState==="DISPATCHED")return{settlement:current,changed:false as const};
      const refs=uniq([...current.evidenceRefs,...evidenceRefs]),sameExecution=current.executionState===executionState,sameEvidence=refs.length===current.evidenceRefs.length&&refs.every((value,index)=>value===current.evidenceRefs[index]);if(sameExecution&&sameEvidence)return{settlement:current,changed:false as const};
      const result=transitionConsequenceSettlement(current,{executionState,evidenceState:"AVAILABLE",recoveryState:"UNKNOWN",evidenceRefs,basisRefs},`Execution transport reported ${transport}; physical outcome remains UNKNOWN pending independent observation.`,{at});this.payload.history.push(result.settlement);this.payload.transitions.push(result.transition);await this.persist();return{settlement:result.settlement,transition:result.transition,changed:true as const};
    })
  }

  recordRealityObservation(consequenceRef:string,realityState:Exclude<ConsequenceRealityState,"UNKNOWN">,evidenceRefs:string[],reason:string,at=new Date()){
    return this.enqueue(async()=>{
      await this.load();if(!evidenceRefs.length)throw new Error("consequence_settlement_observation_evidence_required");const current=this.latestUnsafe(consequenceRef),refs=uniq(evidenceRefs);
      if(!current){const settlement=createConsequenceSettlement({consequenceRef,executionState:"COMPLETED",realityState,legitimacyState:"UNKNOWN_VALIDITY",evidenceState:"VERIFIED",recoveryState:"NOT_REQUIRED",evidenceRefs:refs,observedAt:at.toISOString(),at});this.payload.history.push(settlement);await this.persist();return{settlement,changed:true as const}}
      if(current.realityState===realityState){const merged=uniq([...current.evidenceRefs,...refs]);if(merged.length===current.evidenceRefs.length)return{settlement:current,changed:false as const};const result=transitionConsequenceSettlement(current,{evidenceState:"VERIFIED",evidenceRefs:refs},reason,{at});this.payload.history.push(result.settlement);this.payload.transitions.push(result.transition);await this.persist();return{settlement:result.settlement,transition:result.transition,changed:true as const}}
      const result=transitionConsequenceSettlement(current,{executionState:"COMPLETED",realityState,evidenceState:"VERIFIED",recoveryState:"NOT_REQUIRED",evidenceRefs:refs,observedAt:at.toISOString()},reason,{trustedRealityReconciliation:true,at});this.payload.history.push(result.settlement);this.payload.transitions.push(result.transition);await this.persist();return{settlement:result.settlement,transition:result.transition,changed:true as const};
    })
  }

  recoverOnStartup(){return this.enqueue(async()=>{await this.load();this.payload=this.verifyPayload(this.payload);await this.persist();return{recovered:true,settlements:this.listUnsafe().length,snapshots:this.payload.history.length,transitions:this.payload.transitions.length}})}
  async close(){await this.chain}
}
