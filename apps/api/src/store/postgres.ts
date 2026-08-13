import type {Receipt} from "@cieav/contracts";
import type {ReceiptStore} from "./types.js";

/** @deprecated PostgreSQL persistence was removed in CIEAV 0.7. Use the managed SQLite receipt store. */
export class PostgresReceiptStore implements ReceiptStore {
  constructor(_url:string){throw new Error("PostgreSQL receipt persistence has been removed; CIEAV uses SQLite")}
  async init(){throw new Error("PostgreSQL receipt persistence has been removed; CIEAV uses SQLite")}
  async save(_receipt:Receipt){throw new Error("PostgreSQL receipt persistence has been removed; CIEAV uses SQLite")}
  async list(_deviceId:string,_limit:number):Promise<Receipt[]>{throw new Error("PostgreSQL receipt persistence has been removed; CIEAV uses SQLite")}
  async get(_deviceId:string,_id:string):Promise<Receipt|null>{throw new Error("PostgreSQL receipt persistence has been removed; CIEAV uses SQLite")}
  async updateStatus(_deviceId:string,_id:string,_status:Receipt["status"]):Promise<Receipt|null>{throw new Error("PostgreSQL receipt persistence has been removed; CIEAV uses SQLite")}
  async close(){}
}
