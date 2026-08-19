#!/usr/bin/env node
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(path.join(root,p),"utf8");
const fail=m=>{console.error(`CIEAV OpenClaw consumer gate FAIL: ${m}`);process.exit(2)};
const need=(file,tokens)=>{const body=read(file);for(const token of tokens)if(!body.includes(token))fail(`${file} missing ${token}`);return body};
const forbid=(file,tokens)=>{const body=read(file).toLowerCase();for(const token of tokens)if(body.includes(token.toLowerCase()))fail(`${file} consumer path must not require ${token}`)};

const launcher=need("python/latch_platform/openclaw_cli.py",[
  '"mcp", "set", "cieav"',
  '"openclaw", "serve"',
  'mcp_main([',
  '"--ttl", "900"',
  'consumerDependencies": []',
  'openclaw-integration.json'
]);
need("python/cieav_platform/__main__.py",['args[0]=="openclaw"','openclaw_main(args[1:])']);
need("python/cieav_platform/openclaw_cli.py",["latch_platform.openclaw_cli"]);
need("python/latch_platform/mcp_launcher.py",["runtime","node.exe","CIEAV_AGENT_TOKEN","_SECRET_ENV"]);
need("packages/core/src/reality.ts",['allowedActionTypes.includes("*")']);
const installer=need("distribution/install.ps1",[
  "Try-ConnectOpenClaw",
  "CIEAV · OpenClaw detected; registering governed MCP boundary",
  "Consumer dependencies: none (runtime is bundled)",
  "cieav openclaw connect"
]);
if(!installer.includes("runtime/node.exe")||!installer.includes("bundled Node"))fail("PowerShell installer must verify bundled runtime Node");
forbid("python/latch_platform/openclaw_cli.py",["npm install","npm i ","npx ","pip install","pnpm add","yarn add"]);
forbid("distribution/install.ps1",["npm install","npm i ","npx ","pip install","pnpm add","yarn add"]);
if(!launcher.includes('"command": cieav'))fail("OpenClaw MCP config must execute installed CIEAV, not a package runner");
console.log("CIEAV OpenClaw consumer gate PASS · installed executable + bundled runtime · no npm/npx/pip consumer dependency");
