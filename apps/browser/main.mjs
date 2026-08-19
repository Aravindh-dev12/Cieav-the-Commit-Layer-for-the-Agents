#!/usr/bin/env node
import crypto from "node:crypto";
import http from "node:http";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,"../..");
const env=(primary,legacy,fallback)=>process.env[primary]??process.env[legacy]??fallback;
const STATE=path.resolve(env("CIEAV_STATE_DIR","LATCH_STATE_DIR",path.join(ROOT,".cieav")));
const API_PORT=+env("CIEAV_API_PORT","LATCH_API_PORT",8787),CONTROL_PORT=+env("CIEAV_CONTROL_PORT","LATCH_CONTROL_PORT",8790),API=`http://127.0.0.1:${API_PORT}`;
let CONTROL_TOKEN=env("CIEAV_BROWSER_CONTROL_TOKEN","LATCH_BROWSER_CONTROL_TOKEN","");
if(CONTROL_TOKEN.length<43){CONTROL_TOKEN=crypto.randomBytes(48).toString("base64url");process.env.CIEAV_BROWSER_CONTROL_TOKEN=CONTROL_TOKEN}

// Startup verifies release/security markers in the modules that now own each responsibility.
const CORE_INVARIANTS=[
  "CIEAV_REQUIRE_PRODUCTION_API","refusing standalone/dev","verifyAdapterProposal({",'m.kind==="UNDO_READY"',"liveAdapter(u)",'current.outcome?.status!=="OBSERVED_SUCCESS"',
  'browserControlTransport:browserTransport',"Target.setDiscoverTargets","Target.attachToTarget","flatten:true",
  "attaching=new Map","if(inflight)return inflight",'await openTarget("about:blank")',"failed to establish a protected startup target","CIEAV browser target attachment failed",
  'if(AUTO&&req.method==="POST"&&u.pathname==="/api/test/eval"','if(AUTO&&req.method==="POST"&&u.pathname==="/api/test/click"',
  "if(!controlAuth.authorized(req))return send(401",'u.pathname==="/api/bootstrap"',
  "async function persistOutcome","p.finalOutcome","p.finalizing","p.persistenceFailures","await persistOutcome(receiptId,value)","pendingOutcomes.delete(receiptId)","Promise.allSettled(finalizers)","await attention.flush()",
  "attention.replay(","attention.outcome(","attention.undoAvailable(",'m.kind==="REPLAYED"',"await attention.replay("
];
const LAUNCH_INVARIANTS=[
  '"--remote-debugging-pipe"','transport:"private-windows-handle-pipe"','transport:"private-posix-fd-pipe"',
  '"CIEAV_BROWSER_CONTROL_TOKEN"','"LATCH_BROWSER_CONTROL_TOKEN"',"for(const key of SECRET_ENV_KEYS)delete clean[key]"
];
const CORE_FORBIDDEN=["--remote-"+"debugging-port","/json/"+"list","/json/"+"new","webSocket"+"DebuggerUrl"];
const coreSource=await readFile(path.join(HERE,"main-core.mjs"),"utf8"),launchSource=await readFile(path.join(HERE,"chromium-launch.mjs"),"utf8");
for(const token of CORE_INVARIANTS)if(!coreSource.includes(token))throw new Error(`CIEAV hardened browser core invariant missing: ${token}`);
for(const token of LAUNCH_INVARIANTS)if(!launchSource.includes(token))throw new Error(`CIEAV private Chromium launch invariant missing: ${token}`);
for(const token of CORE_FORBIDDEN)if(coreSource.includes(token)||launchSource.includes(token))throw new Error(`CIEAV hardened browser reintroduced forbidden DevTools surface: ${token}`);

