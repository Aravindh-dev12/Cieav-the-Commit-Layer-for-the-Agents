#!/usr/bin/env node
import crypto from "node:crypto";
import {access,chmod,mkdir,readFile,rm} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const OBS_SOURCE=path.join(ROOT,"native","linux","cieav-desktop-observe","main.c");
const INV_SOURCE=path.join(ROOT,"native","linux","cieav-desktop-invoke","main.c");
const arg=name=>{const prefix=`--${name}=`;const found=process.argv.slice(2).find(v=>v.startsWith(prefix));return found?found.slice(prefix.length):null};
if(process.platform!=="linux")throw new Error("CIEAV Linux desktop helpers can only be built on Linux");
const hash=crypto.createHash("sha256");for(const file of [OBS_SOURCE,INV_SOURCE])hash.update(await readFile(file));const sourceHash=hash.digest("hex").slice(0,16),outputDir=path.resolve(arg("output-dir")||path.join(ROOT,".cieav","native",`cieav-desktop-linux-${sourceHash}`)),observeExe=path.join(outputDir,"cieav-desktop-observe"),invokeExe=path.join(outputDir,"cieav-desktop-invoke");
const digest=async file=>crypto.createHash("sha256").update(await readFile(file)).digest("hex");
try{await access(observeExe);await access(invokeExe);console.log(JSON.stringify({ok:true,reused:true,sourceHash,outputDir,observe:{path:observeExe,sha256:await digest(observeExe)},invoke:{path:invokeExe,sha256:await digest(invokeExe)}}));process.exit(0)}catch{}
for(const pkg of ["atspi-2","json-glib-1.0"]){const check=spawnSync("pkg-config",["--exists",pkg]);if(check.status!==0)throw new Error(`pkg-config dependency ${pkg} is required to build CIEAV Linux desktop helpers`)}
const flags=spawnSync("pkg-config",["--cflags","--libs","atspi-2","json-glib-1.0"],{encoding:"utf8"});if(flags.status!==0)throw new Error("failed to resolve Linux desktop helper build flags");const split=String(flags.stdout).trim().split(/\s+/).filter(Boolean),cc=process.env.CC||"cc";
await rm(outputDir,{recursive:true,force:true});await mkdir(outputDir,{recursive:true});
for(const [source,out] of [[OBS_SOURCE,observeExe],[INV_SOURCE,invokeExe]]){const built=spawnSync(cc,["-std=c11","-O2","-fPIE","-D_FORTIFY_SOURCE=2","-fstack-protector-strong","-Wall","-Wextra","-Werror",source,"-o",out,"-pie","-Wl,-z,relro,-z,now",...split],{cwd:ROOT,stdio:"inherit"});if(built.status!==0)throw new Error(`CIEAV Linux desktop helper build failed for ${path.basename(path.dirname(source))} with exit code ${built.status??"unknown"}`);await chmod(out,0o755)}
await access(observeExe);await access(invokeExe);console.log(JSON.stringify({ok:true,reused:false,sourceHash,outputDir,observe:{path:observeExe,sha256:await digest(observeExe)},invoke:{path:invokeExe,sha256:await digest(invokeExe)}}));
