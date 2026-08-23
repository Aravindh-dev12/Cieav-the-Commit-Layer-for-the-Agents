#!/usr/bin/env node
import crypto from "node:crypto";
import {access,mkdir,readFile,rm} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const OBS_PROJECT=path.join(ROOT,"native","windows","cieav-desktop-observe","Cieav.DesktopObserve.csproj");
const OBS_SOURCE=path.join(ROOT,"native","windows","cieav-desktop-observe","Program.cs");
const INV_PROJECT=path.join(ROOT,"native","windows","cieav-desktop-invoke","Cieav.DesktopInvoke.csproj");
const INV_SOURCE=path.join(ROOT,"native","windows","cieav-desktop-invoke","Program.cs");
const arg=name=>{const prefix=`--${name}=`;const found=process.argv.slice(2).find(v=>v.startsWith(prefix));return found?found.slice(prefix.length):null};

if(process.platform!=="win32")throw new Error("CIEAV Windows desktop helpers can only be built on Windows");
const hash=crypto.createHash("sha256");for(const file of [OBS_PROJECT,OBS_SOURCE,INV_PROJECT,INV_SOURCE])hash.update(await readFile(file));const sourceHash=hash.digest("hex").slice(0,16);
const outputDir=path.resolve(arg("output-dir")||path.join(ROOT,".cieav","native",`cieav-desktop-windows-${sourceHash}`));
const observeDir=path.join(outputDir,"observe"),invokeDir=path.join(outputDir,"invoke"),observeExe=path.join(observeDir,"cieav-desktop-observe.exe"),invokeExe=path.join(invokeDir,"cieav-desktop-invoke.exe");
const digest=async file=>crypto.createHash("sha256").update(await readFile(file)).digest("hex");
try{await access(observeExe);await access(invokeExe);console.log(JSON.stringify({ok:true,reused:true,sourceHash,outputDir,observe:{path:observeExe,sha256:await digest(observeExe)},invoke:{path:invokeExe,sha256:await digest(invokeExe)}}));process.exit(0)}catch{}
const version=spawnSync("dotnet",["--version"],{encoding:"utf8",windowsHide:true});if(version.status!==0)throw new Error("dotnet SDK is required to build CIEAV Windows desktop helpers");const major=Number(String(version.stdout).trim().split(".")[0]);if(!Number.isInteger(major)||major<8)throw new Error(`CIEAV Windows desktop helpers require .NET SDK 8 or newer; found ${String(version.stdout).trim()||"unknown"}`);
await rm(outputDir,{recursive:true,force:true});await mkdir(observeDir,{recursive:true});await mkdir(invokeDir,{recursive:true});
for(const [project,out] of [[OBS_PROJECT,observeDir],[INV_PROJECT,invokeDir]]){const built=spawnSync("dotnet",["publish",project,"--configuration","Release","--runtime","win-x64","--no-self-contained","--output",out,"-p:ContinuousIntegrationBuild=true"],{cwd:ROOT,stdio:"inherit",windowsHide:true});if(built.status!==0)throw new Error(`CIEAV Windows desktop helper build failed for ${path.basename(project)} with exit code ${built.status??"unknown"}`)}
await access(observeExe);await access(invokeExe);console.log(JSON.stringify({ok:true,reused:false,sourceHash,outputDir,observe:{path:observeExe,sha256:await digest(observeExe)},invoke:{path:invokeExe,sha256:await digest(invokeExe)}}));
