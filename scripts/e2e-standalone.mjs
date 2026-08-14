import {spawn} from "node:child_process";
import {rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const node=process.platform==="win32"?"node.exe":process.execPath;
const port=8791;const dataFile=path.join(os.tmpdir(),`cieav-e2e-${process.pid}.json`);await rm(dataFile,{force:true});
const child=spawn(node,["apps/api/standalone.mjs"],{cwd:root,env:{...process.env,PORT:String(port),CIEAV_DATA_FILE:dataFile,OPENAI_API_KEY:""},stdio:["ignore","pipe","pipe"]});
let logs="";let spawnError=null;child.on("error",error=>{spawnError=error;logs+=String(error)});child.stdout.on("data",d=>logs+=d);child.stderr.on("data",d=>logs+=d);const deadline=Date.now()+5000;while(!logs.includes("standalone API")){if(spawnError)throw spawnError;if(Date.now()>deadline){child.kill();throw new Error(`server did not start: ${logs}`)}await new Promise(r=>setTimeout(r,40))}
try{const base=`http://127.0.0.1:${port}`;const health=await fetch(`${base}/health`).then(r=>r.json());if(!health.ok)throw new Error("health failed");const reg=await fetch(`${base}/v1/devices/register`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({installId:"integration-install-12345"})}).then(r=>r.json());const headers={"content-type":"application/json",authorization:`Bearer ${reg.token}`};const ctx={requestId:"request-12345678",url:"https://example.com/pay",origin:"https://example.com",title:"Pay",element:{tag:"button",text:"Transfer money"},form:{fields:[],fileNames:[]},timestamp:new Date().toISOString(),clientVersion:"e2e"};const analyzed=await fetch(`${base}/v1/analyze`,{method:"POST",headers,body:JSON.stringify(ctx)}).then(r=>r.json());if(analyzed.manifest.risk!=="CRITICAL"||analyzed.manifest.reversibility!=="IRREVERSIBLE")throw new Error("policy contract failed");console.log("CIEAV standalone E2E passed");}finally{if(child.exitCode===null)child.kill("SIGTERM");await rm(dataFile,{force:true})}
