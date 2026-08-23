import {mkdtemp} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {DatabaseSync} from "node:sqlite";
import {describe,expect,it} from "vitest";
import {TrustedSqliteAdapter,TrustedSqliteToolConfigSchema,sqliteDownstreamRef,type TrustedSqliteToolConfig} from "./trusted-sqlite-adapter.js";

async function fixture(){const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-sqlite-")),file=path.join(dir,"app.db"),db=new DatabaseSync(file);db.exec("PRAGMA foreign_keys=ON; CREATE TABLE items(id INTEGER PRIMARY KEY, value TEXT NOT NULL UNIQUE); INSERT INTO items(id,value) VALUES(1,'before')");db.close();return file}
function config(file:string,sql="UPDATE items SET value=? WHERE id=?",maxChanges=10):TrustedSqliteToolConfig{return{toolId:"db.update-item",databasePath:file,sql,busyTimeoutMs:1000,maxChanges,requireForeignKeys:true}}
function context(cfg:TrustedSqliteToolConfig,params:unknown[]=["after",1]){return{ticket:{id:"11111111-1111-4111-8111-111111111111"},proposal:{normalizedArgumentsDigest:"a".repeat(64)},tool:{id:cfg.toolId,protocol:"DATABASE",downstreamRef:sqliteDownstreamRef(cfg),credentialMode:"NONE",executionMode:"ONESHOT"},normalizedArguments:{params}} as any}

describe("TrustedSqliteAdapter",()=>{
  it("commits only the configured statement with bound parameters",async()=>{const file=await fixture(),cfg=config(file),adapter=new TrustedSqliteAdapter([cfg]),result=await adapter.execute(context(cfg));expect(result.transport).toBe("ACCEPTED");expect(result.metadata).toMatchObject({changes:1,transactionCommitted:true});const db=new DatabaseSync(file,{readOnly:true});try{expect(db.prepare("SELECT value FROM items WHERE id=1").get()).toMatchObject({value:"after"})}finally{db.close()}});
  it("rolls back and returns REJECTED when the configured mutation violates a constraint",async()=>{const file=await fixture(),setup=new DatabaseSync(file);setup.exec("INSERT INTO items(id,value) VALUES(2,'other')");setup.close();const cfg=config(file),adapter=new TrustedSqliteAdapter([cfg]),result=await adapter.execute(context(cfg,["other",1]));expect(result.transport).toBe("REJECTED");expect(result.metadata).toMatchObject({transactionCommitted:false,rollbackConfirmed:true});const db=new DatabaseSync(file,{readOnly:true});try{expect(db.prepare("SELECT value FROM items WHERE id=1").get()).toMatchObject({value:"before"})}finally{db.close()}});
  it("rolls back when a trusted statement exceeds its configured change budget",async()=>{const file=await fixture(),cfg=config(file,"UPDATE items SET value='changed'",0),adapter=new TrustedSqliteAdapter([cfg]),result=await adapter.execute(context(cfg,[]));expect(result.transport).toBe("REJECTED");const db=new DatabaseSync(file,{readOnly:true});try{expect(db.prepare("SELECT value FROM items WHERE id=1").get()).toMatchObject({value:"before"})}finally{db.close()}});
  it("rejects arbitrary or multi-statement SQL at trusted configuration load",async()=>{const file=await fixture();expect(()=>TrustedSqliteToolConfigSchema.parse({...config(file),sql:"SELECT * FROM items"})).toThrow();expect(()=>TrustedSqliteToolConfigSchema.parse({...config(file),sql:"UPDATE items SET value='x'; DELETE FROM items"})).toThrow()});
  it("refuses continuing database execution without a checkpoint/cancellation protocol",async()=>{const file=await fixture(),cfg=config(file),adapter=new TrustedSqliteAdapter([cfg]),ctx=context(cfg);ctx.tool.executionMode="CONTINUING";expect(()=>adapter.preflight(ctx)).toThrow("execution_sqlite_continuing_not_supported")});
});
