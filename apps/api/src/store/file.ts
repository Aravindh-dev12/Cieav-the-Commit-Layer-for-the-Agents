import {mkdir,readFile,rename,writeFile} from "node:fs/promises";
import path from "node:path";
import {ReceiptSchema,type Receipt} from "@latch/contracts";
import {signReceipt,verifyReceipt} from "../receipt.js";
import type {ReceiptStore} from "./types.js";

const MAX_RECEIPTS=10_000;

export class FileReceiptStore implements ReceiptStore {
  private receipts=new Map<string,Receipt>();
  private loaded=false;
  private chain:Promise<void>=Promise.resolve();
  constructor(private readonly file:string,private readonly signingSecret:string){}

  private async ensureLoaded(){
    if(this.loaded)return;
    await mkdir(path.dirname(this.file),{recursive:true,mode:0o700});
    try{
      const raw=JSON.parse(await readFile(this.file,"utf8"));
      if(!Array.isArray(raw))throw new Error("receipt store root must be an array");
      for(const item of raw){
        const parsed=ReceiptSchema.safeParse(item);
        if(!parsed.success)throw new Error(`invalid stored receipt: ${parsed.error.issues[0]?.message??"schema error"}`);
        if(!verifyReceipt(parsed.data,this.signingSecret))throw new Error(`receipt signature verification failed: ${parsed.data.id}`);
        this.receipts.set(parsed.data.id,parsed.data);
      }
    }catch(err:any){
      if(err?.code!=="ENOENT")throw new Error(`CIEAV local receipt store is unreadable, corrupt, or unauthenticated: ${String(err?.message??err)}`);
    }
    this.loaded=true;
  }

  private enqueue<T>(fn:()=>Promise<T>):Promise<T>{const task=this.chain.then(fn,fn);this.chain=task.then(()=>undefined,()=>undefined);return task}
  private async persist(){const values=[...this.receipts.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,MAX_RECEIPTS);this.receipts=new Map(values.map(r=>[r.id,r]));const tmp=`${this.file}.${process.pid}.tmp`;await writeFile(tmp,JSON.stringify(values,null,2)+"\n",{encoding:"utf8",mode:0o600});await rename(tmp,this.file)}
  save(receipt:Receipt){return this.enqueue(async()=>{await this.ensureLoaded();if(!verifyReceipt(receipt,this.signingSecret))throw new Error("refusing to persist receipt with invalid signature");this.receipts.set(receipt.id,receipt);await this.persist()})}
  list(deviceId:string,limit:number){return this.enqueue(async()=>{await this.ensureLoaded();return [...this.receipts.values()].filter(r=>r.deviceId===deviceId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,limit)})}
  get(deviceId:string,id:string){return this.enqueue(async()=>{await this.ensureLoaded();const r=this.receipts.get(id);return r?.deviceId===deviceId?r:null})}
  updateStatus(deviceId:string,id:string,status:Receipt["status"]){return this.enqueue(async()=>{await this.ensureLoaded();const r=this.receipts.get(id);if(!r||r.deviceId!==deviceId)return null;const next=signReceipt({...r,status},this.signingSecret);this.receipts.set(id,next);await this.persist();return next})}
  async close(){await this.chain}
}
