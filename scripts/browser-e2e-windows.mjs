#!/usr/bin/env node
import {spawn,spawnSync} from "node:child_process";
import {access,mkdir,mkdtemp,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";

if(process.platform!=="win32")throw new Error("browser-e2e-windows.mjs is Windows-only");

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const API_PORT=18887,CONTROL_PORT=18890,CONTROL_TOKEN="browser-e2e-control-"+"x".repeat(48),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const source=path.join(ROOT,"native","windows","cdp-win-bridge.cpp");
const buildDir=path.join(ROOT,".cieav","windows-e2e");
const bridge=path.join(buildDir,"cdp-win-bridge.exe");
await mkdir(buildDir,{recursive:true});
const exists=async file=>{try{await access(file);return true}catch{return false}};
const compileArgs=["/nologo","/std:c++17","/O2","/EHsc","/DUNICODE","/D_UNICODE",source,`/Fe:${bridge}`,"/link","/DYNAMICBASE","/NXCOMPAT"];
const run=(command,args,options={})=>spawnSync(command,args,{cwd:ROOT,encoding:"utf8",windowsHide:true,maxBuffer:8*1024*1024,...options});

let built=false;
if(run("where.exe",["cl.exe"]).status===0){
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
  const q=s=>`"${String(s).replace(/"/g,'""')}"`;
  const command=`call ${q(devcmd)} -arch=x64 -host_arch=x64 >nul && cl /nologo /std:c++17 /O2 /EHsc /DUNICODE /D_UNICODE ${q(source)} /Fe:${q(bridge)} /link /DYNAMICBASE /NXCOMPAT`;
  const fallback=run(process.env.ComSpec??"cmd.exe",["/d","/s","/c",command],{windowsVerbatimArguments:true});
  if(fallback.status!==0||!await exists(bridge))throw new Error(`Windows private CDP bridge build failed (${fallback.status}): ${fallback.stderr||fallback.stdout||"unknown compiler failure"}`);
}

const state=await mkdtemp(path.join(os.tmpdir(),"cieav-browser-e2e-win-"));
const child=spawn(process.execPath,[path.join(ROOT,"apps","browser","main.mjs")],{
  cwd:ROOT,stdio:["ignore","pipe","pipe"],windowsHide:true,
  env:{...process.env,CIEAV_API_PORT:String(API_PORT),CIEAV_CONTROL_PORT:String(CONTROL_PORT),CIEAV_STATE_DIR:state,CIEAV_HEADLESS:"1",CIEAV_TEST_AUTO_APPROVE:"1",CIEAV_BROWSER_CONTROL_TOKEN:CONTROL_TOKEN,CIEAV_START_URL:"about:blank",CIEAV_CDP_WIN_BRIDGE:bridge}
});
let logs="";child.stdout.on("data",d=>logs+=d);child.stderr.on("data",d=>logs+=d);
const waitFor=async(fn,label,tries=180)=>{let last;for(let i=0;i<tries;i++){try{const v=await fn();if(v)return v}catch(e){last=e}await sleep(100)}throw new Error(`Timed out waiting for ${label}: ${last?.message??"no response"}\n${logs}`)};
const control=async(pathname,options={})=>{const r=await fetch(`http://127.0.0.1:${CONTROL_PORT}${pathname}`,{...options,redirect:"error",headers:{authorization:`Bearer ${CONTROL_TOKEN}`,"content-type":"application/json",...(options.headers??{})}}),t=await r.text();if(!r.ok)throw new Error(t);return t?JSON.parse(t):{}};
const evalJs=async expression=>(await control("/api/test/eval",{method:"POST",body:JSON.stringify({expression})})).value;
const click=selector=>control("/api/test/click",{method:"POST",body:JSON.stringify({selector})});
try{
  const status=await waitFor(async()=>{try{const s=await control("/api/status");return s.ok&&s.browserConnected&&s.protectedPages>0?s:null}catch{return null}},"authenticated protected Windows private-pipe control server");
  if(status.browserControlTransport!=="private-windows-handle-pipe")throw new Error(`unexpected browser transport ${status.browserControlTransport}`);
  await waitFor(async()=>{try{return await evalJs("document.readyState==='complete'")}catch{return false}},"protected test page");
  await evalJs("document.body.innerHTML='<button id=pay>Pay 500</button><span id=paid></span>';window.payCount=0;document.querySelector('#pay').addEventListener('click',function(){window.payCount++;document.querySelector('#paid').textContent='paid'});true");
  await click("#pay");
  await waitFor(()=>evalJs("window.payCount===1"),"trusted replay payment");
  const receipt=await waitFor(async()=>{const r=await control("/api/receipts");return r.receipts.find(x=>x.manifest.actionType==="financial.commit")},"financial receipt");
  if(receipt.status!=="COMMITTED"||receipt.manifest.risk!=="CRITICAL"||receipt.manifest.reversibility!=="IRREVERSIBLE")throw new Error("payment receipt contract failed");
  console.log("CIEAV Windows Browser E2E passed: normal-shell bridge build + protection readiness + private CDP + trusted replay + default receipt persistence");
}finally{
  child.kill("SIGTERM");await sleep(500);await rm(state,{recursive:true,force:true});
}
