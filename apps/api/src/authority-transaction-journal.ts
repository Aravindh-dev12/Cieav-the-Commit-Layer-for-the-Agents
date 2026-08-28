import crypto from "node:crypto";
import {chmod,mkdir,open,readFile,rename,writeFile} from "node:fs/promises";
import path from "node:path";

export type AuthorityTransactionKind="ISSUE_TICKET"|"CONSUME_TICKET";
export type AuthorityTransactionStage="PREPARED"|"APPLIED"|"COMMITTED";

export type AuthorityTransactionEntry<T=unknown>={
  id:string;
  version:"CIEAV_AUTHORITY_TRANSACTION_V1";
  key:string;
  kind:AuthorityTransactionKind;
  stage:AuthorityTransactionStage;
  epoch:number;
  sequence:number;
  fenceToken:string;
  createdAt:string;
  updatedAt:string;
  payload:T;
  previousHash?:string;
  entryHash:string;
  authority:false;
  mayMintExecutionAuthority:false;
};

type JournalPayload={version:1;epoch:number;nextSequence:number;entries:AuthorityTransactionEntry[]};
type JournalEnvelope={payload:JournalPayload;mac:string};

const canonical=(value:unknown):string=>Array.isArray(value)
  ? `[${value.map(canonical).join(",")}]`
  : value&&typeof value==="object"
    ? `{${Object.keys(value as Record<string,unknown>).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(",")}}`
    : JSON.stringify(value)??"undefined";

const sha256=(value:unknown)=>crypto.createHash("sha256").update(canonical(value)).digest("hex");
const stageRank:Record<AuthorityTransactionStage,number>={PREPARED:0,APPLIED:1,COMMITTED:2};