const originalCreateServer=http.createServer.bind(http);
const safeEqual=(a,b)=>{const x=Buffer.from(String(a??"")),y=Buffer.from(String(b??""));return x.length===y.length&&crypto.timingSafeEqual(x,y)};
const cookies=req=>Object.fromEntries(String(req.headers.cookie??"").split(";").map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf("=");return i<0?[x,""]:[x.slice(0,i),x.slice(i+1)]}));
const authorized=req=>{const h=String(req.headers.authorization??""),bearer=h.startsWith("Bearer ")?h.slice(7):"";return safeEqual(bearer,CONTROL_TOKEN)||safeEqual(cookies(req).cieav_control,CONTROL_TOKEN)};
const ownOrigin=req=>!req.headers.origin||[`http://127.0.0.1:${CONTROL_PORT}`,`http://localhost:${CONTROL_PORT}`].includes(String(req.headers.origin));
const send=(res,status,value)=>{res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","content-security-policy":"default-src 'none'","x-content-type-options":"nosniff","referrer-policy":"no-referrer"});res.end(JSON.stringify(value))};
const readBody=async(req,max=256_000)=>{const chunks=[];let size=0;for await(const chunk of req){const b=Buffer.from(chunk);size+=b.length;if(size>max)throw new Error("body_too_large");chunks.push(b)}const value=chunks.length?JSON.parse(Buffer.concat(chunks).toString("utf8")):{};if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("invalid_json_object");return value};
let devicePromise;
async function device(){if(devicePromise)return devicePromise;devicePromise=(async()=>{await mkdir(STATE,{recursive:true,mode:0o700});const file=path.join(STATE,"device.json");let installId;try{installId=JSON.parse(await readFile(file,"utf8")).installId}catch{}if(typeof installId!=="string"||installId.length<12){installId=`browser_${crypto.randomUUID()}_${crypto.randomUUID()}`;await writeFile(file,JSON.stringify({installId}),{mode:0o600})}const r=await fetch(`${API}/v1/devices/register`,{method:"POST",redirect:"error",headers:{"content-type":"application/json"},body:JSON.stringify({installId,deviceName:"CIEAV Control Center"}),signal:AbortSignal.timeout(5000)}),text=await r.text();const value=text?JSON.parse(text):{};if(!r.ok||typeof value.token!=="string")throw new Error(`device_registration_failed:${value.error??r.status}`);return value})();try{return await devicePromise}catch(err){devicePromise=undefined;throw err}}
async function api(route,opt={}){const dev=await device(),r=await fetch(`${API}${route}`,{...opt,redirect:"error",signal:AbortSignal.timeout(7000),headers:{"content-type":"application/json",authorization:`Bearer ${dev.token}`,...(opt.headers??{})}}),text=await r.text();let value={};try{value=text?JSON.parse(text):{}}catch{value={error:"invalid_json"}}if(!r.ok)throw new Error(`${r.status}:${value.error??value.detail??"api_error"}`);return value}
async function realitySnapshot(){const [intents,loops,approvals,proofs,business]=await Promise.all([api("/v1/intents"),api("/v1/open-loops"),api("/v1/reality/approvals"),api("/v1/proofs"),api("/v1/business/plans")]);return{intents:intents.intents??[],openLoops:loops.openLoops??[],approvals:approvals.approvals??[],proofs:proofs.proofs??[],businessPlans:business.plans??[],approvalMode:"read-only",generatedAt:new Date().toISOString()}}

http.createServer=function(...args){
  if(typeof args[0]!=="function"&&typeof args[1]!=="function")return originalCreateServer(...args);
  const listener=typeof args[0]==="function"?args[0]:args[1],options=typeof args[0]==="function"?undefined:args[0];
  const wrapped=async(req,res)=>{let u;try{u=new URL(req.url??"/",`http://${req.headers.host??`127.0.0.1:${CONTROL_PORT}`}`)}catch{return listener(req,res)}const isReality=u.pathname==="/api/reality",isLab=u.pathname==="/api/lab/evaluate";if(!isReality&&!isLab)return listener(req,res);if(!authorized(req))return send(res,401,{error:"unauthorized"});if(isLab&&(!ownOrigin(req)||req.method!=="POST"))return send(res,req.method!=="POST"?405:403,{error:req.method!=="POST"?"method_not_allowed":"origin_not_allowed"});if(isReality&&req.method!=="GET")return send(res,405,{error:"method_not_allowed"});try{if(isReality)return send(res,200,await realitySnapshot());const payload=await readBody(req),result=await api("/v1/reality/lab/evaluate",{method:"POST",body:JSON.stringify(payload)});if(result.permit||result.approval||result.permitIssued!==false||result.approvalCreated!==false||result.sideEffects!==false||result.simulation!==true)throw new Error("action_lab_authority_invariant_violation");return send(res,200,result)}catch(err){const message=String(err?.message??err).slice(0,500);return send(res,message==="body_too_large"?413:400,{error:message})}};
  return options===undefined?originalCreateServer(wrapped):originalCreateServer(options,wrapped);
};

await import("./main-core.mjs");
