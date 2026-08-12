import pg from "pg";
import type { Pool as PgPool } from "pg";
import type { Receipt } from "@latch/contracts";
import type { ReceiptStore } from "./types.js";
const {Pool} = pg;
export class PostgresReceiptStore implements ReceiptStore {
  private pool: PgPool; constructor(url:string){this.pool=new Pool({connectionString:url,max:10});}
  async init(){await this.pool.query(`CREATE TABLE IF NOT EXISTS receipts (id uuid PRIMARY KEY, device_id text NOT NULL, created_at timestamptz NOT NULL, committed_at timestamptz, status text NOT NULL, manifest jsonb NOT NULL, source jsonb NOT NULL, signature text, signature_algorithm text, receipt_version text NOT NULL); CREATE INDEX IF NOT EXISTS receipts_device_created_idx ON receipts(device_id, created_at DESC);`);}
  async save(r:Receipt){await this.pool.query(`INSERT INTO receipts(id,device_id,created_at,committed_at,status,manifest,source,signature,signature_algorithm,receipt_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status, committed_at=EXCLUDED.committed_at, signature=EXCLUDED.signature`,[r.id,r.deviceId,r.createdAt,r.committedAt??null,r.status,JSON.stringify(r.manifest),JSON.stringify(r.source),r.signature??null,r.signatureAlgorithm??null,r.receiptVersion]);}
  async list(deviceId:string,limit:number){const q=await this.pool.query(`SELECT * FROM receipts WHERE device_id=$1 ORDER BY created_at DESC LIMIT $2`,[deviceId,limit]);return q.rows.map(rowToReceipt);}
  async get(deviceId:string,id:string){const q=await this.pool.query(`SELECT * FROM receipts WHERE device_id=$1 AND id=$2 LIMIT 1`,[deviceId,id]);return q.rowCount?rowToReceipt(q.rows[0]):null;}
  async updateStatus(deviceId:string,id:string,status:Receipt["status"]){const q=await this.pool.query(`UPDATE receipts SET status=$3 WHERE device_id=$1 AND id=$2 RETURNING *`,[deviceId,id,status]);return q.rowCount?rowToReceipt(q.rows[0]):null;}
  async close(){await this.pool.end();}
}
function rowToReceipt(row:any):Receipt{return{id:row.id,deviceId:row.device_id,createdAt:new Date(row.created_at).toISOString(),...(row.committed_at?{committedAt:new Date(row.committed_at).toISOString()}:{}),status:row.status,manifest:row.manifest,source:row.source,...(row.signature?{signature:row.signature}:{}),...(row.signature_algorithm?{signatureAlgorithm:row.signature_algorithm}:{}),receiptVersion:row.receipt_version};}
