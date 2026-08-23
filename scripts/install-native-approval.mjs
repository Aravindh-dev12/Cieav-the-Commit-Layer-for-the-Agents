#!/usr/bin/env node
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import {access,chmod,mkdir,readFile,readdir,rename,rm,writeFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const arg=name=>{const p=`--${name}=`;const v=process.argv.slice(2).find(x=>x.startsWith(p));return v?v.slice(p.length):null};
const stateDir=path.resolve(arg("state-dir")||process.env.CIEAV_STATE_DIR||process.env.LATCH_STATE_DIR||path.join(os.homedir(),".cieav")),nativeDir=path.join(stateDir,"native");
const hashFiles=async files=>{const h=crypto.createHash("sha256");for(const file of files)h.update(await readFile(file));return h.digest("hex").slice(0,16)};
const digestFile=async file=>crypto.createHash("sha256").update(await readFile(file)).digest("hex");
await mkdir(nativeDir,{recursive:true,mode:0o700});
let builder,args=[];
if(process.platform==="win32"){
  builder=path.join(ROOT,"scripts","build-windows-native-approval.mjs");args=[`--native-dir=${nativeDir}`];
}else if(process.platform==="darwin"){
  builder=path.join(ROOT,"scripts","build-macos-native-approval.mjs");const source=path.join(ROOT,"native","macos","cieav-native-approval","main.swift"),hash=await hashFiles([source]);args=[`--output-dir=${path.join(nativeDir,`cieav-native-approval-macos-${hash}`)}`];
}else if(process.platform==="linux"){
  builder=path.join(ROOT,"scripts","build-linux-native-approval.mjs");const source=path.join(ROOT,"native","linux","cieav-native-approval","main.c"),hash=await hashFiles([source]);args=[`--output-dir=${path.join(nativeDir,`cieav-native-approval-linux-${hash}`)}`];
}else throw new Error(`unsupported native approval platform: ${process.platform}`);
const built=spawnSync(process.execPath,[builder,...args],{cwd:ROOT,encoding:"utf8",stdio:["ignore","pipe","inherit"],windowsHide:true});if(built.status!==0)throw new Error(`native approval builder failed with exit code ${built.status??"unknown"}`);const lines=String(built.stdout??"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);if(!lines.length)throw new Error("native approval builder returned no result");let result;try{result=JSON.parse(lines.at(-1))}catch{throw new Error("native approval builder returned invalid JSON")};
if(!result?.ok||typeof result.exe!=="string"||typeof result.sha256!=="string"||!/^[a-f0-9]{64}$/.test(result.sha256))throw new Error("native approval builder result incomplete");const exe=path.resolve(result.exe);await access(exe);const relative=path.relative(nativeDir,exe);if(relative.startsWith("..")||path.isAbsolute(relative))throw new Error("native approval helper escaped native state directory");const activeTopLevel=relative.split(path.sep)[0];if(!activeTopLevel)throw new Error("native approval helper layout invalid");const actual=await digestFile(exe);if(actual!==result.sha256)throw new Error("native approval binary changed after build");
const manifest={version:"CIEAV_NATIVE_APPROVAL_HELPER_CONFIG_V1",platform:process.platform,helper:exe,sha256:actual,sourceHash:String(result.sourceHash??""),installedAt:new Date().toISOString()},file=path.join(nativeDir,"native-approval.json"),tmp=`${file}.${process.pid}.${crypto.randomUUID()}.tmp`;await writeFile(tmp,JSON.stringify(manifest,null,2)+"\n",{encoding:"utf8",mode:0o600,flag:"wx"});if(process.platform!=="win32")await chmod(tmp,0o600);await rename(tmp,file);if(process.platform!=="win32")await chmod(file,0o600);
for(const entry of await readdir(nativeDir,{withFileTypes:true})){if(!entry.isDirectory()||entry.name===activeTopLevel)continue;if(/^cieav-native-approval-(?:macos-|linux-)?[a-f0-9]{16}$/.test(entry.name))try{await rm(path.join(nativeDir,entry.name),{recursive:true,force:true})}catch{}}
console.log(JSON.stringify({ok:true,stateDir,nativeDir,manifest:file,helper:exe,sha256:actual,platform:process.platform}));
