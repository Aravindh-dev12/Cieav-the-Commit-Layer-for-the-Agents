#!/usr/bin/env node
import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {Attention} from "../apps/browser/attention.mjs";

const dir=await mkdtemp(path.join(os.tmpdir(),"latch-debt-"));
let t=Date.now();
const clock=()=>t;
const m=(risk="MEDIUM",extra={})=>({actionType:"data.submit",risk,reversibility:"COMPENSABLE",confidence:.93,dataCategories:[],...extra});
try{
  const a=await new Attention(dir,{clock}).load();
  const origin="https://example.test";

  // Repeated, well-understood MEDIUM actions should stop consuming attention.
  let d=a.decide(origin,m());assert.equal(d.level,"SOFT");await a.record(origin,"data.submit","COMMITTED",{friction:"SOFT",decisionMs:1800});
  d=a.decide(origin,m());assert.equal(d.level,"SOFT");await a.record(origin,"data.submit","COMMITTED",{friction:"SOFT",decisionMs:1500});
  d=a.decide(origin,m());assert.equal(d.level,"PASSIVE","stable medium action should become passive");

  // Regret must immediately restore friction, but must not create permanent nagging.
  await a.record(origin,"data.submit","CANCELLED",{friction:"SOFT",decisionMs:1200});
  d=a.decide(origin,m());assert.equal(d.level,"SOFT");assert.ok(d.reasons.includes("recent_regret"));
  for(let i=0;i<3;i++){await a.record(origin,"data.submit","COMMITTED",{friction:"SOFT",decisionMs:1300});}
  d=a.decide(origin,m());assert.equal(d.level,"PASSIVE","regret should decay after safe recovery commits");

  // HIGH/CRITICAL never habituate away.
  const high={...m("HIGH"),actionType:"access.grant"};
  for(let i=0;i<10;i++){d=a.decide(origin,high);assert.equal(d.level,"HARD");await a.record(origin,"access.grant","COMMITTED",{friction:"HARD",decisionMs:1400});}
  assert.equal(a.decide(origin,high).level,"HARD");

  // Sensitive data never habituates even if nominal risk is lower.
  const sensitive={...m("MEDIUM"),actionType:"data.submit",dataCategories:["CREDENTIAL"]};
  assert.equal(a.decide(origin,sensitive).level,"HARD");

  // Rapid approvals are a habituation signal: do not suppress the warning; refocus it.
  const critical={...m("CRITICAL"),actionType:"financial.commit",reversibility:"IRREVERSIBLE",dataCategories:["FINANCIAL"]};
  for(let i=0;i<3;i++){d=a.decide("https://bank.test",critical);assert.equal(d.level,"HARD");await a.record("https://bank.test","financial.commit","COMMITTED",{friction:"HARD",decisionMs:250});}
  d=a.decide("https://bank.test",critical);assert.equal(d.level,"HARD");assert.equal(d.refocus,true,"rapid hard approvals should trigger refocus");assert.ok(d.reasons.includes("habituation_signal"));

  const report=a.report();
  assert.ok(report.fastApprovalRate>0);
  assert.ok(report.refocusActions>=1);
  assert.ok(["WATCH","HIGH","CRITICAL"].includes(report.level),`expected measurable debt, got ${report.level}`);
  console.log("LATCH cognitive-debt E2E passed",JSON.stringify(report));
} finally {await rm(dir,{recursive:true,force:true});}
