#!/usr/bin/env node
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(path.join(ROOT,p),"utf8");
const requireTokens=(p,tokens)=>{const s=read(p);for(const t of tokens)if(!s.includes(t))throw new Error(`${p} missing consequence-intelligence invariant: ${t}`);return s};

requireTokens("ARCHITECTURE.md",[
  "Consequence Intelligence Framework","Intelligence State","Cognitive Scheduler","Consequence Compiler","Consequence Graph","Verified Skills","Authorized Outcome Trajectory","MODEL AUTHORITY = 0","installed, not opened",
]);
const contracts=requireTokens("packages/contracts/src/consequence-intelligence.ts",[
  "CIEAV_INTELLIGENCE_STATE_V1","CIEAV_CONSEQUENCE_PROGRAM_V1","CIEAV_COGNITIVE_PROGRAM_V1","CIEAV_AUTHORIZED_OUTCOME_TRAJECTORY_V2","ProofProviderDescriptorSchema","LearningProviderDescriptorSchema","authority:z.literal(false)","productionAuthority:z.literal(false)","SUCCESS","FAILURE","UNKNOWN",
]);
const core=requireTokens("packages/core/src/consequence-intelligence.ts",[
  "rankConsequencePaths","buildBaselineCognitiveProgram","evaluateTrajectoryEligibility","unknown_is_training_signal_not_success","CONSEQUENCE_INTELLIGENCE_AUTHORITY=false","CONSEQUENCE_INTELLIGENCE_MAY_MINT_EXECUTION_AUTHORITY=false",
]);
requireTokens("packages/core/src/consequence-intelligence.test.ts",[
  "prefers a scoped, provable and reversible route","respects LOCAL_ONLY privacy","preserves UNKNOWN","outside execution authority",
]);
const injected=requireTokens("apps/browser/injected.js",[
  "NOTIFICATION_ONLY=!AUTO","if(NOTIFICATION_ONLY)return Promise.resolve({choice:\"cancel\",decisionMs:0})","status:\"CANCELLED\"",
]);
requireTokens("apps/browser/main.mjs",[
  "CIEAV_UI_MODE","notification-only","CIEAV_HEADLESS","about:blank","native-notify.mjs",
]);
requireTokens("apps/browser/native-notify.mjs",[
  "CIEAV_NOTIFICATIONS","powershell.exe","NotifyIcon","WindowStyle","Hidden",
]);

for(const forbidden of ["mintPermit(","mintExecutionTicket(","signCommit(","issueCredentialLease("]){
  if(core.includes(forbidden))throw new Error(`intelligence core contains forbidden authority primitive: ${forbidden}`);
}
if(!contracts.includes("mayMintExecutionAuthority:z.literal(false)"))throw new Error("Intelligence State is not explicitly prohibited from minting execution authority");
if(!injected.includes("if(NOTIFICATION_ONLY)return;"))throw new Error("notification-only runtime may still render in-page toast UI");

console.log("CIEAV consequence intelligence static gate PASS - contracts + deterministic baseline + UNKNOWN preservation + authority=false + background fail-closed UX");
