import crypto from "node:crypto";
import {appendFile,mkdir,rename,rm,stat} from "node:fs/promises";
import path from "node:path";

const MAX_BYTES=5*1024*1024;
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

export class AuditLog{
  constructor(stateDir){
    this.stateDir=stateDir;
    this.file=path.join(stateDir,"audit-events.jsonl");
    this.previous=path.join(stateDir,"audit-events.previous.jsonl");
    this._chain=Promise.resolve();
  }
  async load(){await mkdir(this.stateDir,{recursive:true,mode:0o700});return this}
  async _rotate(){
    try{
      const s=await stat(this.file);
      if(s.size<MAX_BYTES)return;
      await rm(this.previous,{force:true});
      await rename(this.file,this.previous);
    }catch{}
  }
  append(type,event={}){
    if(!TYPES.has(type))return Promise.reject(new Error("invalid audit event type"));
    const work=async()=>{
      await this._rotate();
      const value={
        version:1,
        eventId:crypto.randomUUID(),
        type,
        at:new Date().toISOString(),
        ...(text(event.requestId,128)?{requestId:text(event.requestId,128)}:{}),
        ...(text(event.receiptId,80)?{receiptId:text(event.receiptId,80)}:{}),
        ...(text(event.origin,512)?{origin:text(event.origin,512)}:{}),
        ...(text(event.actionType,160)?{actionType:text(event.actionType,160)}:{}),
        ...(["LOW","MEDIUM","HIGH","CRITICAL"].includes(event.risk)?{risk:event.risk}:{}),
        ...(["OBSERVED_SUCCESS","OBSERVED_FAILURE","UNKNOWN"].includes(event.outcomeStatus)?{outcomeStatus:event.outcomeStatus}:{}),
        ...(text(event.detail,300)?{detail:text(event.detail,300)}:{})
      };
      await appendFile(this.file,JSON.stringify(value)+"\n",{encoding:"utf8",mode:0o600});
      return value;
    };
    const task=this._chain.then(work,work);
    this._chain=task.then(()=>undefined,()=>undefined);
    return task;
  }
  async flush(){await this._chain}
}
