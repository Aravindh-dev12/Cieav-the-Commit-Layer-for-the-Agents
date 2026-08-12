#!/usr/bin/env node
import assert from "node:assert/strict";
import {mkdtemp,rm,readFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {Attention} from "../apps/browser/attention.mjs";

const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-debt-"));
let t=Date.now();
const clock=()=>t;
const m=(risk="MEDIUM",extra={})=>({requestId:`req-${Math.random()}`,actionType:"data.submit",risk,reversibility:"COMPENSABLE",confidence:.93,dataCategories:[],...extra});
const success={status:"OBSERVED_SUCCESS"},failure={status:"OBSERVED_FAILURE"},unknown={status:"UNKNOWN"};
try{
  const a=await new Attention(dir,{clock}).load();
  const origin="https://example.test";

  // Dispatch alone must never teach CIEAV that an action is safe.
  let d=a.decide(origin,m());assert.equal(d.level,"SOFT");await a.record(origin,"data.submit","COMMITTED",{friction:"SOFT",decisionMs:1800});
  d=a.decide(origin,m());assert.equal(d.level,"SOFT","unverified commit must not reduce friction");
  await a.outcome(origin,"data.submit",success);
  await a.record(origin,"data.submit","COMMITTED",{friction:"SOFT",decisionMs:1500});
  await a.outcome(origin,"data.submit",success);
  d=a.decide(origin,m());assert.equal(d.level,"PASSIVE","two verified successful medium actions may become passive");

  // Unknown outcome destroys learned safety and must restore friction.
  await a.record(origin,"data.submit","COMMITTED",{friction:"PASSIVE"});await a.outcome(origin,"data.submit",unknown);
  d=a.decide(origin,m());assert.equal(d.level,"SOFT");assert.ok(d.reasons.includes("recent_unknown_outcome"));

  // Failure must also restore friction and clear the safe streak.
  await a.record(origin,"data.submit","COMMITTED",{friction:"SOFT",decisionMs:1100});await a.outcome(origin,"data.submit",failure);
  d=a.decide(origin,m());assert.equal(d.level,"SOFT");assert.ok(d.reasons.includes("recent_failed_outcome"));

  // Regret immediately restores friction; recovery requires VERIFIED successes, not dispatches.
  await a.record(origin,"data.submit","CANCELLED",{friction:"SOFT",decisionMs:1200});
  d=a.decide(origin,m());assert.equal(d.level,"SOFT");assert.ok(d.reasons.includes("recent_regret"));
  for(let i=0;i<3;i++){await a.record(origin,"data.submit","COMMITTED",{friction:"SOFT",decisionMs:1300});d=a.decide(origin,m());assert.equal(d.level,"SOFT","unverified recovery commit must not clear regret");await a.outcome(origin,"data.submit",success);}
  d=a.decide(origin,m());assert.equal(d.level,"PASSIVE","regret may decay after verified recovery successes");

  // HIGH/CRITICAL never habituate away.
  const high={...m("HIGH"),actionType:"access.grant"};
  for(let i=0;i<5;i++){d=a.decide(origin,high);assert.equal(d.level,"HARD");await a.record(origin,"access.grant","COMMITTED",{friction:"HARD",decisionMs:1400});await a.outcome(origin,"access.grant",success)}
  assert.equal(a.decide(origin,high).level,"HARD");

  // Sensitive data never habituates even if nominal risk is lower.
  const sensitive={...m("MEDIUM"),actionType:"data.submit",dataCategories:["CREDENTIAL"]};
  assert.equal(a.decide(origin,sensitive).level,"HARD");

  // Quiet mode is not a safety bypass for novel/uncertain medium actions.
  await a.mode("quiet");
  const qOrigin="https://quiet.test";
  d=a.decide(qOrigin,m("MEDIUM",{confidence:.55,reversibility:"UNKNOWN"}));
  assert.equal(d.level,"SOFT");assert.ok(d.reasons.includes("unknown_reversibility"));assert.ok(d.reasons.includes("low_confidence"));
  await a.mode("balanced");

  // Rapid approvals are a habituation signal: do not suppress the warning; refocus it.
  const critical={...m("CRITICAL"),actionType:"financial.commit",reversibility:"IRREVERSIBLE",dataCategories:["FINANCIAL"]};
  for(let i=0;i<3;i++){d=a.decide("https://bank.test",critical);assert.equal(d.level,"HARD");await a.record("https://bank.test","financial.commit","COMMITTED",{friction:"HARD",decisionMs:250});await a.outcome("https://bank.test","financial.commit",success)}
  d=a.decide("https://bank.test",critical);assert.equal(d.level,"HARD");assert.equal(d.refocus,true);assert.ok(d.reasons.includes("habituation_signal"));

  const report=a.report();
  assert.ok(report.fastApprovalRate>0);assert.ok(report.refocusActions>=1);assert.ok(Number.isFinite(report.unknownOutcomeRate));
  assert.ok(["WATCH","HIGH","CRITICAL"].includes(report.level),`expected measurable debt, got ${report.level}`);

  // Audit must contain lifecycle evidence and no raw page/form payloads.
  await a.audit.flush();
  const audit=await readFile(path.join(dir,"audit-events.jsonl"),"utf8");
  assert.match(audit,/ACTION_DETECTED/);assert.match(audit,/ACTION_COMMITTED/);assert.match(audit,/OUTCOME_OBSERVED/);
  assert.doesNotMatch(audit,/password|cardNumber|rawFormValue/i);
  console.log("CIEAV cognitive-debt E2E passed",JSON.stringify(report));
} finally {await rm(dir,{recursive:true,force:true});}
