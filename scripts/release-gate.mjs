#!/usr/bin/env node
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const args=process.argv.slice(2),env={...process.env};
const sensitiveKeys=[
  "CIEAV_AGENT_TOKEN","LATCH_AGENT_TOKEN","CIEAV_A2A_CLIENT_TOKEN","LATCH_A2A_CLIENT_TOKEN",
  "CIEAV_MCP_CLIENT_TOKEN","LATCH_MCP_CLIENT_TOKEN","CIEAV_AGENT_SESSION_TOKEN","LATCH_AGENT_SESSION_TOKEN",
  "HF_TOKEN","HUGGING_FACE_HUB_TOKEN","OPENAI_API_KEY","CIEAV_CLOUD_TOKEN","LATCH_CLOUD_TOKEN",
  "CIEAV_GATEWAY_TOKEN","LATCH_GATEWAY_TOKEN","CIEAV_BROWSER_CONTROL_TOKEN","LATCH_BROWSER_CONTROL_TOKEN",
  "JWT_SECRET","RECEIPT_SIGNING_SECRET","CIEAV_LOCAL_API_SECRET",
  "CIEAV_RELEASE_SIGNING_PRIVATE_KEY_B64","RELEASE_SIGNING_PRIVATE_KEY_B64",
  "CIEAV_WINDOWS_CODE_SIGN_PFX_B64","CIEAV_WINDOWS_CODE_SIGN_PFX_PASSWORD","WINDOWS_PFX_B64","WINDOWS_PFX_PASSWORD",
  "CIEAV_MACOS_DEVELOPER_ID_P12_B64","CIEAV_MACOS_DEVELOPER_ID_P12_PASSWORD","MACOS_CERT_P12_B64","MACOS_CERT_PASSWORD",
  "CIEAV_APPLE_NOTARY_KEY_B64","APPLE_NOTARY_KEY_B64"
];
for(const key of sensitiveKeys)delete env[key];
env.PYTHONPYCACHEPREFIX=path.join(ROOT,"release","reports","pycache");
const run=(file,extra=[])=>{const r=spawnSync(process.execPath,[file,...extra],{cwd:ROOT,env,stdio:"inherit",shell:false});if(r.error)throw r.error;if(r.status!==0)process.exit(r.status??1)};
run(path.join(ROOT,"scripts/platform-boundary-static.mjs"));
run(path.join(ROOT,"scripts/package-namespace-smoke.mjs"));
run(path.join(ROOT,"scripts/release-workflow-static.mjs"));
run("--check",[path.join(ROOT,"apps/browser/main.mjs")]);
run("--check",[path.join(ROOT,"apps/browser/main-core.mjs")]);
run("--check",[path.join(ROOT,"scripts/dashboard-reality-smoke.mjs")]);
if(!args.includes("--plan"))run(path.join(ROOT,"scripts/agent-kernel-release.mjs"));
run(path.join(ROOT,"scripts/release-verify.mjs"),args);
if(!args.includes("--plan"))run(path.join(ROOT,"scripts/attest-platform-gate.mjs"),args);
