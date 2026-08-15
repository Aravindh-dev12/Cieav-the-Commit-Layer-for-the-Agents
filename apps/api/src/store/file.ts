import {chmodSync} from "node:fs";
import {mkdir,readFile,rename} from "node:fs/promises";
import {createRequire} from "node:module";
import path from "node:path";
import {ReceiptSchema,type Receipt} from "@cieav/contracts";
import {signReceipt,verifyReceipt,type ReceiptSigner} from "../receipt.js";
import type {ReceiptStore} from "./types.js";

type SqliteStatement={run:(...values:unknown[])=>unknown;get:(...values:unknown[])=>unknown;all:(...values:unknown[])=>unknown[]};
type SqliteDatabase={exec:(sql:string)=>void;prepare:(sql:string)=>SqliteStatement;close:()=>void};
type DatabaseSyncConstructor=new(path:string)=>SqliteDatabase;
const nodeRequire=createRequire(import.meta.url);
const {DatabaseSync}=nodeRequire("node:sqlite") as {DatabaseSync:DatabaseSyncConstructor};
type ReceiptRow={id:string;device_id:string;created_at:string;receipt_json:string};

export class FileReceiptStore implements ReceiptStore {
  private db:SqliteDatabase|null=null;
  private loaded=false;
  private readonly dbFile:string;
  constructor(private readonly legacyJsonFile:string,private readonly signer:ReceiptSigner){const configured=process.env.CIEAV_SQLITE_PATH?.trim();this.dbFile=configured?path.resolve(configured):legacyJsonFile.endsWith(".json")?`${legacyJsonFile.slice(0,-5)}.sqlite3`:legacyJsonFile}

  private decode(row:ReceiptRow|undefined):Receipt|null{
    if(!row)return null;
    let parsed:Receipt;
    try{parsed=ReceiptSchema.parse(JSON.parse(row.receipt_json))}catch(err){throw new Error(`CIEAV SQLite receipt row is corrupt: ${row.id}: ${String((err as Error)?.message??err)}`)}
    if(parsed.id!==row.id||parsed.deviceId!==row.device_id||parsed.createdAt!==row.created_at)throw new Error(`CIEAV SQLite receipt row metadata mismatch: ${row.id}`);
    if(!verifyReceipt(parsed,this.signer))throw new Error(`CIEAV SQLite receipt signature verification failed: ${row.id}`);
    return parsed;
  }

  private async ensureLoaded(){
    if(this.loaded)return;
    await mkdir(path.dirname(this.dbFile),{recursive:true,mode:0o700});
    const db=new DatabaseSync(this.dbFile);this.db=db;
    db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;");
    db.exec("CREATE TABLE IF NOT EXISTS receipts (id TEXT PRIMARY KEY, device_id TEXT NOT NULL, created_at TEXT NOT NULL, receipt_json TEXT NOT NULL); CREATE INDEX IF NOT EXISTS receipts_device_created_idx ON receipts(device_id,created_at DESC);");
    try{chmodSync(this.dbFile,0o600)}catch{}
    const count=Number((db.prepare("SELECT COUNT(*) AS n FROM receipts").get() as {n:number|bigint}).n);
    if(count===0&&this.legacyJsonFile.endsWith(".json")){
      try{
        const raw=JSON.parse(await readFile(this.legacyJsonFile,"utf8"));if(!Array.isArray(raw))throw new Error("receipt store root must be an array");
        const insert=db.prepare("INSERT INTO receipts(id,device_id,created_at,receipt_json) VALUES(?,?,?,?)");
        db.exec("BEGIN IMMEDIATE");
        try{for(const item of raw){const parsed=ReceiptSchema.parse(item);if(!verifyReceipt(parsed,this.signer))throw new Error(`receipt signature verification failed: ${parsed.id}`);insert.run(parsed.id,parsed.deviceId,parsed.createdAt,JSON.stringify(parsed))}db.exec("COMMIT")}catch(err){db.exec("ROLLBACK");throw err}
        await rename(this.legacyJsonFile,`${this.legacyJsonFile}.migrated`);
      }catch(err:any){if(err?.code!=="ENOENT")throw new Error(`CIEAV legacy receipt store migration failed: ${String(err?.message??err)}`)}
    }
    this.loaded=true;
  }

  async save(receipt:Receipt){await this.ensureLoaded();if(!verifyReceipt(receipt,this.signer))throw new Error("refusing to persist receipt with invalid signature");this.db!.prepare("INSERT INTO receipts(id,device_id,created_at,receipt_json) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET device_id=excluded.device_id,created_at=excluded.created_at,receipt_json=excluded.receipt_json").run(receipt.id,receipt.deviceId,receipt.createdAt,JSON.stringify(receipt))}
  async list(deviceId:string,limit:number){await this.ensureLoaded();const rows=this.db!.prepare("SELECT id,device_id,created_at,receipt_json FROM receipts WHERE device_id=? ORDER BY created_at DESC LIMIT ?").all(deviceId,limit) as ReceiptRow[];return rows.map(r=>this.decode(r)!)}
  async get(deviceId:string,id:string){await this.ensureLoaded();return this.decode(this.db!.prepare("SELECT id,device_id,created_at,receipt_json FROM receipts WHERE device_id=? AND id=? LIMIT 1").get(deviceId,id) as ReceiptRow|undefined)}
  async updateStatus(deviceId:string,id:string,status:Receipt["status"]){const current=await this.get(deviceId,id);if(!current)return null;const next=signReceipt({...current,status},this.signer);await this.save(next);return next}
  async close(){this.db?.close();this.db=null;this.loaded=false}
}
