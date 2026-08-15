#!/usr/bin/env node
import {spawnSync} from "node:child_process";
import {access,mkdir} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

if(process.platform!=="win32")throw new Error("browser-e2e-windows.mjs is Windows-only");

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const source=path.join(ROOT,"native","windows","cdp-win-bridge.cpp");
const state=path.join(ROOT,".cieav","windows-e2e");
const bridge=path.join(state,"cdp-win-bridge.exe");
const dataFile=path.join(state,"receipts.json");
await mkdir(state,{recursive:true});

const exists=async file=>{try{await access(file);return true}catch{return false}};
const compileArgs=["/nologo","/std:c++17","/O2","/EHsc","/DUNICODE","/D_UNICODE",source,`/Fe:${bridge}`,"/link","/DYNAMICBASE","/NXCOMPAT"];

function run(command,args,options={}){
  return spawnSync(command,args,{cwd:ROOT,encoding:"utf8",windowsHide:true,maxBuffer:8*1024*1024,...options});
}

let built=false;
const where=run("where.exe",["cl.exe"]);
if(where.status===0){
  const direct=run("cl.exe",compileArgs);
  if(direct.status===0&&await exists(bridge))built=true;
  else process.stderr.write(direct.stderr||direct.stdout||"");
}

if(!built){
  const pf86=process.env["ProgramFiles(x86)"]??"C:\\Program Files (x86)";
  const vswhere=path.join(pf86,"Microsoft Visual Studio","Installer","vswhere.exe");
  if(!await exists(vswhere))throw new Error(`Visual Studio Build Tools locator not found: ${vswhere}`);
  const found=run(vswhere,["-latest","-products","*","-requires","Microsoft.VisualStudio.Component.VC.Tools.x86.x64","-property","installationPath"]);
  const install=String(found.stdout??"").trim();
  if(found.status!==0||!install)throw new Error(`Visual Studio C++ Build Tools not found: ${found.stderr||found.stdout||"vswhere returned no installation"}`);
  const devcmd=path.join(install,"Common7","Tools","VsDevCmd.bat");
  if(!await exists(devcmd))throw new Error(`VsDevCmd.bat not found: ${devcmd}`);
  const quote=s=>`"${String(s).replace(/"/g,'""')}"`;
  const command=`call ${quote(devcmd)} -arch=x64 -host_arch=x64 >nul && cl /nologo /std:c++17 /O2 /EHsc /DUNICODE /D_UNICODE ${quote(source)} /Fe:${quote(bridge)} /link /DYNAMICBASE /NXCOMPAT`;
  const shell=process.env.ComSpec??"cmd.exe";
  const fallback=run(shell,["/d","/s","/c",command],{windowsVerbatimArguments:true});
  if(fallback.status!==0||!await exists(bridge))throw new Error(`Windows private CDP bridge build failed (${fallback.status}): ${fallback.stderr||fallback.stdout||"unknown compiler failure"}`);
}

const result=spawnSync(process.execPath,[path.join(ROOT,"scripts","browser-e2e.mjs")],{
  cwd:ROOT,
  stdio:"inherit",
  env:{...process.env,CIEAV_CDP_WIN_BRIDGE:bridge,CIEAV_DATA_FILE:dataFile}
});
process.exit(result.status??1);
