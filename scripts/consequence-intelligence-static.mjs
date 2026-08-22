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
const providerContracts=requireTokens("packages/contracts/src/provider-runtime.ts",[
  "ProofObservationRequestSchema","ProofProviderResultSchema","LearningJobRequestSchema","LearningJobResultSchema","candidateMustRemainUnqualified:z.literal(true)","candidateQualified:z.literal(false)","promotionExecuted:z.literal(false)","mayMintExecutionAuthority:z.literal(false)",
]);
const core=requireTokens("packages/core/src/consequence-intelligence.ts",[
  "rankConsequencePaths","buildBaselineCognitiveProgram","evaluateTrajectoryEligibility","unknown_is_training_signal_not_success","CONSEQUENCE_INTELLIGENCE_AUTHORITY=false","CONSEQUENCE_INTELLIGENCE_MAY_MINT_EXECUTION_AUTHORITY=false",
]);
const graph=requireTokens("packages/core/src/consequence-graph.ts",[
  "CIEAV_CONSEQUENCE_GRAPH_V1","consequence_graph_requires_cryptographically_verified_trajectory","unknownRate","proofability","authorityGradeCoverage","realityBoundCoverage","authority:false","mayMintExecutionAuthority:false",
]);
const providers=requireTokens("packages/core/src/provider-runtime.ts",[
  "ProofProviderRegistry","LearningProviderRegistry","proof_provider_must_have_zero_authority","learning_provider_must_have_zero_authority","learning_request_authority_invariant_violation","learning_provider_result_authority_invariant_violation",
]);
const epistemic=requireTokens("packages/core/src/epistemic-state.ts",[
  "CIEAV_EPISTEMIC_STATE_V1","stale_epistemic_update","CONTRADICTED","STALE","authority:false","mayMintExecutionAuthority:false",
]);
requireTokens("packages/core/src/consequence-intelligence.test.ts",[
  "prefers a scoped, provable and reversible route","respects LOCAL_ONLY privacy","preserves UNKNOWN","outside execution authority",
]);
requireTokens("packages/core/src/consequence-graph.test.ts",[
  "rejects unverified trajectories","preserves SUCCESS FAILURE and UNKNOWN independently","authority-grade and reality-bound coverage","prefers well-proven successful transitions",
]);
requireTokens("packages/core/src/provider-runtime.test.ts",[
  "zero-authority provider","fails closed on provider identity mismatch","keeps successful training artifacts unqualified","rejects unsupported learning methods",
]);
requireTokens("packages/core/src/epistemic-state.test.ts",[
  "rejects older observations","marks claims stale","contradictory evidence","remains non-authoritative",
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
requireTokens("scripts/configure-xampp-receipt-store.ps1",[
  "Get-FileHash -Algorithm SHA256","cdp-win-bridge-$sourceHash.exe","Reusing versioned Windows private CDP bridge","CIEAV_CDP_WIN_BRIDGE",
]);
requireTokens("python/latch_platform/service.py",[
  "CIEAV_CDP_WIN_BRIDGE","CIEAV_UI_MODE","CIEAV_HEADLESS","CIEAV_START_URL","CIEAV_NOTIFICATIONS",
]);
requireTokens("apps/api/src/store/file.test.ts",[
  "beforeEach(()=>{process.env.CIEAV_RECEIPT_STORE=\"sqlite\"})","originalReceiptStore","delete process.env.CIEAV_RECEIPT_STORE",
]);

for(const source of [core,graph,providers,epistemic])for(const forbidden of ["mintPermit(","mintExecutionTicket(","signCommit(","issueCredentialLease("]){
  if(source.includes(forbidden))throw new Error(`intelligence code contains forbidden authority primitive: ${forbidden}`);
}
if(!contracts.includes("mayMintExecutionAuthority:z.literal(false)"))throw new Error("Intelligence State is not explicitly prohibited from minting execution authority");
if(!providerContracts.includes("productionAuthority:z.literal(false)"))throw new Error("Learning provider result is not explicitly prohibited from production authority");
if(!injected.includes("if(NOTIFICATION_ONLY)return;"))throw new Error("notification-only runtime may still render in-page toast UI");

console.log("CIEAV consequence intelligence static gate PASS - contracts + deterministic routing + epistemic freshness + consequence graph + provider isolation + UNKNOWN preservation + authority=false + background fail-closed UX + hermetic SQLite tests + versioned Windows bridge deployment");
