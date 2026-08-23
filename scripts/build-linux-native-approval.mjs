#!/usr/bin/env node
import crypto from "node:crypto";
import {access,chmod,mkdir,readFile,rm} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const SOURCE=path.join(ROOT,"native","linux","cieav-native-approval","main.c");
const arg=name=>{const prefix=`--${name}=`;const found=process.argv.slice(2).find(value=>value.startsWith(prefix));return found?found.slice(prefix.length):null};
if(process.platform!=="linux")throw new Error("CIEAV Linux native approval host can only be built on Linux");
const sourceHash=crypto.createHash("sha256").update(await readFile(SOURCE)).digest("hex").slice(0,16),outputDir=path.resolve(arg("output-dir")||path.join(ROOT,".cieav","native",`cieav-native-approval-linux-${sourceHash}`)),exe=path.join(outputDir,"cieav-native-approval");
const binaryDigest=async()=>crypto.createHash("sha256").update(await readFile(exe)).digest("hex");
try{await access(exe);console.log(JSON.stringify({ok:true,reused:true,sourceHash,outputDir,exe,sha256:await binaryDigest()}));process.exit(0)}catch{}
for(const pkg of ["gio-2.0","json-glib-1.0"]){const check=spawnSync("pkg-config",["--exists",pkg]);if(check.status!==0)throw new Error(`pkg-config dependency ${pkg} is required to build CIEAV Linux native approval host`)}
const flags=spawnSync("pkg-config",["--cflags","--libs","gio-2.0","json-glib-1.0"],{encoding:"utf8"});if(flags.status!==0)throw new Error("failed to resolve Linux native approval build flags");const split=String(flags.stdout).trim().split(/\s+/).filter(Boolean);
await rm(outputDir,{recursive:true,force:true});await mkdir(outputDir,{recursive:true});const built=spawnSync(process.env.CC||"cc",["-std=c11","-O2","-fPIE","-D_FORTIFY_SOURCE=2","-fstack-protector-strong",SOURCE,"-o",exe,"-pie","-Wl,-z,relro,-z,now",...split],{cwd:ROOT,stdio:"inherit"});if(built.status!==0)throw new Error(`CIEAV Linux native approval build failed with exit code ${built.status??"unknown"}`);await chmod(exe,0o755);await access(exe);console.log(JSON.stringify({ok:true,reused:false,sourceHash,outputDir,exe,sha256:await binaryDigest()}));
