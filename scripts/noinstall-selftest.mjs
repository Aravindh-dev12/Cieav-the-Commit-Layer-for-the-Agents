import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");function run(cmd,args,opts={}){const result=spawnSync(cmd,args,{cwd:root,stdio:"inherit",...opts});if(result.status!==0)process.exit(result.status??1)}
for(const file of ["apps/browser/main.mjs","apps/browser/injected.js","scripts/browser-e2e.mjs","apps/api/standalone.mjs"])run(process.execPath,["--check",file]);
run(process.execPath,["apps/api/standalone.mjs"],{env:{...process.env,LATCH_SELFTEST:"1"}});run(process.execPath,["scripts/e2e-standalone.mjs"]);console.log("LATCH no-install self-test passed");