async function durableReplace(file:string,contents:string){
  const dir=path.dirname(file),tmp=`${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await mkdir(dir,{recursive:true,mode:0o700});
  await writeFile(tmp,contents,{encoding:"utf8",mode:0o600,flag:"wx"});
  const fh=await open(tmp,"r+");
  try{await fh.sync()}finally{await fh.close()}
  await rename(tmp,file);
  try{await chmod(file,0o600)}catch{}
  if(process.platform!=="win32"){
    try{const dh=await open(dir,"r");try{await dh.sync()}finally{await dh.close()}}catch{}
  }
}

export class CieavAuthorityTransactionJournal{
  private loaded=false;
  private payload:JournalPayload={version:1,epoch:0,nextSequence:1,entries:[]};
  private chain:Promise<void>=Promise.resolve();
  private activeEpoch=0;

  constructor(private readonly file:string,private readonly secret:string){
    if(secret.length<32)throw new Error("CIEAV authority transaction journal secret is too weak");
  }

  private mac(payload:JournalPayload){return crypto.createHmac("sha256",this.secret).update(canonical(payload)).digest("base64url")}
  private enqueue<T>(fn:()=>Promise<T>):Promise<T>{const task=this.chain.then(fn,fn);this.chain=task.then(()=>undefined,()=>undefined);return task}

  private verifyChain(entries:AuthorityTransactionEntry[]){
    let previous:string|undefined;
    let lastSequence=0;
    for(const entry of entries){
      if(!Number.isSafeInteger(entry.epoch)||entry.epoch<1)throw new Error("authority transaction journal invalid epoch");
      if(!Number.isSafeInteger(entry.sequence)||entry.sequence<=lastSequence)throw new Error("authority transaction journal sequence is not strictly increasing");
      if(entry.previousHash!==previous)throw new Error("authority transaction journal previous hash mismatch");
      if(entry.authority!==false||entry.mayMintExecutionAuthority!==false)throw new Error("authority transaction journal violated zero-authority invariant");
      const {entryHash,...base}=entry;
      if(entry.entryHash!==sha256(base))throw new Error("authority transaction journal entry hash mismatch");
      if(entry.fenceToken!==`${entry.epoch}:${entry.sequence}`)throw new Error("authority transaction journal fencing token mismatch");
      previous=entry.entryHash;
      lastSequence=entry.sequence;
    }
  }

  private rechain(entries:AuthorityTransactionEntry[]){
    let previous:string|undefined;
    return entries.map(entry=>{
      const {entryHash:_,previousHash:__,...rest}=entry;
      const base={...rest,...(previous?{previousHash:previous}:{})};
      const next={...base,entryHash:sha256(base)} as AuthorityTransactionEntry;
      previous=next.entryHash;
      return next;
    });
  }

  private async persist(){
    this.payload.entries=this.rechain(this.payload.entries.slice(-10000));
    this.verifyChain(this.payload.entries);
    const env:JournalEnvelope={payload:this.payload,mac:this.mac(this.payload)};
    await durableReplace(this.file,JSON.stringify(env,null,2)+"\n");
  }

  private async load(){
    if(this.loaded)return;
    await mkdir(path.dirname(this.file),{recursive:true,mode:0o700});
    try{
      const env=JSON.parse(await readFile(this.file,"utf8")) as JournalEnvelope;
      if(env?.payload?.version!==1||!Array.isArray(env.payload.entries)||typeof env.mac!=="string")throw new Error("invalid envelope");
      const expected=this.mac(env.payload);
      if(expected.length!==env.mac.length||!crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(env.mac)))throw new Error("integrity check failed");
      this.verifyChain(env.payload.entries);
      const maxSequence=env.payload.entries.reduce((m,e)=>Math.max(m,e.sequence),0);
      if(!Number.isSafeInteger(env.payload.epoch)||env.payload.epoch<0)throw new Error("invalid journal epoch");
      if(!Number.isSafeInteger(env.payload.nextSequence)||env.payload.nextSequence<=maxSequence)throw new Error("invalid journal next sequence");
      this.payload={version:1,epoch:env.payload.epoch,nextSequence:env.payload.nextSequence,entries:env.payload.entries};
    }catch(error:any){
      if(error?.code!=="ENOENT")throw new Error(`CIEAV authority transaction journal is unreadable, corrupt, or unauthenticated: ${String(error?.message??error)}`);
    }
    this.loaded=true;
    this.payload.epoch+=1;
    this.activeEpoch=this.payload.epoch;
    await this.persist();
  }

  begin<T>(kind:AuthorityTransactionKind,key:string,payload:T){return this.enqueue(async()=>{
    await this.load();
    if(!key.trim()||key.length>500)throw new Error("authority transaction key is invalid");
    const existing=this.payload.entries.find(e=>e.key===key&&e.stage!=="COMMITTED");
    if(existing){
      if(existing.kind!==kind||canonical(existing.payload)!==canonical(payload))throw new Error("authority transaction key conflict");
      return existing as AuthorityTransactionEntry<T>;
    }
    const committed=this.payload.entries.find(e=>e.key===key&&e.stage==="COMMITTED");
    if(committed){
      if(committed.kind!==kind||canonical(committed.payload)!==canonical(payload))throw new Error("authority transaction committed key conflict");
      return committed as AuthorityTransactionEntry<T>;
    }
    const sequence=this.payload.nextSequence++;
    const now=new Date().toISOString();
    const base={id:crypto.randomUUID(),version:"CIEAV_AUTHORITY_TRANSACTION_V1" as const,key,kind,stage:"PREPARED" as const,epoch:this.activeEpoch,sequence,fenceToken:`${this.activeEpoch}:${sequence}`,createdAt:now,updatedAt:now,payload,authority:false as const,mayMintExecutionAuthority:false as const};
    const previousHash=this.payload.entries.at(-1)?.entryHash;
    const withPrevious={...base,...(previousHash?{previousHash}:{})};
    const entry={...withPrevious,entryHash:sha256(withPrevious)} as AuthorityTransactionEntry<T>;
    this.payload.entries.push(entry);
    await this.persist();
    return this.payload.entries.find(e=>e.id===entry.id)! as AuthorityTransactionEntry<T>;
  })}

  advance(id:string,stage:AuthorityTransactionStage){return this.enqueue(async()=>{
    await this.load();
    const index=this.payload.entries.findIndex(e=>e.id===id);
    if(index<0)throw new Error("authority transaction not found");
    const current=this.payload.entries[index]!;
    if(stageRank[stage]<stageRank[current.stage])throw new Error("authority transaction stage regression");
    if(stageRank[stage]===stageRank[current.stage])return current;
    this.payload.entries[index]={...current,stage,updatedAt:new Date().toISOString()};
    await this.persist();
    return this.payload.entries[index]!;
  })}

  pending(){return this.enqueue(async()=>{await this.load();return this.payload.entries.filter(e=>e.stage!=="COMMITTED").map(e=>structuredClone(e))})}
  entries(){return this.enqueue(async()=>{await this.load();return this.payload.entries.map(e=>structuredClone(e))})}
  health(){return this.enqueue(async()=>{await this.load();return{version:"CIEAV_AUTHORITY_TRANSACTION_JOURNAL_HEALTH_V1" as const,epoch:this.activeEpoch,nextSequence:this.payload.nextSequence,pending:this.payload.entries.filter(e=>e.stage!=="COMMITTED").length,entries:this.payload.entries.length,localFencingOnly:true,clusterHaQualified:false,authority:false as const,mayMintExecutionAuthority:false as const}})}
  async close(){await this.chain}
}
