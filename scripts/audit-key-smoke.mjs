#!/usr/bin/env node
import assert from "node:assert/strict";
import {mkdtemp,readFile,stat} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {AuditLog} from "../apps/browser/audit.mjs";

const missing=await mkdtemp(path.join(os.tmpdir(),"cieav-audit-missing-"));
await assert.rejects(
  ()=>new AuditLog(missing,{production:true,integrityKey:""}).load(),
  /OS-backed audit integrity key/,
  "managed production must fail closed without an injected audit key"
);

const managed=await mkdtemp(path.join(os.tmpdir(),"cieav-audit-managed-"));
const key="A".repeat(64);
const audit=await new AuditLog(managed,{production:true,integrityKey:key,maxBytes:1024*1024}).load();
await audit.append("ACTION_DETECTED",{requestId:"request-12345678",origin:"https://example.com",actionType:"financial.commit",risk:"CRITICAL"});
await audit.append("ACTION_COMMITTED",{requestId:"request-12345678",receiptId:"00000000-0000-4000-8000-000000000000",origin:"https://example.com",actionType:"financial.commit",risk:"CRITICAL"});
const verified=await audit.verify();
assert.equal(verified.ok,true);
assert.equal(verified.keyed,true);
assert.equal(verified.current.events,2);
await assert.rejects(stat(path.join(managed,"audit-integrity-key")),err=>err?.code==="ENOENT","managed production must not persist the audit key as plaintext");
const lines=(await readFile(path.join(managed,"audit-events.jsonl"),"utf8")).trim().split(/\r?\n/).map(JSON.parse);
assert.equal(lines[1].prevHash,lines[0].hash,"audit events must remain cryptographically chained");

const dev=await mkdtemp(path.join(os.tmpdir(),"cieav-audit-dev-"));
const fallback=await new AuditLog(dev,{production:false,integrityKey:""}).load();
await fallback.append("ACTION_CANCELLED",{requestId:"request-87654321",origin:"https://example.com",actionType:"data.submit",risk:"MEDIUM"});
assert((await readFile(path.join(dev,"audit-integrity-key"),"utf8")).trim().length>=43,"explicit development fallback should remain available");

console.log("CIEAV audit-key production boundary checks passed");
