import {access,mkdtemp,rm,writeFile} from "node:fs/promises";
import {createRequire} from "node:module";
import os from "node:os";
import path from "node:path";
import {afterEach,describe,expect,it} from "vitest";
import {loadDeviceReceiptSigner} from "../device-signing.js";
import {createReceipt,verifyReceiptPublic} from "../receipt.js";
import {FileReceiptStore} from "./file.js";

const nodeRequire=createRequire(import.meta.url);
const {DatabaseSync}=nodeRequire("node:sqlite") as {DatabaseSync:new(path:string)=>{prepare:(sql:string)=>{get:(...values:unknown[])=>unknown;run:(...values:unknown[])=>unknown};close:()=>void}};
const dirs:string[]=[];
async function temp(){const d=await mkdtemp(path.join(os.tmpdir(),"cieav-receipts-"));dirs.push(d);return d}
afterEach(async()=>{delete process.env.CIEAV_SQLITE_PATH;await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})))});
const manifest={requestId:"request-12345678",actionType:"access.grant",summary:"Grant access",actor:"You",target:"example.test",recipients:[],dataCategories:["NONE" as const],effects:["Access may be granted."],reversibility:"COMPENSABLE" as const,undo:{kind:"NONE" as const},risk:"MEDIUM" as const,confidence:.9,modelUsed:false,warnings:[],evidence:["test"],policyVersion:"test"};

describe("SQLite-backed FileReceiptStore",()=>{
  it("survives restart and isolates devices",async()=>{const dir=await temp(),legacy=path.join(dir,"receipts.json"),db=path.join(dir,"receipts.sqlite3"),secret="s".repeat(64),receipt=createReceipt("device-a",manifest,{url:"https://example.test/action",origin:"https://example.test"},"COMMITTED",secret);const first=new FileReceiptStore(legacy,secret);await first.save(receipt);await first.close();await access(db);const second=new FileReceiptStore(legacy,secret);expect((await second.get("device-a",receipt.id))?.id).toBe(receipt.id);expect(await second.get("device-b",receipt.id)).toBeNull();await second.close()});

  it("migrates verified legacy JSON into SQLite exactly once",async()=>{const dir=await temp(),legacy=path.join(dir,"receipts.json"),secret="s".repeat(64),receipt=createReceipt("device-a",manifest,{url:"https://example.test/action",origin:"https://example.test"},"COMMITTED",secret);await writeFile(legacy,JSON.stringify([receipt]),"utf8");const store=new FileReceiptStore(legacy,secret);expect((await store.list("device-a",10))[0]?.id).toBe(receipt.id);await store.close();await access(`${legacy}.migrated`);await access(path.join(dir,"receipts.sqlite3"))});

  it("persists Ed25519 receipts that remain independently verifiable",async()=>{const dir=await temp(),state=path.join(dir,"state"),legacy=path.join(dir,"receipts.json"),signer=await loadDeviceReceiptSigner(state,"legacy-"+"s".repeat(64)),receipt=createReceipt("device-a",manifest,{url:"https://example.test/action",origin:"https://example.test"},"COMMITTED",signer);expect(receipt.receiptVersion).toBe("3");expect(verifyReceiptPublic(receipt)).toBe(true);const store=new FileReceiptStore(legacy,signer);await store.save(receipt);await store.close();const reloaded=new FileReceiptStore(legacy,signer);expect((await reloaded.get("device-a",receipt.id))?.signatureKeyId).toBe(signer.keyId);await reloaded.close()});

  it("fails closed when SQLite receipt content is modified",async()=>{const dir=await temp(),legacy=path.join(dir,"receipts.json"),signer=await loadDeviceReceiptSigner(path.join(dir,"state"),"legacy-"+"s".repeat(64)),receipt=createReceipt("device-a",manifest,{url:"https://example.test/action",origin:"https://example.test"},"COMMITTED",signer),store=new FileReceiptStore(legacy,signer);await store.save(receipt);await store.close();const db=new DatabaseSync(path.join(dir,"receipts.sqlite3")),row=db.prepare("SELECT receipt_json FROM receipts WHERE id=?").get(receipt.id) as {receipt_json:string},raw=JSON.parse(row.receipt_json);raw.manifest.summary="Tampered summary";db.prepare("UPDATE receipts SET receipt_json=? WHERE id=?").run(JSON.stringify(raw),receipt.id);db.close();await expect(new FileReceiptStore(legacy,signer).list("device-a",10)).rejects.toThrow(/signature verification failed/i)});
});
