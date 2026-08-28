import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach,describe,expect,it} from "vitest";
import {CieavAuthorityTransactionJournal} from "./authority-transaction-journal.js";

const dirs:string[]=[];
afterEach(async()=>{await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})))});

async function fresh(){const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-authority-journal-"));dirs.push(dir);return{dir,file:path.join(dir,"authority-transaction-journal.json"),secret:"j".repeat(64)}}

describe("CIEAV authority transaction journal",()=>{
  it("persists monotonic fencing, hash chaining and zero-authority state",async()=>{
    const x=await fresh(),journal=new CieavAuthorityTransactionJournal(x.file,x.secret);
    const first=await journal.begin("ISSUE_TICKET","issue:one",{value:1});
    const second=await journal.begin("CONSUME_TICKET","consume:one",{value:2});
    expect(first.epoch).toBe(1);
    expect(second.epoch).toBe(1);
    expect(second.sequence).toBeGreaterThan(first.sequence);
    expect(first.fenceToken).toBe(`${first.epoch}:${first.sequence}`);
    expect(second.previousHash).toBe(first.entryHash);
    expect(first).toMatchObject({authority:false,mayMintExecutionAuthority:false});
    await journal.advance(first.id,"APPLIED");
    await journal.advance(first.id,"COMMITTED");
    expect((await journal.health()).pending).toBe(1);
    await journal.close();

    const reopened=new CieavAuthorityTransactionJournal(x.file,x.secret);
    const health=await reopened.health();
    expect(health.epoch).toBe(2);
    expect(health).toMatchObject({localFencingOnly:true,clusterHaQualified:false,authority:false,mayMintExecutionAuthority:false});
    const third=await reopened.begin("ISSUE_TICKET","issue:two",{value:3});
    expect(third.epoch).toBe(2);
    expect(third.sequence).toBeGreaterThan(second.sequence);
    await reopened.close();
  });

  it("is idempotent for the same transaction key and rejects payload conflicts",async()=>{
    const x=await fresh(),journal=new CieavAuthorityTransactionJournal(x.file,x.secret);
    const first=await journal.begin("ISSUE_TICKET","issue:stable",{ticket:"a"});
    const same=await journal.begin("ISSUE_TICKET","issue:stable",{ticket:"a"});
    expect(same.id).toBe(first.id);
    await expect(journal.begin("ISSUE_TICKET","issue:stable",{ticket:"b"})).rejects.toThrow(/key conflict/);
    await journal.advance(first.id,"COMMITTED");
    const committed=await journal.begin("ISSUE_TICKET","issue:stable",{ticket:"a"});
    expect(committed.id).toBe(first.id);
    await expect(journal.advance(first.id,"PREPARED")).rejects.toThrow(/stage regression/);
    await journal.close();
  });

  it("fails closed when the authenticated journal is tampered",async()=>{
    const x=await fresh(),journal=new CieavAuthorityTransactionJournal(x.file,x.secret);
    await journal.begin("ISSUE_TICKET","issue:tamper",{ticket:"a"});
    await journal.close();
    const raw=JSON.parse(await readFile(x.file,"utf8"));
    raw.payload.entries[0].payload.ticket="evil";
    await writeFile(x.file,JSON.stringify(raw,null,2)+"\n","utf8");
    const reopened=new CieavAuthorityTransactionJournal(x.file,x.secret);
    await expect(reopened.health()).rejects.toThrow(/unreadable, corrupt, or unauthenticated/);
  });
});
