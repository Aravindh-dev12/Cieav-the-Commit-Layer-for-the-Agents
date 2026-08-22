#!/usr/bin/env node
import crypto from "node:crypto";
import {access,mkdir,readFile,rm} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const PROJECT=path.join(ROOT,"native","windows","cieav-native-approval","Cieav.NativeApproval.csproj");
const PROGRAM=path.join(ROOT,"native","windows","cieav-native-approval","Program.cs");
const arg=name=>{const prefix=`--${name}=`;const found=process.argv.slice(2).find(value=>value.startsWith(prefix));return found?found.slice(prefix.length):null};

if(process.platform!=="win32")throw new Error("CIEAV native approval host can only be built on Windows");
const hash=crypto.createHash("sha256");for(const file of [PROJECT,PROGRAM])hash.update(await readFile(file));const sourceHash=hash.digest("hex").slice(0,16);
const outputArg=arg("output-dir"),nativeDirArg=arg("native-dir");
if(outputArg&&nativeDirArg)throw new Error("choose either --output-dir or --native-dir");
const outputDir=path.resolve(outputArg||(nativeDirArg?path.join(nativeDirArg,`cieav-native-approval-${sourceHash}`):path.join(ROOT,".cieav","native",`cieav-native-approval-${sourceHash}`)));
const exe=path.join(outputDir,"cieav-native-approval.exe");
try{await access(exe);console.log(JSON.stringify({ok:true,reused:true,sourceHash,outputDir,exe}));process.exit(0)}catch{}

const version=spawnSync("dotnet",["--version"],{encoding:"utf8",windowsHide:true});
if(version.status!==0)throw new Error("dotnet SDK is required to build CIEAV native approval host");
const major=Number(String(version.stdout).trim().split(".")[0]);if(!Number.isInteger(major)||major<8)throw new Error(`CIEAV native approval host requires .NET SDK 8 or newer; found ${String(version.stdout).trim()||"unknown"}`);

await rm(outputDir,{recursive:true,force:true});await mkdir(outputDir,{recursive:true});
const built=spawnSync("dotnet",["publish",PROJECT,"--configuration","Release","--runtime","win-x64","--no-self-contained","--output",outputDir,"-p:ContinuousIntegrationBuild=true"],{cwd:ROOT,stdio:"inherit",windowsHide:true});
if(built.status!==0)throw new Error(`CIEAV native approval host build failed with exit code ${built.status??"unknown"}`);
await access(exe);
console.log(JSON.stringify({ok:true,reused:false,sourceHash,outputDir,exe}));
