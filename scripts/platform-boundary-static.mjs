#!/usr/bin/env node
import {existsSync,readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(path.join(ROOT,p),"utf8");
const requireFile=p=>{if(!existsSync(path.join(ROOT,p)))throw new Error(`missing platform boundary file: ${p}`);return read(p)};
const has=(text,tokens,label)=>{for(const token of tokens)if(!text.includes(token))throw new Error(`${label} invariant missing: ${token}`)};
const lacks=(text,tokens,label)=>{for(const token of tokens)if(text.includes(token))throw new Error(`${label} forbidden token present: ${token}`)};
const checks=[];
const check=(name,fn)=>{try{const detail=fn()||"ok";checks.push({name,ok:true,detail});console.log(`PASS  ${name} · ${detail}`)}catch(error){checks.push({name,ok:false,detail:String(error?.message??error)});console.error(`FAIL  ${name} · ${error?.message??error}`)}};

check("agent-session isolation",()=>{
  const sessions=requireFile("apps/api/src/agent-sessions.ts"),server=requireFile("apps/api/src/server.ts"),mcp=requireFile("python/latch_platform/mcp_launcher.py"),a2a=requireFile("python/latch_platform/a2a_launcher.py");
  has(sessions,["tokenType:\"agent\"","allowedIntentIds","allowedActionTypes","maxRisk","sessionId"],"agent session");
  has(server,["agent_endpoint_required","agent_session_invalid_or_revoked","/v1/agent/"],"agent API boundary");
  has(mcp,["CIEAV_AGENT_TOKEN","env.pop(key,None)","/v1/agent-sessions"],"MCP launcher");
  has(a2a,["CIEAV_AGENT_TOKEN","CIEAV_A2A_CLIENT_TOKEN","/v1/agent-sessions"],"A2A launcher");
  lacks(mcp,["env[\"CIEAV_GATEWAY_TOKEN\"]"],"MCP child environment");
  return "short-lived scoped agent identity is distinct from Gateway authority";
});

check("proof trust boundary",()=>{
  const proof=requireFile("apps/api/src/proof-api.ts"),agent=requireFile("apps/api/src/agent-api.ts");
  has(agent,["AGENT_REPORT","/report"],"agent proof ingress");
  has(proof,["AGENT_REPORT","HUMAN_ATTESTATION","PROVEN"],"proof provenance");
  if(/AGENT_REPORT[\s\S]{0,250}RESOLVED/.test(proof))throw new Error("agent report appears able to settle a proof/open loop directly");
  return "agent observations cannot independently become trusted settlement evidence";
});

check("company twin trust boundary",()=>{
  const business=requireFile("apps/api/src/business-api.ts"),agent=requireFile("apps/api/src/agent-api.ts");
  has(agent,["/v1/agent/business/plans","AGENT_REPORT"],"Company Twin agent ingress");
  has(business,["reconcileBusinessReality","MISSING_EVIDENCE","Collect trusted evidence","RESOLVED"],"Company Twin reconciliation");
  return "desired state is reconciled continuously and requires trusted evidence";
});

check("enterprise policy monotonicity",()=>{
  const policy=requireFile("packages/core/src/policy.ts"),api=requireFile("apps/api/src/policy-api.ts"),reality=requireFile("apps/api/src/reality-api.ts");
  has(policy,["combineAuthorityDecisions","BLOCK","ASK","ALLOW"],"policy combiner");
  has(api,["OrganizationPolicySchema","evaluateEnterprisePolicy"],"enterprise policy API");
  has(reality,["evaluateProposal","authority_changed_after_approval","authority_revoked_before_commit","fresh_approval_required","proposalWasApproved"],"permit lifecycle policy recheck");
  const combine=policy.slice(policy.indexOf("combineAuthorityDecisions"));
  if(!combine.includes("BLOCK")||!combine.includes("ASK"))throw new Error("policy combiner does not preserve restrictive outcomes");
  return "enterprise policy can narrow authority and is rechecked immediately before commit";
});

check("governed recovery",()=>{
  const recovery=requireFile("packages/core/src/recovery.ts"),reality=requireFile("apps/api/src/reality-api.ts"),agent=requireFile("apps/api/src/agent-api.ts");
  has(recovery,["cieavRecoveryOpenLoopId","COMPENSATE","ESCALATE","UNDO"],"recovery proposal binding");
  has(reality,["markRecoveryCommitted","RECOVERING","awaiting independent CIEAV verification"],"recovery lifecycle");
  has(agent,["/recovery/evaluate","evaluateRecoveryProposal"],"agent recovery ingress");
  return "recovery is a fresh governed proposal and cannot self-settle";
});

check("MCP authority adapter",()=>{
  const mcp=requireFile("apps/mcp/src/index.ts");
  has(mcp,["CIEAV_AGENT_TOKEN","evaluate_action","claim_approved_permit","consume_permit","report_proof_observation","report_business_fact","evaluate_recovery"],"MCP tools");
  lacks(mcp,["CIEAV_GATEWAY_TOKEN","LATCH_GATEWAY_TOKEN"],"MCP runtime");
  return "MCP exposes scoped governance tools without Gateway authority";
});

check("A2A 1.0 loopback adapter",()=>{
  const a2a=requireFile("apps/a2a/src/index.mjs"),launcher=requireFile("python/latch_platform/a2a_launcher.py"),smoke=requireFile("scripts/a2a-e2e.mjs");
  has(a2a,["127.0.0.1","SendMessage","GetTask","1.0","CIEAV_A2A_CLIENT_TOKEN","CIEAV_AGENT_TOKEN","/.well-known/agent-card.json"],"A2A service");
  has(launcher,["CIEAV_A2A_CLIENT_TOKEN","0o600","127.0.0.1"],"A2A launcher");
  has(smoke,["SendMessage","TaskNotFound","actor"],"A2A smoke");
  return "A2A ingress is loopback-authenticated and uses separate inbound/outbound credentials";
});

check("Companion explicit authority",()=>{
  const companion=requireFile("python/latch_platform/companion_cli.py");
  has(companion,["--allow-action","--max-risk","--approval-at","--completion","--max-delegation-depth","--data-category","--max-amount","requireIndependentVerification","allowedActionTypes"],"Companion envelope");
  lacks(companion,["infer_authority","infer_permissions","generate_constraints"],"Companion authority");
  return "natural-language goals cannot silently enlarge explicit authority constraints";
});

check("Action Lab cannot mint",()=>{
  const lab=requireFile("python/latch_platform/lab_cli.py"),reality=requireFile("apps/api/src/reality-api.ts"),test=requireFile("apps/api/src/action-lab.test.ts");
  has(lab,["/v1/reality/lab/evaluate","simulation returned execution authority","permitIssued"],"Lab CLI");
  has(reality,["/v1/reality/lab/evaluate","simulation:true","sideEffects:false","permitIssued:false","approvalCreated:false"],"Lab API");
  has(test,["permitIssued","approvalCreated","approvals"],"Lab regression test");
  return "simulation shares policy evaluation but never issues executable authority";
});

check("Control Center scoped reality surface",()=>{
  const wrapper=requireFile("apps/browser/main.mjs"),core=requireFile("apps/browser/main-core.mjs"),dashboard=requireFile("apps/browser/dashboard.html"),reality=requireFile("apps/api/src/reality-api.ts"),smoke=requireFile("scripts/dashboard-reality-smoke.mjs");
  has(wrapper,["CORE_INVARIANTS","CORE_FORBIDDEN","/api/reality","/api/lab/evaluate","authorized(req)","/v1/reality/approvals","permitIssued!==false","approvalCreated!==false","await import(\"./main-core.mjs\")"],"Control Center wrapper");
  has(core,['"--remote-debugging-pipe"',"Target.attachToTarget","verifyAdapterProposal({","persistOutcome"],"preserved browser core");
  has(dashboard,["Intent Contracts","Approvals","Open Loops & Recovery","Proof Mesh","Company Twin","Action Lab","/api/reality","/api/lab/evaluate"],"Control Center UI");
  lacks(dashboard,["/approve","/deny"],"browser approval mutation");
  has(reality,["listApprovals(deviceId:string)","readOnly:true"],"device-scoped approvals");
  has(smoke,["scoped visibility","read-only approvals","non-minting Action Lab"],"Control Center regression");
  return "browser UI observes scoped reality and simulates policy without gaining trusted approval authority";
});

check("release bundle covers agent protocols",()=>{
  const build=requireFile("scripts/build-release-runtime.py"),pkg=JSON.parse(requireFile("package.json"));
  has(build,["verify_release_boundaries","releaseBoundaryVerified","canonicalNamespaceVerified","controlCenterRealityBoundaryVerified","apps/mcp/dist/index.js","apps/a2a/src/index.mjs","agentProtocols","bundleFormat\":6"],"release runtime");
  for(const script of ["test:a2a","test:dashboard-reality","build","typecheck","release:smoke:runtime","release:smoke:service"])if(!pkg.scripts?.[script])throw new Error(`package script missing: ${script}`);
  return "MCP, A2A, Control Center and canonical namespace boundaries participate in runtime packaging";
});

check("clean runtime qualification is mandatory",()=>{
  const smoke=requireFile("scripts/clean-runtime-smoke.py"),qualify=requireFile("scripts/qualify-release.mjs"),docs=requireFile("docs/release-qualification.md");
  has(smoke,["first-extract","releaseBoundaryVerified","windowsAuthenticode","macosCodeSign","cliSurfaces","relocation","cieav-runtime-smoke-"],"clean runtime smoke");
  has(qualify,["missing_matching_clean_runtime_smoke","runtimeSmokeSchema:1","rejectedRuntimeSmokes","windowsAuthenticode","macosCodeSign"],"cross-platform qualification");
  has(docs,["release:smoke:runtime","release:qualify","same version and Git commit"],"local qualification runbook");
  return "source PASS cannot qualify without matching clean extracted runtime evidence";
});

check("OS service lifecycle qualification is mandatory",()=>{
  const service=requireFile("scripts/service-lifecycle-smoke.py"),qualify=requireFile("scripts/qualify-release.mjs"),docs=requireFile("docs/release-qualification.md");
  has(service,["--confirm-service-mutation","Refusing to overwrite an existing CIEAV Gateway service","gateway\",\"install","gateway\",\"stop","gateway\",\"start","gateway\",\"restart","gateway\",\"uninstall","finally","cleanup","cieav-service-lifecycle-"],"service lifecycle smoke");
  has(qualify,["missing_matching_service_lifecycle_smoke","serviceLifecycleSchema:1","rejectedServiceLifecycles","serviceLifecycle"],"cross-platform service qualification");
  has(docs,["release:smoke:service","release:qualify:current","install → status → stop → start → restart → uninstall → cleanup"],"service lifecycle runbook");
  return "release qualification requires real per-user service install/start/restart/stop/uninstall evidence";
});

check("new secrets excluded from release evidence",()=>{
  const verify=requireFile("scripts/release-verify.mjs"),gate=requireFile("scripts/release-gate.mjs"),launchers=requireFile("python/latch_platform/a2a_launcher.py")+requireFile("python/latch_platform/mcp_launcher.py");
  has(launchers,["CIEAV_AGENT_TOKEN","CIEAV_A2A_CLIENT_TOKEN"],"ephemeral protocol secrets");
  has(gate,["CIEAV_AGENT_TOKEN","CIEAV_A2A_CLIENT_TOKEN","delete env[key]"],"release gate secret scrubbing");
  if(!verify.includes("sensitiveEnvKeys"))throw new Error("release verifier has no secret redaction list");
  return "release verification strips ephemeral protocol authority before spawning evidence commands";
});

const failed=checks.filter(x=>!x.ok);
console.log(`\nCIEAV platform boundary verification: ${failed.length?"FAIL":"PASS"} (${checks.length-failed.length}/${checks.length})`);
if(failed.length)process.exitCode=1;
