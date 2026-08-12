import crypto from "node:crypto";
import {appendFile,mkdir,open,readFile,rename,rm,stat} from "node:fs/promises";
import path from "node:path";

const MAX_BYTES=5*1024*1024;
const ZERO_HASH="0".repeat(64);
const TYPES=new Set([
  "ACTION_DETECTED",
  "ACTION_COMMITTED",
  "ACTION_CANCELLED",
  "ACTION_REPLAYED",
  "OUTCOME_OBSERVED",
  "UNDO_AVAILABLE",
  "UNDO_EXECUTED",
  "UNDO_FAILED"
]);
const text=(v,n)=>typeof v==="string"?v.slice(0,n):undefined;
const hash=s=>crypto.createHash("sha256").update(s,"utf8").digest("hex");
const field=v=>{const s=String(v??"");return `${Buffer.byteLength(s,"utf8")}:${s}`};
function payload(v){return [v.version,v.eventId,v.type,v.at,v.requestId,v.receiptId,v.origin,v.actionType,v.risk,v.outcomeStatus,v.detail].map(field).join("|")}
function eventHash(v){return hash(`${v.prevHash}\n${payload(v)}`)}
function legacyHash(prev,line){return hash(`LEGACY\n${prev}\n${line}`)}

export class AuditLog{
  constructor(stateDir){
    this.stateDir=stateDir;
    this.file=path.join(stateDir,"audit-events.jsonl");
    this.previous=path.join(stateDir,"audit-events.previous.jsonl");
    this._chain=Promise.resolve();
    this._lastHash=ZERO_HASH;
  }
  async _verifyFile(file,{setCurrent=false}={}){
    let raw;
    try{raw=await readFile(file,"utf8")}catch(err){if(err?.code==="ENOENT"){if(setCurrent)this._lastHash=ZERO_HASH;return{ok:true,file,events:0,lastHash:ZERO_HASH}}throw err}
    let prev=ZERO_HASH,count=0;
    for(const line of raw.split(/\r?\n/)){
      if(!line)continue;
      let value;
      try{value=JSON.parse(line)}catch{throw new Error(`CIEAV audit log is corrupt: invalid JSON in ${path.basename(file)}`)}
      if(value?.version===2){
        if(typeof value.prevHash!=="string"||typeof value.hash!=="string"||!/^[0-9a-f]{64}$/.test(value.prevHash)||!/^[0-9a-f]{64}$/.test(value.hash))throw new Error(`CIEAV audit log is corrupt: invalid hash fields in ${path.basename(file)}`);
        if(value.prevHash!==prev)throw new Error(`CIEAV audit log chain mismatch in ${path.basename(file)}`);
        const expected=eventHash({...value,hash:undefined});
        if(expected!==value.hash)throw new Error(`CIEAV audit event hash mismatch in ${path.basename(file)}`);
        prev=value.hash;
      }else{
        // Legacy v1 events become part of the first v2 chain anchor in this file.
        prev=legacyHash(prev,line);
      }
      count++;
    }
    if(setCurrent)this._lastHash=prev;
    return{ok:true,file,events:count,lastHash:prev};
  }
  async load(){
    await mkdir(this.stateDir,{recursive:true,mode:0o700});
    await this._verifyFile(this.previous);
    await this._verifyFile(this.file,{setCurrent:true});
    return this;
  }
  async verify(){
    await this.flush();
    const previous=await this._verifyFile(this.previous);
    const current=await this._verifyFile(this.file,{setCurrent:true});
    return{ok:true,format:"sha256-chain-v2",previous,current};
  }
  async _rotate(){
    try{
      const s=await stat(this.file);
      if(s.size<MAX_BYTES)return;
    }catch(err){if(err?.code==="ENOENT")return;throw err}
    await rm(this.previous,{force:true});
    await rename(this.file,this.previous);
    this._lastHash=ZERO_HASH;
  }
  async _appendDurable(line){
    const fh=await open(this.file,"a",0o600);
    try{await fh.writeFile(line,{encoding:"utf8"});await fh.sync()}finally{await fh.close()}
  }
  append(type,event={}){
    if(!TYPES.has(type))return Promise.reject(new Error("invalid audit event type"));
    const work=async()=>{
      await this._rotate();
      const value={
        version:2,
        eventId:crypto.randomUUID(),
        type,
        at:new Date().toISOString(),
        ...(text(event.requestId,128)?{requestId:text(event.requestId,128)}:{}),
        ...(text(event.receiptId,80)?{receiptId:text(event.receiptId,80)}:{}),
        ...(text(event.origin,512)?{origin:text(event.origin,512)}:{}),
        ...(text(event.actionType,160)?{actionType:text(event.actionType,160)}:{}),
        ...(["LOW","MEDIUM","HIGH","CRITICAL"].includes(event.risk)?{risk:event.risk}:{}),
        ...(["OBSERVED_SUCCESS","OBSERVED_FAILURE","UNKNOWN"].includes(event.outcomeStatus)?{outcomeStatus:event.outcomeStatus}:{}),
        ...(text(event.detail,300)?{detail:text(event.detail,300)}:{}),
        prevHash:this._lastHash
      };
      value.hash=eventHash(value);
      await this._appendDurable(JSON.stringify(value)+"\n");
      this._lastHash=value.hash;
      return value;
    };
    const task=this._chain.then(work,work);
    this._chain=task.then(()=>undefined,()=>undefined);
    return task;
  }
  async flush(){await this._chain}
}
