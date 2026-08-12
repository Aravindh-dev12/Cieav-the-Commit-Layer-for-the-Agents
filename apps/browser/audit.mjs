import crypto from "node:crypto";
import {chmod,mkdir,open,readFile,rename,rm,stat,writeFile} from "node:fs/promises";
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
const sha=s=>crypto.createHash("sha256").update(s,"utf8").digest("hex");
const field=v=>{const s=String(v??"");return `${Buffer.byteLength(s,"utf8")}:${s}`};
const fieldsV2=["version","eventId","type","at","requestId","receiptId","origin","actionType","risk","outcomeStatus","detail"];
const fieldsV3=[...fieldsV2,"algorithm"];
const payload=(v,fields)=>fields.map(k=>field(v[k])).join("|");
const eventSha=v=>sha(`${v.prevHash}\n${payload(v,fieldsV2)}`);
const eventMac=(v,key)=>crypto.createHmac("sha256",key).update(`${v.prevHash}\n${payload(v,fieldsV3)}`,"utf8").digest("hex");
const legacyHash=(prev,line)=>sha(`LEGACY\n${prev}\n${line}`);
const validHash=v=>typeof v==="string"&&/^[0-9a-f]{64}$/.test(v);

export class AuditLog{
  constructor(stateDir,{maxBytes=MAX_BYTES}={}){
    this.stateDir=stateDir;
    this.file=path.join(stateDir,"audit-events.jsonl");
    this.previous=path.join(stateDir,"audit-events.previous.jsonl");
    this.keyFile=path.join(stateDir,"audit-integrity-key");
    this.maxBytes=maxBytes;
    this._chain=Promise.resolve();
    this._lastHash=ZERO_HASH;
    this._key=null;
  }
  async _containsV3(){
    for(const file of [this.previous,this.file]){
      try{if(/"version"\s*:\s*3/.test(await readFile(file,"utf8")))return true}catch(err){if(err?.code!=="ENOENT")throw err}
    }
    return false;
  }
  async _loadKey(){
    try{
      const value=(await readFile(this.keyFile,"utf8")).trim();
      if(value.length<43)throw new Error("CIEAV audit integrity key is invalid");
      this._key=value;
      try{await chmod(this.keyFile,0o600)}catch{}
      return;
    }catch(err){
      if(err?.code!=="ENOENT")throw err;
    }
    if(await this._containsV3())throw new Error("CIEAV audit integrity key is missing; keyed audit history cannot be verified");
    this._key=crypto.randomBytes(48).toString("base64url");
    await writeFile(this.keyFile,this._key+"\n",{encoding:"utf8",mode:0o600,flag:"wx"}).catch(async err=>{
      if(err?.code!=="EEXIST")throw err;
      this._key=(await readFile(this.keyFile,"utf8")).trim();
    });
  }
  async _verifyFile(file,{initialHash=null,setCurrent=false,allowLegacyReset=false}={}){
    let raw;
    try{raw=await readFile(file,"utf8")}catch(err){
      if(err?.code==="ENOENT"){
        const lastHash=initialHash??ZERO_HASH;
        if(setCurrent)this._lastHash=lastHash;
        return{ok:true,file,present:false,events:0,lastHash,anchorHash:initialHash};
      }
      throw err;
    }
    let prev=initialHash,count=0,anchorHash=initialHash,first=true,format="legacy";
    for(const line of raw.split(/\r?\n/)){
      if(!line)continue;
      let value;
      try{value=JSON.parse(line)}catch{throw new Error(`CIEAV audit log is corrupt: invalid JSON in ${path.basename(file)}`)}
      if(!value||typeof value!=="object"||Array.isArray(value))throw new Error(`CIEAV audit log is corrupt: invalid event in ${path.basename(file)}`);
      if(value.version===3){
        format="hmac-sha256-chain-v3";
        if(value.algorithm!=="HMAC-SHA256"||!validHash(value.prevHash)||!validHash(value.hash))throw new Error(`CIEAV audit log is corrupt: invalid keyed hash fields in ${path.basename(file)}`);
        if(first&&prev==null){prev=value.prevHash;anchorHash=prev}
        if(value.prevHash!==prev)throw new Error(`CIEAV audit log chain mismatch in ${path.basename(file)}`);
        const expected=eventMac({...value,hash:undefined},this._key);
        if(expected!==value.hash)throw new Error(`CIEAV audit event authentication failed in ${path.basename(file)}`);
        prev=value.hash;
      }else if(value.version===2){
        if(format==="legacy")format="sha256-chain-v2";
        if(!validHash(value.prevHash)||!validHash(value.hash))throw new Error(`CIEAV audit log is corrupt: invalid hash fields in ${path.basename(file)}`);
        if(first&&prev==null){prev=value.prevHash;anchorHash=prev}
        if(first&&allowLegacyReset&&value.prevHash===ZERO_HASH&&prev!==ZERO_HASH){prev=ZERO_HASH;anchorHash=ZERO_HASH}
        if(value.prevHash!==prev)throw new Error(`CIEAV audit log chain mismatch in ${path.basename(file)}`);
        if(eventSha({...value,hash:undefined})!==value.hash)throw new Error(`CIEAV audit event hash mismatch in ${path.basename(file)}`);
        prev=value.hash;
      }else{
        if(first&&prev==null){prev=ZERO_HASH;anchorHash=ZERO_HASH}
        prev=legacyHash(prev,line);
      }
      first=false;count++;
    }
    const lastHash=prev??(initialHash??ZERO_HASH);
    if(setCurrent)this._lastHash=lastHash;
    return{ok:true,file,present:true,events:count,lastHash,anchorHash,format};
  }
  async load(){
    await mkdir(this.stateDir,{recursive:true,mode:0o700});
    await this._loadKey();
    const previous=await this._verifyFile(this.previous,{initialHash:null});
    await this._verifyFile(this.file,{initialHash:previous.present?previous.lastHash:ZERO_HASH,setCurrent:true,allowLegacyReset:true});
    return this;
  }
  async verify(){
    await this.flush();
    const previous=await this._verifyFile(this.previous,{initialHash:null});
    const current=await this._verifyFile(this.file,{initialHash:previous.present?previous.lastHash:ZERO_HASH,setCurrent:true,allowLegacyReset:true});
    return{ok:true,format:"hmac-sha256-chain-v3",keyed:true,previous,current};
  }
  async _rotate(){
    try{
      const s=await stat(this.file);
      if(s.size<this.maxBytes)return;
    }catch(err){if(err?.code==="ENOENT")return;throw err}
    await rm(this.previous,{force:true});
    await rename(this.file,this.previous);
    // Keep _lastHash unchanged: the first event in the new current file is
    // cryptographically linked to the terminal event retained in previous.
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
        version:3,
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
        algorithm:"HMAC-SHA256",
        prevHash:this._lastHash
      };
      value.hash=eventMac(value,this._key);
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
