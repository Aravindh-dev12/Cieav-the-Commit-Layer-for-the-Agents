import crypto from "node:crypto";
import {mkdtemp,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {DatabaseSync} from "node:sqlite";
import {describe,expect,it} from "vitest";
import {SqliteProofProvider,sqliteProofTargetRef} from "./sqlite.js";
const sha=(v:string)=>crypto.createHash("sha256").update(v).digest("hex");
async function fixture(){const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-sqlite-proof-")),file=path.join(dir,"app.db");const db=new DatabaseSync(file);db.exec("CREATE TABLE items(id INTEGER PRIMARY KEY,value TEXT NOT NULL); INSERT INTO items(id,value) VALUES(1,'ready')");db.close();return{dir,file}}
function request(targetRef:string,expectedState:string[]){return{requestId:"proof-request-123",providerId:"cieav.sqlite-proof.v1",operation:"verify-item",phase:"POST_STATE" as const,targetRef,expectedState,correlationRefs:[],timeoutMs:1000,authority:false as const}}
describe("SqliteProofProvider",()=>{
  it("observes fixed read-only query with value-only parameters",async()=>{const{file}=await fixture(),provider=new SqliteProofProvider([{id:"item",databasePath:file,sql:"SELECT id,value FROM items WHERE id=?",parameterCount:1,maxRows:10,maxResultBytes:4096}]),result=await provider.observe(request(sqliteProofTargetRef("item",[1]),["rows:1","nonempty"]));expect(result.conclusive).toBe(true);expect(result.proposedOutcome).toBe("SUCCESS");expect(result.observations[0]).toMatchObject({kind:"SQLITE_QUERY_RESULT",confidence:1})});
  it("proposes FAILURE when understood post-state expectation is contradicted",async()=>{const{file}=await fixture(),provider=new SqliteProofProvider([{id:"item",databasePath:file,sql:"SELECT id,value FROM items WHERE id=?",parameterCount:1,maxRows:10,maxResultBytes:4096}]),result=await provider.observe(request(sqliteProofTargetRef("item",[999]),["nonempty"]));expect(result.conclusive).toBe(true);expect(result.proposedOutcome).toBe("FAILURE")});
  it("does not claim a conclusion for unknown expectation syntax",async()=>{const{file}=await fixture(),provider=new SqliteProofProvider([{id:"item",databasePath:file,sql:"SELECT id,value FROM items WHERE id=?",parameterCount:1,maxRows:10,maxResultBytes:4096}]),result=await provider.observe(request(sqliteProofTargetRef("item",[1]),["application-specific-unknown"]));expect(result.conclusive).toBe(false);expect(result.proposedOutcome).toBeUndefined()});
  it("rejects mutation SQL in proof configuration",async()=>{const{file}=await fixture();expect(()=>new SqliteProofProvider([{id:"bad",databasePath:file,sql:"UPDATE items SET value='x'",parameterCount:0,maxRows:10,maxResultBytes:4096}])).toThrow()});
  it("loads an authority-free provider from a trusted catalog",async()=>{const{dir,file}=await fixture(),catalog=path.join(dir,"proof.json");await writeFile(catalog,JSON.stringify({version:1,sqliteProof:[{id:"all",databasePath:file,sql:"SELECT id,value FROM items",parameterCount:0,maxRows:10,maxResultBytes:4096}]}));const provider=SqliteProofProvider.fromCatalogFile(catalog)!;expect((await provider.health()).authority).toBe(false);const result=await provider.observe(request(sqliteProofTargetRef("all"),["rows:1"]));expect(result.authority).toBe(false);expect(result.mayMintExecutionAuthority).toBe(false);expect(result.observations[0]?.digest).toBe(sha('[{"id":1,"value":"ready"}]'))});
});
