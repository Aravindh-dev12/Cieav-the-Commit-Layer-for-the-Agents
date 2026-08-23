#!/usr/bin/env node
import crypto from "node:crypto";
import http from "node:http";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {notifyNative,notifyNativeApproval} from "./native-notify.mjs";
import {activeCdpSessions} from "./cdp-pipe.mjs";
import {observeBrowserPageFromSessions} from "./browser-observation.mjs";
import {commitBrowserActionFromSessions} from "./browser-commit.mjs";

const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,"../..");
const env=(primary,legacy,fallback)=>process.env[primary]??process.env[legacy]??fallback;
const UI_MODE=String(env("CIEAV_UI_MODE","LATCH_UI_MODE","notification-only")).trim().toLowerCase();
const NOTIFICATION_ONLY=UI_MODE==="notification-only";
if(NOTIFICATION_ONLY){
  process.env.CIEAV_HEADLESS="1";
  process.env.CIEAV_START_URL="about:blank";
  process.env.CIEAV_NOTIFICATIONS=process.env.CIEAV_NOTIFICATIONS??"1";
}
const STATE=path.resolve(env("CIEAV_STATE_DIR","LATCH_STATE_DIR",path.join(ROOT,".cieav")));
const API_PORT=+env("CIEAV_API_PORT","LATCH_API_PORT",8787),CONTROL_PORT=+env("CIEAV_CONTROL_PORT","LATCH_CONTROL_PORT",8790),API=`http://127.0.0.1:${API_PORT}`;
let CONTROL_TOKEN=env("CIEAV_BROWSER_CONTROL_TOKEN","LATCH_BROWSER_CONTROL_TOKEN","");
if(CONTROL_TOKEN.length<43){CONTROL_TOKEN=crypto.randomBytes(48).toString("base64url");process.env.CIEAV_BROWSER_CONTROL_TOKEN=CONTROL_TOKEN}
let OBSERVATION_TOKEN=String(process.env.CIEAV_BROWSER_OBSERVATION_TOKEN??"");
if(OBSERVATION_TOKEN.length<43){OBSERVATION_TOKEN=crypto.randomBytes(48).toString("base64url");process.env.CIEAV_BROWSER_OBSERVATION_TOKEN=OBSERVATION_TOKEN}
if(CONTROL_TOKEN===OBSERVATION_TOKEN)throw new Error("Browser observation capability must be distinct from control capability");

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
const CORE_FORBIDDEN=["--remote-"+"debugging-port","/json/"+"list","/json/"+"new","webSocket"+"DebuggerUrl","Target.getTargetInfo"];
const coreSource=await readFile(path.join(HERE,"main-core.mjs"),"utf8"),launchSource=await readFile(path.join(HERE,"chromium-launch.mjs"),"utf8");
for(const token of CORE_INVARIANTS)if(!coreSource.includes(token))throw new Error(`CIEAV hardened browser core invariant missing: ${token}`);
for(const token of LAUNCH_INVARIANTS)if(!launchSource.includes(token))throw new Error(`CIEAV private Chromium launch invariant missing: ${token}`);
for(const token of CORE_FORBIDDEN)if(coreSource.includes(token)||launchSource.includes(token))throw new Error(`CIEAV hardened browser reintroduced forbidden DevTools surface: ${token}`);

