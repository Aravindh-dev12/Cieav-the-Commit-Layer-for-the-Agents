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

const server=read("apps/api/src/server.ts"),kernel=read("apps/api/src/agent-kernel.ts"),api=read("apps/api/src/agent-kernel-api.ts"),core=read("packages/core/src/agent-task.ts"),contracts=read("packages/contracts/src/agent-task.ts");
for(const token of ["CieavAgentKernelStore","CieavAgentKernelApi","recoverOnStartup","agentKernelProofGatedCompletion","await agentKernel?.close()"]){if(!server.includes(token))fail(`managed runtime integration missing: ${token}`)}
for(const token of ["durableReplace","fh.sync()","dh.sync()","bindCommitmentTrusted","bindProofTrusted","settleTrusted"]){if(!kernel.includes(token))fail(`durability/authority invariant missing: ${token}`)}
for(const token of ["trusted_authority_transition_required","handleGateway","proof_intent_mismatch","commitment_not_authorized","task.scopeDeviceId"]){if(!api.includes(token))fail(`trusted API invariant missing: ${token}`)}
for(const token of ["completion requires trusted proof settlement","settleAgentTask","PLANNING","RECOVERY_REQUIRED"]){if(!core.includes(token))fail(`task lifecycle invariant missing: ${token}`)}
for(const token of ["scopeDeviceId","intentId","proofCaseId","settlement","COMPLETED requires PROVEN settlement"]){if(!contracts.includes(token))fail(`task contract invariant missing: ${token}`)}

const npm=process.platform==="win32"?"npm.cmd":"npm";
const win=process.platform==="win32";
const command=win?(process.env.ComSpec||"cmd.exe"):npm;
const commandArgs=win?["/d","/s","/c",`${npm} run test:agent-kernel`]:["run","test:agent-kernel"];
const result=spawnSync(command,commandArgs,{cwd:ROOT,stdio:"inherit",shell:false});
if(result.error)throw result.error;
if(result.status!==0)fail(`test:agent-kernel exited ${result.status}`);
console.log(`CIEAV Agent Kernel release gate PASS · version=${version} · authority/proof/device-scope/durability verified`);
