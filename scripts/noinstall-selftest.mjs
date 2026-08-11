import {spawnSync} from "node:child_process";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
function run(cmd,args,opts={}){const r=spawnSync(cmd,args,{cwd:root,stdio:"inherit",...opts});if(r.status!==0)process.exit(r.status??1)}
for(const f of ["background.js","content.js","popup.js","options.js"])run(process.execPath,["--check",`apps/extension/dist/${f}`]);JSON.parse(await readFile(path.join(root,"apps/extension/dist/manifest.json"),"utf8"));run(process.execPath,["apps/api/standalone.mjs"],{env:{...process.env,LATCH_SELFTEST:"1"}});run(process.execPath,["scripts/e2e-standalone.mjs"]);console.log("LATCH no-install self-test passed");
