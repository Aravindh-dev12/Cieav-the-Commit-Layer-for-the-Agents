#!/usr/bin/env node
import {spawnSync} from "node:child_process";
import {access,mkdir} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";

if(process.platform!=="win32")throw new Error("build-windows-cdp-bridge.mjs is Windows-only");

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const source=path.join(ROOT,"native","windows","cdp-win-bridge.cpp");
const arg=(name)=>{const prefix=`--${name}=`;const found=process.argv.slice(2).find(x=>x.startsWith(prefix));return found?found.slice(prefix.length):null};
const state=process.env.CIEAV_STATE_DIR?.trim()||path.join(os.homedir(),".cieav");
const output=path.resolve(arg("output")||path.join(state,"native","cdp-win-bridge.exe"));
const object=path.join(path.dirname(output),"cdp-win-bridge.obj");
await mkdir(path.dirname(output),{recursive:true});
const exists=async file=>{try{await access(file);return true}catch{return false}};
const run=(command,args,options={})=>spawnSync(command,args,{cwd:ROOT,encoding:"utf8",windowsHide:true,maxBuffer:8*1024*1024,...options});
const compileArgs=["/nologo","/std:c++17","/O2","/EHsc","/DUNICODE","/D_UNICODE",`/Fo:${object}`,source,`/Fe:${output}`,"/link","/DYNAMICBASE","/NXCOMPAT"];

let compiler="cl.exe";
let result=run("where.exe",["cl.exe"]);
if(result.status===0){
  result=run("cl.exe",compileArgs);
  if(result.status===0&&await exists(output)){
    console.log(JSON.stringify({ok:true,platform:"windows",bridge:output,compiler:"cl.exe"},null,2));
    process.exit(0);
  }
}

const pf86=process.env["ProgramFiles(x86)"]||"C:\\Program Files (x86)";
const vswhere=path.join(pf86,"Microsoft Visual Studio","Installer","vswhere.exe");
if(!await exists(vswhere))throw new Error(`Visual Studio Build Tools locator not found: ${vswhere}. Install the Desktop development with C++ workload.`);
const found=run(vswhere,["-latest","-products","*","-requires","Microsoft.VisualStudio.Component.VC.Tools.x86.x64","-property","installationPath"]);
const install=String(found.stdout||"").trim();
if(found.status!==0||!install)throw new Error(`Visual Studio C++ Build Tools not found: ${found.stderr||found.stdout||"vswhere returned no installation"}`);
const devcmd=path.join(install,"Common7","Tools","VsDevCmd.bat");
if(!await exists(devcmd))throw new Error(`VsDevCmd.bat not found: ${devcmd}`);
const q=s=>`"${String(s).replace(/"/g,'""')}"`;
const command=`call ${q(devcmd)} -arch=x64 -host_arch=x64 >nul && cl /nologo /std:c++17 /O2 /EHsc /DUNICODE /D_UNICODE /Fo:${q(object)} ${q(source)} /Fe:${q(output)} /link /DYNAMICBASE /NXCOMPAT`;
compiler="Visual Studio Build Tools";
result=run(process.env.ComSpec||"cmd.exe",["/d","/s","/c",command],{windowsVerbatimArguments:true});
if(result.status!==0||!await exists(output))throw new Error(`Windows private CDP bridge build failed (${result.status}): ${result.stderr||result.stdout||"unknown compiler failure"}`);
console.log(JSON.stringify({ok:true,platform:"windows",bridge:output,compiler},null,2));
