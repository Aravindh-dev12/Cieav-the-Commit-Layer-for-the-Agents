import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface AuthorityProcessLease {
  lockFile:string;
  token:string;
  pid:number;
  hostname:string;
  acquiredAt:string;
  authority:false;
  mayMintExecutionAuthority:false;
  release:()=>void;
}

type LockRecord={version:1;token:string;pid:number;hostname:string;acquiredAt:string;authority:false};
const active=new Map<string,AuthorityProcessLease>();
function pidAlive(pid:number){if(!Number.isInteger(pid)||pid<=0)return false;try{process.kill(pid,0);return true}catch(error:any){return error?.code==="EPERM"}}
function readRecord(file:string):LockRecord|null{try{const raw=JSON.parse(fs.readFileSync(file,"utf8"));if(raw?.version!==1||typeof raw.token!=="string"||!Number.isInteger(raw.pid)||typeof raw.hostname!=="string"||typeof raw.acquiredAt!=="string"||raw.authority!==false)return null;return raw}catch{return null}}
function safeRelease(file:string,token:string){try{const current=readRecord(file);if(current?.token===token)fs.unlinkSync(file)}catch{}}

export function acquireAuthorityProcessLease(stateDir:string):AuthorityProcessLease{
  const dir=path.resolve(stateDir),existing=active.get(dir);if(existing)return existing;
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const lockFile=path.join(dir,"authority-writer.lock"),hostname=os.hostname(),token=crypto.randomBytes(32).toString("hex"),acquiredAt=new Date().toISOString(),record:LockRecord={version:1,token,pid:process.pid,hostname,acquiredAt,authority:false};
  for(let attempt=0;attempt<2;attempt++){
    try{
      const fd=fs.openSync(lockFile,"wx",0o600);try{fs.writeFileSync(fd,JSON.stringify(record)+"\n",{encoding:"utf8"});fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
      try{fs.chmodSync(lockFile,0o600)}catch{}
      let released=false;const release=()=>{if(released)return;released=true;safeRelease(lockFile,token);active.delete(dir)};
      const lease:AuthorityProcessLease={lockFile,token,pid:process.pid,hostname,acquiredAt,authority:false,mayMintExecutionAuthority:false,release};active.set(dir,lease);process.once("exit",release);return lease;
    }catch(error:any){
      if(error?.code!=="EEXIST")throw new Error(`CIEAV authority writer lease cannot be acquired: ${String(error?.message??error)}`);
      const current=readRecord(lockFile);
      if(!current)throw new Error(`CIEAV authority writer lock is corrupt or unauthenticated: ${lockFile}`);
      if(current.hostname!==hostname)throw new Error(`CIEAV authority state directory is already leased by another host (${current.hostname}); refusing split-brain startup`);
      if(pidAlive(current.pid))throw new Error(`CIEAV authority state directory is already leased by live process ${current.pid}`);
      const age=Date.now()-Date.parse(current.acquiredAt);if(!Number.isFinite(age)||age<1000)throw new Error("CIEAV authority writer lock owner is not alive but the lock is too recent to steal safely");
      try{fs.unlinkSync(lockFile)}catch(unlinkError:any){throw new Error(`CIEAV stale authority writer lock could not be removed: ${String(unlinkError?.message??unlinkError)}`)}
    }
  }
  throw new Error("CIEAV authority writer lease acquisition failed after stale-lock recovery");
}

export function authorityProcessLeaseHealth(lease:AuthorityProcessLease|undefined){return lease?{held:true,pid:lease.pid,hostname:lease.hostname,lockFile:lease.lockFile,authority:false,mayMintExecutionAuthority:false}:{held:false,authority:false,mayMintExecutionAuthority:false};}
