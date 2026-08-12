#!/usr/bin/env node
import assert from "node:assert/strict";
import {mkdtemp,rm,readFile,writeFile,readdir,unlink} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {Attention,CognitiveDebtConstants} from "../apps/browser/attention.mjs";
import {AuditLog} from "../apps/browser/audit.mjs";

const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-debt-"));
let t=Date.now();
const clock=()=>t;
const m=(risk="MEDIUM",extra={})=>({requestId:`req-${Math.random()}`,actionType:"data.submit",risk,reversibility:"COMPENSABLE",confidence:.93,dataCategories:[],...extra});
const success={status:"OBSERVED_SUCCESS"},failure={status:"OBSERVED_FAILURE"},unknown={status:"UNKNOWN"};
try{
  const a=await new Attention(dir,{clock}).load();
  const origin="https://example.test";

  let d=a.decide(origin,m());assert.equal(d.level,"SOFT");await a.record(origin,"data.submit","COMMITTED",{friction:"SOFT",decisionMs:1800});
  d=a.decide(origin,m());assert.equal(d.level,"SOFT","unverified commit must not reduce friction");
  await a.outcome(origin,"data.submit",success);
  await a.record(origin,"data.submit","COMMITTED",{friction:"SOFT",decisionMs:1500});await a.outcome(origin,"data.submit",success);
  d=a.decide(origin,m());assert.equal(d.level,"PASSIVE","two verified successful medium actions may become passive");

  t+=CognitiveDebtConstants.SAFETY_MEMORY_MS+1;
  d=a.decide(origin,m());assert.equal(d.level,"SOFT","stale medium-risk safety memory must expire");assert.ok(d.reasons.includes("new_or_stale_pattern"));
  await a.record(origin,"data.submit","COMMITTED",{friction:"SOFT",decisionMs:1200});await a.outcome(origin,"data.submit",success);
  await a.record(origin,"data.submit","COMMITTED",{friction:"SOFT",decisionMs:1200});await a.outcome(origin,"data.submit",success);
  assert.equal(a.decide(origin,m()).level,"PASSIVE");

  await a.record(origin,"data.submit","COMMITTED",{friction:"PASSIVE"});await a.outcome(origin,"data.submit",unknown);
  d=a.decide(origin,m());assert.equal(d.level,"SOFT");assert.ok(d.reasons.includes("recent_unknown_outcome"));
  t+=CognitiveDebtConstants.ADVERSE_OUTCOME_WINDOW_MS+1;
  d=a.decide(origin,m());assert.equal(d.level,"SOFT");assert.ok(!d.reasons.includes("recent_unknown_outcome"));assert.ok(d.reasons.includes("new_or_stale_pattern"));

  await a.record(origin,"data.submit","COMMITTED",{friction:"SOFT",decisionMs:1100});await a.outcome(origin,"data.submit",failure);
  d=a.decide(origin,m());assert.equal(d.level,"SOFT");assert.ok(d.reasons.includes("recent_failed_outcome"));

  await a.record(origin,"data.submit","CANCELLED",{friction:"SOFT",decisionMs:1200});
  d=a.decide(origin,m());assert.equal(d.level,"SOFT");assert.ok(d.reasons.includes("recent_regret"));
  for(let i=0;i<3;i++){await a.record(origin,"data.submit","COMMITTED",{friction:"SOFT",decisionMs:1300});d=a.decide(origin,m());assert.equal(d.level,"SOFT","unverified recovery commit must not clear regret");await a.outcome(origin,"data.submit",success);}
  d=a.decide(origin,m());assert.equal(d.level,"PASSIVE","regret may decay after verified recovery successes");

  const high={...m("HIGH"),actionType:"access.grant"};
  for(let i=0;i<5;i++){d=a.decide(origin,high);assert.equal(d.level,"HARD");await a.record(origin,"access.grant","COMMITTED",{friction:"HARD",decisionMs:1400});await a.outcome(origin,"access.grant",success)}
  assert.equal(a.decide(origin,high).level,"HARD");
  const sensitive={...m("MEDIUM"),actionType:"data.submit",dataCategories:["CREDENTIAL"]};assert.equal(a.decide(origin,sensitive).level,"HARD");

  await a.mode("quiet");const qOrigin="https://quiet.test";d=a.decide(qOrigin,m("MEDIUM",{confidence:.55,reversibility:"UNKNOWN"}));assert.equal(d.level,"SOFT");assert.ok(d.reasons.includes("unknown_reversibility"));assert.ok(d.reasons.includes("low_confidence"));await a.mode("balanced");

  const critical={...m("CRITICAL"),actionType:"financial.commit",reversibility:"IRREVERSIBLE",dataCategories:["FINANCIAL"]};
  for(let i=0;i<3;i++){d=a.decide("https://bank.test",critical);assert.equal(d.level,"HARD");await a.record("https://bank.test","financial.commit","COMMITTED",{friction:"HARD",decisionMs:250});await a.outcome("https://bank.test","financial.commit",success)}
  d=a.decide("https://bank.test",critical);assert.equal(d.level,"HARD");assert.equal(d.refocus,true);assert.ok(d.reasons.includes("habituation_signal"));

  const report=a.report();assert.ok(report.fastApprovalRate>0);assert.ok(report.refocusActions>=1);assert.ok(Number.isFinite(report.unknownOutcomeRate));assert.ok(["WATCH","HIGH","CRITICAL"].includes(report.level));

  await a.audit.flush();
  const auditPath=path.join(dir,"audit-events.jsonl"),audit=await readFile(auditPath,"utf8");
  assert.match(audit,/ACTION_DETECTED/);assert.match(audit,/ACTION_COMMITTED/);assert.match(audit,/OUTCOME_OBSERVED/);assert.match(audit,/"version":3/);assert.match(audit,/"algorithm":"HMAC-SHA256"/);assert.match(audit,/"prevHash":"[0-9a-f]{64}"/);assert.match(audit,/"hash":"[0-9a-f]{64}"/);assert.doesNotMatch(audit,/password|cardNumber|rawFormValue/i);
  const verified=await a.audit.verify();assert.equal(verified.ok,true);assert.equal(verified.keyed,true);assert.equal(verified.format,"hmac-sha256-chain-v3");

  await writeFile(auditPath,audit.replace("ACTION_COMMITTED","ACTION_COMMITTEZ"),"utf8");
  await assert.rejects(()=>new AuditLog(dir).load(),/authentication failed|chain mismatch/i);
  await writeFile(auditPath,audit,"utf8");

  // Force rotation and prove the current segment is linked to retained previous history.
  const rotateDir=await mkdtemp(path.join(os.tmpdir(),"cieav-audit-rotate-"));
  try{
    const log=await new AuditLog(rotateDir,{maxBytes:1}).load();
    await log.append("ACTION_DETECTED",{origin:"https://rotate.test",actionType:"data.submit",risk:"MEDIUM"});
    await log.append("ACTION_COMMITTED",{origin:"https://rotate.test",actionType:"data.submit",risk:"MEDIUM"});
    const rotation=await log.verify();assert.equal(rotation.previous.present,true);assert.equal(rotation.current.present,true);assert.equal(rotation.current.anchorHash,rotation.previous.lastHash);
    await unlink(path.join(rotateDir,"audit-events.previous.jsonl"));
    await assert.rejects(()=>new AuditLog(rotateDir).load(),/chain mismatch/i,"deleting retained previous history must invalidate the linked current segment");
  } finally {await rm(rotateDir,{recursive:true,force:true})}

  // Old pre-v5 state must not carry lifetime debt/safe-learning into the new epoch.
  const migrateDir=await mkdtemp(path.join(os.tmpdir(),"cieav-debt-migrate-"));
  try{
    await writeFile(path.join(migrateDir,"attention.json"),JSON.stringify({version:4,mode:"balanced",origins:{"https://old.test::data.submit":{seen:99,safeCommitStreak:20,hardShown:9,softShown:40,passiveShown:50,fastApprovalStreak:8,promptedDecisions:30,fastApprovals:28,decisionMsTotal:3000}},stats:{analyzed:99,hard:9,soft:40,passive:50,fastApprovals:28}}),"utf8");
    const migrated=await new Attention(migrateDir,{clock}).load();const h=migrated.h("https://old.test","data.submit");
    assert.equal(migrated.s.migratedDebtEpoch,true);assert.equal(migrated.s.stats.analyzed,0);assert.equal(h.safeCommitStreak,0);assert.equal(h.fastApprovalStreak,0);assert.equal(migrated.decide("https://old.test",m()).level,"SOFT");
  } finally {await rm(migrateDir,{recursive:true,force:true})}

  await writeFile(path.join(dir,"attention.json"),"{not-json","utf8");
  const recovered=await new Attention(dir,{clock}).load();assert.equal(recovered.s.mode,"strict");assert.equal(recovered.s.recoveredFromCorruptState,true);const files=await readdir(dir);assert.ok(files.some(x=>x.startsWith("attention.corrupt.")));assert.equal(recovered.decide("https://fresh.test",m("MEDIUM")).level,"HARD");

  console.log("CIEAV cognitive-debt/audit E2E passed",JSON.stringify(report));
} finally {await rm(dir,{recursive:true,force:true});}
