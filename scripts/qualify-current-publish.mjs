#!/usr/bin/env node
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const platform=process.platform==="win32"?"windows":process.platform==="darwin"?"macos":process.platform,arch=process.arch==="x64"?"x64":process.arch==="arm64"?"arm64":process.arch,target=`${platform}-${arch}`;
if(!/^(windows|macos|linux)-(x64|arm64)$/.test(target))throw new Error(`Unsupported publish qualification target: ${target}`);
const available=(cmd,args=["--version"])=>{const r=spawnSync(cmd,args,{encoding:"utf8",shell:false});return !r.error&&r.status===0};
const python=process.env.PYTHON||process.env.CIEAV_PYTHON||([process.platform==="win32"?"python":null,"python3","python"].filter(Boolean).find(x=>available(x))??(process.platform==="win32"&&available("py",["-3","--version"])?"py":"python")),pyPrefix=python==="py"?["-3"]:[];
const run=(cmd,args)=>{const r=spawnSync(cmd,args,{cwd:ROOT,env:process.env,stdio:"inherit",shell:false});if(r.error)throw r.error;if(r.status!==0)process.exit(r.status??1)};
run(process.execPath,[path.join(ROOT,"scripts","release-gate.mjs"),"--publish"]);
run(python,[...pyPrefix,path.join(ROOT,"scripts","clean-runtime-publish-smoke.py")]);
run(python,[...pyPrefix,path.join(ROOT,"scripts","service-lifecycle-smoke.py"),"--mode","publish","--confirm-service-mutation"]);
if(process.platform==="darwin")run(python,[...pyPrefix,path.join(ROOT,"scripts","notarize-runtime.py"),"--mode","publish"]);
run(process.execPath,[path.join(ROOT,"scripts","qualify-publish-candidate.mjs"),"--require",target]);
console.log(`CIEAV current-platform publish qualification PASS · ${target}`);
