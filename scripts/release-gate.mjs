#!/usr/bin/env node
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const args=process.argv.slice(2);
const env={...process.env};
for(const key of [
  "CIEAV_AGENT_TOKEN","LATCH_AGENT_TOKEN","CIEAV_A2A_CLIENT_TOKEN","LATCH_A2A_CLIENT_TOKEN",
  "CIEAV_MCP_CLIENT_TOKEN","LATCH_MCP_CLIENT_TOKEN","CIEAV_AGENT_SESSION_TOKEN","LATCH_AGENT_SESSION_TOKEN"
]) delete env[key];

const boundary=spawnSync(process.execPath,[path.join(ROOT,"scripts/platform-boundary-static.mjs")],{cwd:ROOT,env,stdio:"inherit",shell:false});
if(boundary.error)throw boundary.error;
if(boundary.status!==0)process.exit(boundary.status??1);
const verify=spawnSync(process.execPath,[path.join(ROOT,"scripts/release-verify.mjs"),...args],{cwd:ROOT,env,stdio:"inherit",shell:false});
if(verify.error)throw verify.error;
process.exit(verify.status??1);
