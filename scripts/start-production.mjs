#!/usr/bin/env node
import crypto from "node:crypto";
import {spawn,spawnSync} from "node:child_process";
import {access} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const apiBuild=path.join(root,"apps/api/dist/server.js");
try{await access(apiBuild)}catch{throw new Error("Production API is not built. Run npm run build:api first.")}

function usable(cmd){const r=spawnSync(cmd,["--version"],{stdio:"ignore",shell:false});return !r.error&&r.status===0}
function strongCapability(value){return typeof value==="string"&&value.length>=43?value:crypto.randomBytes(48).toString("base64url")}
const env={...process.env,CIEAV_HOME:process.env.CIEAV_HOME||root,PYTHONPATH:[path.join(root,"python"),process.env.PYTHONPATH].filter(Boolean).join(path.delimiter)};
env.CIEAV_BROWSER_CONTROL_TOKEN=strongCapability(env.CIEAV_BROWSER_CONTROL_TOKEN);
env.CIEAV_BROWSER_OBSERVATION_TOKEN=strongCapability(env.CIEAV_BROWSER_OBSERVATION_TOKEN);
if(env.CIEAV_BROWSER_CONTROL_TOKEN===env.CIEAV_BROWSER_OBSERVATION_TOKEN)env.CIEAV_BROWSER_OBSERVATION_TOKEN=crypto.randomBytes(48).toString("base64url");
let command,args;
if(process.env.CIEAV_EXECUTABLE){command=process.env.CIEAV_EXECUTABLE;args=["gateway","run"]}
else{
  const candidates=[process.env.CIEAV_PYTHON,process.env.PYTHON,process.platform==="win32"?"python":"python3","python"].filter(Boolean);
  command=candidates.find(usable);
  if(!command)throw new Error("Python 3.11+ is required for repository-mode production startup. Packaged CIEAV releases use the bundled cieav executable instead.");
  args=["-m","latch_platform.cli","gateway","run"];
}

console.log(`CIEAV production start · control plane=${command} · root=${root}`);
const gateway=spawn(command,args,{cwd:root,stdio:"inherit",env,shell:false});
let stopping=false;
function stop(signal="SIGTERM"){
  if(stopping)return;stopping=true;
  try{gateway.kill(signal)}catch{}
}
for(const sig of ["SIGINT","SIGTERM"])process.on(sig,()=>stop(sig));
gateway.on("exit",code=>{process.exitCode=code??0});
gateway.on("error",err=>{console.error("CIEAV production control plane failed:",err.message);process.exitCode=1});
