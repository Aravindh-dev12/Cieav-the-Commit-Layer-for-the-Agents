import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const node=process.platform==="win32"?"node.exe":process.execPath;
function run(cmd,args,opts={}){const result=spawnSync(cmd,args,{cwd:root,stdio:"inherit",...opts});if(result.error){console.error(result.error);process.exit(1)}if(result.status!==0)process.exit(result.status??1)}
for(const file of ["apps/browser/main.mjs","apps/browser/injected.js","scripts/browser-e2e.mjs","apps/api/standalone.mjs"])run(node,["--check",file]);
run(node,["apps/api/standalone.mjs"],{env:{...process.env,CIEAV_SELFTEST:"1"}});run(node,["scripts/e2e-standalone.mjs"]);console.log("CIEAV no-install self-test passed");
