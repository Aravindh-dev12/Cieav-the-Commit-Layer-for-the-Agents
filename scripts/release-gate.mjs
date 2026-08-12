#!/usr/bin/env node
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const args=process.argv.slice(2),env={...process.env};
for(const key of ["CIEAV_AGENT_TOKEN","LATCH_AGENT_TOKEN","CIEAV_A2A_CLIENT_TOKEN","LATCH_A2A_CLIENT_TOKEN","CIEAV_MCP_CLIENT_TOKEN","LATCH_MCP_CLIENT_TOKEN","CIEAV_AGENT_SESSION_TOKEN","LATCH_AGENT_SESSION_TOKEN"])delete env[key];
const run=(file,extra=[])=>{const r=spawnSync(process.execPath,[file,...extra],{cwd:ROOT,env,stdio:"inherit",shell:false});if(r.error)throw r.error;if(r.status!==0)process.exit(r.status??1)};
run(path.join(ROOT,"scripts/platform-boundary-static.mjs"));
run("--check",[path.join(ROOT,"apps/browser/main.mjs")]);
run("--check",[path.join(ROOT,"apps/browser/main-core.mjs")]);
run("--check",[path.join(ROOT,"scripts/dashboard-reality-smoke.mjs")]);
run(path.join(ROOT,"scripts/release-verify.mjs"),args);