const originalCreateServer=http.createServer.bind(http);
const safeEqual=(a,b)=>{const x=Buffer.from(String(a??"")),y=Buffer.from(String(b??""));return x.length===y.length&&crypto.timingSafeEqual(x,y)};
const cookies=req=>Object.fromEntries(String(req.headers.cookie??"").split(";").map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf("=");return i<0?[x,""]:[x.slice(0,i),x.slice(i+1)]}));
const bearerFrom=req=>{const h=String(req.headers.authorization??"");return h.startsWith("Bearer ")?h.slice(7):""};
const authorized=req=>{const bearer=bearerFrom(req);return safeEqual(bearer,CONTROL_TOKEN)||safeEqual(cookies(req).cieav_control,CONTROL_TOKEN)};
const controlBearerAuthorized=req=>{const bearer=bearerFrom(req);return bearer.length>=43&&safeEqual(bearer,CONTROL_TOKEN)};
const observationAuthorized=req=>{const bearer=bearerFrom(req);return bearer.length>=43&&safeEqual(bearer,OBSERVATION_TOKEN)};
const ownOrigin=req=>!req.headers.origin||[`http://127.0.0.1:${CONTROL_PORT}`,`http://localhost:${CONTROL_PORT}`].includes(String(req.headers.origin));
const loopbackPeer=req=>["127.0.0.1","::1","::ffff:127.0.0.1"].includes(String(req.socket.remoteAddress??""));
const send=(res,status,value)=>{res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","content-security-policy":"default-src 'none'","x-content-type-options":"nosniff","referrer-policy":"no-referrer"});res.end(JSON.stringify(value))};
const readBody=async(req,max=256_000)=>{const chunks=[];let size=0;for await(const chunk of req){const b=Buffer.from(chunk);size+=b.length;if(size>max)throw new Error("body_too_large");chunks.push(b)}const value=chunks.length?JSON.parse(Buffer.concat(chunks).toString("utf8")):{};if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("invalid_json_object");return value};
const nativeActivationAttempts=[];
const allowNativeActivation=()=>{const now=Date.now();while(nativeActivationAttempts.length&&nativeActivationAttempts[0]<now-60_000)nativeActivationAttempts.shift();if(nativeActivationAttempts.length>=30)return false;nativeActivationAttempts.push(now);return true};
let devicePromise;
async function device(){if(devicePromise)return devicePromise;devicePromise=(async()=>{await mkdir(STATE,{recursive:true,mode:0o700});const file=path.join(STATE,"device.json");let installId;try{installId=JSON.parse(await readFile(file,"utf8")).installId}catch{}if(typeof installId!=="string"||installId.length<12){installId=`browser_${crypto.randomUUID()}_${crypto.randomUUID()}`;await writeFile(file,JSON.stringify({installId}),{mode:0o600})}const r=await fetch(`${API}/v1/devices/register`,{method:"POST",redirect:"error",headers:{"content-type":"application/json"},body:JSON.stringify({installId,deviceName:NOTIFICATION_ONLY?"CIEAV Background Commit Service":"CIEAV Control Center"}),signal:AbortSignal.timeout(5000)}),text=await r.text();const value=text?JSON.parse(text):{};if(!r.ok||typeof value.token!=="string")throw new Error(`device_registration_failed:${value.error??r.status}`);return value})();try{return await devicePromise}catch(err){devicePromise=undefined;throw err}}
async function api(route,opt={}){const dev=await device(),r=await fetch(`${API}${route}`,{...opt,redirect:"error",signal:AbortSignal.timeout(7000),headers:{"content-type":"application/json",authorization:`Bearer ${dev.token}`,...(opt.headers??{})}}),text=await r.text();let value={};try{value=text?JSON.parse(text):{}}catch{value={error:"invalid_json"}}if(!r.ok)throw new Error(`${r.status}:${value.error??value.detail??"api_error"}`);return value}
async function realitySnapshot(){const [intents,loops,approvals,proofs,business]=await Promise.all([api("/v1/intents"),api("/v1/open-loops"),api("/v1/reality/approvals"),api("/v1/proofs"),api("/v1/business/plans")]);return{intents:intents.intents??[],openLoops:loops.openLoops??[],approvals:approvals.approvals??[],proofs:proofs.proofs??[],businessPlans:business.plans??[],approvalMode:"read-only",generatedAt:new Date().toISOString()}}

http.createServer=function(...args){
  if(typeof args[0]!=="function"&&typeof args[1]!=="function")return originalCreateServer(...args);
  const listener=typeof args[0]==="function"?args[0]:args[1],options=typeof args[0]==="function"?undefined:args[0];
  const wrapped=async(req,res)=>{let u;try{u=new URL(req.url??"/",`http://${req.headers.host??`127.0.0.1:${CONTROL_PORT}`}`)}catch{return listener(req,res)}const isReality=u.pathname==="/api/reality",isLab=u.pathname==="/api/lab/evaluate",isNativeApproval=u.pathname==="/api/native-approval",isObserve=u.pathname==="/api/observe",isCommit=u.pathname==="/api/commit";if(!isReality&&!isLab&&!isNativeApproval&&!isObserve&&!isCommit)return listener(req,res);if(isObserve){if(req.method!=="POST")return send(res,405,{error:"method_not_allowed"});if(!loopbackPeer(req)||req.headers.origin)return send(res,403,{error:"browser_observation_peer_rejected"});if(!observationAuthorized(req))return send(res,401,{error:"browser_observation_unauthorized"});try{const payload=await readBody(req,16_384),observation=await observeBrowserPageFromSessions(activeCdpSessions(),{origin:payload.origin,url:payload.url,maxDocumentBytes:payload.maxDocumentBytes});return send(res,200,{ok:true,observation})}catch(err){const message=String(err?.message??err).slice(0,500),status=message==="body_too_large"?413:message.includes("unavailable")||message.includes("ambiguous")?409:400;return send(res,status,{error:message})}}if(isCommit){if(req.method!=="POST")return send(res,405,{error:"method_not_allowed"});if(!loopbackPeer(req)||!req.headers.origin||!ownOrigin(req))return send(res,403,{error:"browser_commit_peer_rejected"});if(!controlBearerAuthorized(req))return send(res,401,{error:"browser_commit_unauthorized"});try{const payload=await readBody(req,80_000),result=await commitBrowserActionFromSessions(activeCdpSessions(),payload);return send(res,200,{ok:true,result})}catch(err){const message=String(err?.message??err).slice(0,500),status=message==="body_too_large"?413:message.includes("effect_unknown")?500:message.includes("unavailable")||message.includes("ambiguous")?409:message.includes("selector_not_found")?404:400;return send(res,status,{error:message})}}if(isNativeApproval){if(req.method!=="POST")return send(res,405,{error:"method_not_allowed"});if(!loopbackPeer(req)||req.headers.origin)return send(res,403,{error:"native_approval_callback_rejected"});if(!allowNativeActivation())return send(res,429,{error:"rate_limited"});try{const payload=await readBody(req,64_000);if(!payload.capability||typeof payload.capability!=="object"||Array.isArray(payload.capability))throw new Error("native_approval_capability_required");const result=await api("/v1/reality/native-approval-activation",{method:"POST",body:JSON.stringify({capability:payload.capability})});return send(res,200,result)}catch(err){const message=String(err?.message??err);return send(res,message==="body_too_large"?413:403,{error:message==="body_too_large"?message:"native_approval_callback_rejected"})}}if(!authorized(req))return send(res,401,{error:"unauthorized"});if(isLab&&(!ownOrigin(req)||req.method!=="POST"))return send(res,req.method!=="POST"?405:403,{error:req.method!=="POST"?"method_not_allowed":"origin_not_allowed"});if(isReality&&req.method!=="GET")return send(res,405,{error:"method_not_allowed"});try{if(isReality)return send(res,200,await realitySnapshot());const payload=await readBody(req),result=await api("/v1/reality/lab/evaluate",{method:"POST",body:JSON.stringify(payload)});if(result.permit||result.approval||result.permitIssued!==false||result.approvalCreated!==false||result.sideEffects!==false||result.simulation!==true)throw new Error("action_lab_authority_invariant_violation");return send(res,200,result)}catch(err){const message=String(err?.message??err).slice(0,500);return send(res,message==="body_too_large"?413:400,{error:message})}};
  return options===undefined?originalCreateServer(wrapped):originalCreateServer(options,wrapped);
};

await import("./main-core.mjs");

if(NOTIFICATION_ONLY){
  let primed=false;
  const fingerprints=new Map(),approvalFingerprints=new Map();
  const fingerprint=r=>`${String(r?.status??"")}|${String(r?.outcome?.status??"")}`;
  const summary=r=>String(r?.manifest?.summary??r?.manifest?.actionType??"Consequential action").replace(/\s+/g," ").trim().slice(0,180);
  const pollReceipts=async()=>{
    const value=await api("/v1/receipts?limit=100"),rows=Array.isArray(value.receipts)?value.receipts:[];
    if(!primed){for(const r of rows)if(r?.id)fingerprints.set(r.id,fingerprint(r));primed=true;return}
    for(const r of rows){
      if(!r?.id)continue;
      const next=fingerprint(r),prior=fingerprints.get(r.id);
      if(prior===next)continue;
      fingerprints.set(r.id,next);
      if(prior===undefined){
        if(r.status==="COMMITTED")notifyNative("CIEAV committed",summary(r),{level:"info"});
        else if(r.status==="CANCELLED")notifyNative("CIEAV blocked",summary(r),{level:"warning"});
        else notifyNative("CIEAV receipt",`${summary(r)} - ${String(r.status??"recorded")}`,{level:"info"});
      }
      const beforeOutcome=String(prior??"").split("|")[1]||"",afterOutcome=String(r?.outcome?.status??"");
      if(afterOutcome&&afterOutcome!==beforeOutcome){
        const level=afterOutcome==="OBSERVED_FAILURE"?"error":afterOutcome==="UNKNOWN"?"warning":"info";
        const label=afterOutcome==="OBSERVED_SUCCESS"?"CIEAV verified success":afterOutcome==="OBSERVED_FAILURE"?"CIEAV verified failure":"CIEAV outcome unknown";
        notifyNative(label,summary(r),{level});
      }
    }
  };
  const pollApprovals=async()=>{
    const value=await api("/v1/reality/approvals"),rows=Array.isArray(value.approvals)?value.approvals:[],active=new Set();
    for(const approval of rows){
      if(!approval?.id||approval.status!=="PENDING"||Date.parse(approval.expiresAt)<=Date.now())continue;
      active.add(approval.id);
      const fp=`${approval.status}|${approval.expiresAt}|${approval.risk}|${approval.summary}`;
      if(approvalFingerprints.get(approval.id)===fp)continue;
      let caps;try{caps=await api(`/v1/reality/approvals/${encodeURIComponent(approval.id)}/native-capabilities`)}catch{continue}
      const ok=notifyNativeApproval({title:"CIEAV approval required",message:`${String(approval.summary??"Consequential action").replace(/\s+/g," ").trim().slice(0,160)} · Risk ${String(approval.risk??"UNKNOWN")}`,risk:approval.risk,expiresAt:approval.expiresAt,callbackUrl:`http://127.0.0.1:${CONTROL_PORT}/api/native-approval`,approve:caps.approve,deny:caps.deny});
      approvalFingerprints.set(approval.id,fp);
      if(!ok)notifyNative("CIEAV action blocked pending approval",String(approval.summary??"Consequential action"),{level:"warning"});
    }
    for(const id of approvalFingerprints.keys())if(!active.has(id))approvalFingerprints.delete(id);
  };
  const poll=async()=>{await Promise.allSettled([pollReceipts(),pollApprovals()])};
  void poll().catch(()=>{});
  const timer=setInterval(()=>void poll().catch(()=>{}),1500);
  timer.unref?.();
}
