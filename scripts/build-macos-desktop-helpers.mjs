#!/usr/bin/env node
import crypto from "node:crypto";
import {access,chmod,mkdir,readFile,rm} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const OBS_SOURCE=path.join(ROOT,"native","macos","cieav-desktop-observe","main.swift");
const INV_SOURCE=path.join(ROOT,"native","macos","cieav-desktop-invoke","main.swift");
const arg=name=>{const prefix=`--${name}=`;const found=process.argv.slice(2).find(v=>v.startsWith(prefix));return found?found.slice(prefix.length):null};
if(process.platform!=="darwin")throw new Error("CIEAV macOS desktop helpers can only be built on macOS");
const hash=crypto.createHash("sha256");for(const file of [OBS_SOURCE,INV_SOURCE])hash.update(await readFile(file));const sourceHash=hash.digest("hex").slice(0,16),outputDir=path.resolve(arg("output-dir")||path.join(ROOT,".cieav","native",`cieav-desktop-macos-${sourceHash}`)),observeExe=path.join(outputDir,"cieav-desktop-observe"),invokeExe=path.join(outputDir,"cieav-desktop-invoke");
const digest=async file=>crypto.createHash("sha256").update(await readFile(file)).digest("hex");
try{await access(observeExe);await access(invokeExe);console.log(JSON.stringify({ok:true,reused:true,sourceHash,outputDir,observe:{path:observeExe,sha256:await digest(observeExe)},invoke:{path:invokeExe,sha256:await digest(invokeExe)}}));process.exit(0)}catch{}
const swift=spawnSync("xcrun",["--find","swiftc"],{encoding:"utf8"});if(swift.status!==0)throw new Error("Xcode command line tools with swiftc are required to build CIEAV macOS desktop helpers");
await rm(outputDir,{recursive:true,force:true});await mkdir(outputDir,{recursive:true});
for(const [source,out] of [[OBS_SOURCE,observeExe],[INV_SOURCE,invokeExe]]){const built=spawnSync("xcrun",["swiftc","-O","-whole-module-optimization",source,"-framework","Foundation","-framework","AppKit","-framework","ApplicationServices","-framework","CryptoKit","-o",out],{cwd:ROOT,stdio:"inherit"});if(built.status!==0)throw new Error(`CIEAV macOS desktop helper build failed for ${path.basename(path.dirname(source))} with exit code ${built.status??"unknown"}`);await chmod(out,0o755)}
await access(observeExe);await access(invokeExe);console.log(JSON.stringify({ok:true,reused:false,sourceHash,outputDir,observe:{path:observeExe,sha256:await digest(observeExe)},invoke:{path:invokeExe,sha256:await digest(invokeExe)}}));
