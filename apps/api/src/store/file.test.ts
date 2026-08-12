import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach,describe,expect,it} from "vitest";
import {createReceipt} from "../receipt.js";
import {FileReceiptStore} from "./file.js";

const dirs:string[]=[];
async function temp(){const d=await mkdtemp(path.join(os.tmpdir(),"cieav-receipts-"));dirs.push(d);return d}
afterEach(async()=>{await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})))})

const manifest={requestId:"request-12345678",actionType:"access.grant",summary:"Grant access",actor:"You",target:"example.test",recipients:[],dataCategories:["NONE" as const],effects:["Access may be granted."],reversibility:"COMPENSABLE" as const,undo:{kind:"NONE" as const},risk:"MEDIUM" as const,confidence:.9,modelUsed:false,warnings:[],evidence:["test"],policyVersion:"test"};

describe("FileReceiptStore",()=>{
  it("survives store restart and isolates devices",async()=>{
    const dir=await temp(),file=path.join(dir,"receipts.json"),secret="s".repeat(64);
    const receipt=createReceipt("device-a",manifest,{url:"https://example.test/action",origin:"https://example.test"},"COMMITTED",secret);
    const first=new FileReceiptStore(file);await first.save(receipt);await first.close();
    const second=new FileReceiptStore(file);
    expect((await second.get("device-a",receipt.id))?.id).toBe(receipt.id);
    expect(await second.get("device-b",receipt.id)).toBeNull();
    expect((await second.list("device-a",10)).map(r=>r.id)).toEqual([receipt.id]);
    await second.close();
    const raw=JSON.parse(await readFile(file,"utf8"));expect(raw).toHaveLength(1);expect(raw[0].deviceId).toBe("device-a");
  });

  it("fails closed on corrupted receipt history",async()=>{
    const dir=await temp(),file=path.join(dir,"receipts.json");await writeFile(file,"{not-json","utf8");
    const store=new FileReceiptStore(file);
    await expect(store.list("device-a",10)).rejects.toThrow(/unreadable or corrupt/i);
  });
});
