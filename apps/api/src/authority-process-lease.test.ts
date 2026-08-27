import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach,describe,expect,it} from "vitest";
import {acquireAuthorityProcessLease,authorityProcessLeaseHealth} from "./authority-process-lease.js";

const dirs:string[]=[];function dir(){const d=fs.mkdtempSync(path.join(os.tmpdir(),"cieav-authority-lease-"));dirs.push(d);return d}
afterEach(()=>{for(const d of dirs.splice(0))fs.rmSync(d,{recursive:true,force:true})});
function writeLock(d:string,value:unknown){fs.writeFileSync(path.join(d,"authority-writer.lock"),JSON.stringify(value)+"\n",{mode:0o600})}

describe("CIEAV authority process lease",()=>{
  it("creates a zero-authority exclusive writer lease and releases it",()=>{const d=dir(),lease=acquireAuthorityProcessLease(d);expect(fs.existsSync(lease.lockFile)).toBe(true);expect(authorityProcessLeaseHealth(lease)).toMatchObject({held:true,pid:process.pid,authority:false,mayMintExecutionAuthority:false});lease.release();expect(fs.existsSync(lease.lockFile)).toBe(false)});
  it("returns the same in-process lease instead of creating competing ownership",()=>{const d=dir(),a=acquireAuthorityProcessLease(d),b=acquireAuthorityProcessLease(d);expect(b.token).toBe(a.token);a.release()});
  it("refuses a lock owned by a live same-host process",()=>{const d=dir();writeLock(d,{version:1,token:"a".repeat(64),pid:process.pid,hostname:os.hostname(),acquiredAt:new Date().toISOString(),authority:false});expect(()=>acquireAuthorityProcessLease(d)).toThrow(/already leased by live process/)});
  it("recovers a stale same-host lock whose process no longer exists",()=>{const d=dir();writeLock(d,{version:1,token:"b".repeat(64),pid:2147483647,hostname:os.hostname(),acquiredAt:"2000-01-01T00:00:00.000Z",authority:false});const lease=acquireAuthorityProcessLease(d);expect(lease.pid).toBe(process.pid);lease.release()});
  it("never steals a lock written by another host",()=>{const d=dir();writeLock(d,{version:1,token:"c".repeat(64),pid:1,hostname:`foreign-${os.hostname()}`,acquiredAt:"2000-01-01T00:00:00.000Z",authority:false});expect(()=>acquireAuthorityProcessLease(d)).toThrow(/another host.*split-brain/i)});
  it("fails closed on a corrupt lock file",()=>{const d=dir();fs.writeFileSync(path.join(d,"authority-writer.lock"),"not-json\n");expect(()=>acquireAuthorityProcessLease(d)).toThrow(/corrupt or unauthenticated/)});
});
