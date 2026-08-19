#!/usr/bin/env node
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(path.join(ROOT,p),"utf8"),fail=m=>{console.error(`CIEAV credential/hardware admin gate FAIL: ${m}`);process.exit(2)};
const expectTokens=(file,tokens)=>{const body=read(file);for(const token of tokens)if(!body.includes(token))fail(`${file} missing invariant: ${token}`)};
expectTokens("apps/api/src/credential-hardware-admin-api.ts",["/v1/agent-kernel/credential-authority","rawVerifiedAttestationImport:false","CieavSecureEnclaveAttestor","CieavWindowsTpmMaaCollector","linux_hardware_attestation_verifier_required"]);
expectTokens("apps/api/src/agent-kernel-api.ts",["CieavCredentialHardwareAdminApi","this.credentialHardwareAdmin=new CieavCredentialHardwareAdminApi(store)","const admin=await this.credentialHardwareAdmin.handle(req,pathname)"]);
expectTokens("apps/api/src/server.ts",["gatewayKernelPath=url.pathname.startsWith(\"/v1/agent-kernel\")","if(agentKernelApi&&gatewayKernelPath&&gatewayAuth(req))","const handled=await agentKernelApi.handleGateway(req,url.pathname)"]);
expectTokens("apps/api/src/credential-hardware-admin-api.test.ts",["mounts software credential lifecycle only beneath the Agent Kernel gateway namespace","raw verified hardware evidence cannot be imported","Linux hardware assurance fail-closed","does not allow registration without verifier-produced attestation evidence"]);
const npm=process.platform==="win32"?"npm.cmd":"npm";
function run(args){const exe=process.platform==="win32"?(process.env.ComSpec||"cmd.exe"):npm,finalArgs=process.platform==="win32"?["/d","/s","/c",`${npm} ${args.join(" ")}`]:args,r=spawnSync(exe,finalArgs,{cwd:ROOT,stdio:"inherit",shell:false});if(r.error)throw r.error;if(r.status!==0)fail(`${npm} ${args.join(" ")} exited ${r.status}`)}
run(["run","build:api"]);
run(["run","test","-w","@cieav/api","--","credential-hardware-admin-api.test.ts"]);
console.log(`CIEAV credential/hardware admin gate PASS · platform=${process.platform} · Gateway-only lifecycle + verifier-produced hardware evidence + Linux fail-closed boundary verified`);
