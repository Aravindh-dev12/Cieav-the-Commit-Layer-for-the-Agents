#!/usr/bin/env node
import {readFile} from "node:fs/promises";

const wrapper=await readFile(new URL("../apps/browser/main.mjs",import.meta.url),"utf8");
const core=await readFile(new URL("../apps/browser/main-core.mjs",import.meta.url),"utf8");
const launch=await readFile(new URL("../apps/browser/chromium-launch.mjs",import.meta.url),"utf8");
const dashboard=await readFile(new URL("../apps/browser/dashboard.html",import.meta.url),"utf8");
const reality=await readFile(new URL("../apps/api/src/reality-api.ts",import.meta.url),"utf8");

for(const token of ["/api/reality","/api/lab/evaluate","authorized(req)","CIEAV_BROWSER_CONTROL_TOKEN","/v1/intents","/v1/open-loops","/v1/reality/approvals","/v1/proofs","/v1/business/plans"]){
  if(!wrapper.includes(token))throw new Error(`Control Center reality wrapper invariant missing: ${token}`);
}
for(const token of ["permitIssued!==false","approvalCreated!==false","sideEffects!==false","simulation!==true"]){
  if(!wrapper.includes(token))throw new Error(`Action Lab proxy fail-closed invariant missing: ${token}`);
}
if(!core.includes("Target.attachToTarget")||!core.includes("verifyAdapterProposal"))throw new Error("hardened browser core CDP/verification path was not preserved behind the Control Center wrapper");
if(!launch.includes('"--remote-debugging-pipe"')||!launch.includes("private-windows-handle-pipe")||!launch.includes("chromiumEnvironment"))throw new Error("private Chromium launch boundary was not preserved");
for(const token of ["Reality","Approvals","Open Loops & Recovery","Proof Mesh","Company Twin","Action Lab","/api/reality","/api/lab/evaluate","Simulation returned execution authority"]){
  if(!dashboard.includes(token))throw new Error(`Control Center UI invariant missing: ${token}`);
}
if(/\/approve|\/deny/.test(dashboard))throw new Error("browser dashboard must not expose trusted approval mutation routes");
if(!reality.includes("listApprovals(deviceId:string)")||!reality.includes("readOnly:true"))throw new Error("device-scoped approval listing is missing or not marked read-only");
if(!reality.includes('pathname==="/v1/reality/lab/evaluate"')||!reality.includes("permitIssued:false")||!reality.includes("approvalCreated:false"))throw new Error("server Action Lab no-mint invariant missing");
console.log("CIEAV Control Center reality checks passed: scoped visibility + read-only approvals + non-minting Action Lab");
