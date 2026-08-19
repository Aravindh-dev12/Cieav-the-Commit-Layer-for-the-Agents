#!/usr/bin/env node
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(path.join(ROOT,p),"utf8");
const fail=m=>{console.error(`CIEAV Agent Kernel release gate FAIL: ${m}`);process.exit(2)};
const pkg=JSON.parse(read("package.json")),py=read("pyproject.toml"),env=read(".env.example"),pyInit=read("python/cieav_platform/__init__.py"),legacyInit=read("python/latch_platform/__init__.py");
const version=pkg.version;
if(version!=="0.8.0")fail(`root version is ${version}, expected 0.8.0`);
if(!py.includes(`version = "${version}"`))fail("pyproject version drift");
if(!env.includes(`CIEAV_VERSION=${version}`))fail(".env.example version drift");
if(!pyInit.includes(`__version__ = "${version}"`))fail("cieav_platform fallback version drift");
if(!legacyInit.includes(`__version__ = "${version}"`))fail("latch compatibility version drift");

const server=read("apps/api/src/server.ts"),kernel=read("apps/api/src/agent-kernel.ts"),api=read("apps/api/src/agent-kernel-api.ts"),core=read("packages/core/src/agent-task.ts"),contracts=read("packages/contracts/src/agent-task.ts"),intentReality=read("apps/api/src/intent-reality.ts"),intentRealityCore=read("packages/core/src/intent-reality.ts"),intentRealityContracts=read("packages/contracts/src/intent-reality.ts"),mcp=read("apps/mcp/src/index.ts"),a2a=read("apps/a2a/src/index.mjs");
for(const token of ["CieavAgentKernelStore","CieavAgentKernelApi","recoverOnStartup","agentKernelProofGatedCompletion","await agentKernel?.close()"]){if(!server.includes(token))fail(`managed runtime integration missing: ${token}`)}
for(const token of ["durableReplace","fh.sync()","dh.sync()","bindCommitmentTrusted","bindProofTrusted","settleTrusted","intentReality"]){if(!kernel.includes(token))fail(`durability/authority invariant missing: ${token}`)}
for(const token of ["trusted_authority_transition_required","handleGateway","proof_intent_mismatch","commitment_not_authorized","task.scopeDeviceId","trusted_pre_state_witness_required","trusted_current_state_witness_required","effect_reconciliation_required"]){if(!api.includes(token))fail(`trusted API invariant missing: ${token}`)}
for(const token of ["completion requires trusted proof settlement","settleAgentTask","PLANNING","RECOVERY_REQUIRED"]){if(!core.includes(token))fail(`task lifecycle invariant missing: ${token}`)}
for(const token of ["scopeDeviceId","intentId","proofCaseId","settlement","COMPLETED requires PROVEN settlement"]){if(!contracts.includes(token))fail(`task contract invariant missing: ${token}`)}
for(const token of ["INVALIDATED_REALITY_CHANGED","EffectQuarantineSchema","IntentAttenuationWitnessSchema","AutonomyCandidateSchema","RealityStateWitnessSchema"]){if(!intentRealityContracts.includes(token))fail(`intent-to-reality contract missing: ${token}`)}
for(const token of ["reality_changed_since_authorization","delegation_widens_authority","cieavSemanticEffect","autonomy_expansion_safety_replay_failed","mixed_authority_change_requires_separate_candidates"]){if(!intentRealityCore.includes(token))fail(`intent-to-reality core invariant missing: ${token}`)}
for(const token of ["effect_quarantined","consequence_drift_budget_exceeded","startup_expired_unconsumed_commit","saveStateWitness","retryBlockForTask","AUTO_CONTRACTED"]){if(!intentReality.includes(token))fail(`durable intent-to-reality invariant missing: ${token}`)}
for(const token of ["preStateWitnessId","currentStateWitnessId","prepare_reality_commit","consume_reality_commit"]){if(!mcp.includes(token))fail(`MCP intent-to-reality integration missing: ${token}`);if(!a2a.includes(token))fail(`A2A intent-to-reality integration missing: ${token}`)}

const npm=process.platform==="win32"?"npm.cmd":"npm";
const run=script=>{const win=process.platform==="win32",command=win?(process.env.ComSpec||"cmd.exe"):npm,args=win?["/d","/s","/c",`${npm} run ${script}`]:["run",script],result=spawnSync(command,args,{cwd:ROOT,stdio:"inherit",shell:false});if(result.error)throw result.error;if(result.status!==0)fail(`${script} exited ${result.status}`)};
run("test:agent-kernel");
run("test:intent-reality");
console.log(`CIEAV Agent Kernel release gate PASS · version=${version} · authority/proof/device-scope/durability/intent-to-reality invariants verified`);
