#!/usr/bin/env node
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const platform=process.platform==="win32"?"windows":process.platform==="darwin"?"macos":process.platform;
const arch=process.arch==="x64"?"x64":process.arch==="arm64"?"arm64":process.arch;
const target=`${platform}-${arch}`;
if(!/^(windows|macos|linux)-(x64|arm64)$/.test(target))throw new Error(`Unsupported qualification target: ${target}`);
const result=spawnSync(process.execPath,[path.join(ROOT,"scripts/qualify-release.mjs"),"--require",target],{cwd:ROOT,stdio:"inherit",shell:false,env:process.env});
if(result.error)throw result.error;
process.exit(result.status??1);
