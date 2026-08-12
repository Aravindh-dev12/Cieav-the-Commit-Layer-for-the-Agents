import type {ActionContext,ActionManifest} from "@latch/contracts";
import {privacyReduceContext,detectPromptInjection} from "./privacy.js";
import {mergeGate} from "./consensus.js";
import type {GateResult} from "./types.js";

const risks=new Set(["LOW","MEDIUM","HIGH","CRITICAL"]),reversibilities=new Set(["REVERSIBLE","DELAYABLE","COMPENSABLE","IRREVERSIBLE","UNKNOWN"]);

export interface HuggingFaceOptions{gatewayUrl:string;gatewayToken:string;timeoutMs:number}
export interface HuggingFaceMeta{ok:boolean;model?:string;provider?:string|null;mode?:string;latencyMs:number;error?:string;needsDeepReview?:boolean;promptInjectionSuspected?:boolean}

function parseGate(x:any):GateResult{if(!x||typeof x!=="object")throw new Error("invalid_hf_result");if(typeof x.actionType!=="string"||!risks.has(x.risk)||!reversibilities.has(x.reversibility)||typeof x.confidence!=="number"||typeof x.needsDeepReview!=="boolean"||typeof x.promptInjectionSuspected!=="boolean"||!Array.isArray(x.reasons))throw new Error("invalid_hf_gate");return{actionType:x.actionType,risk:x.risk,reversibility:x.reversibility,confidence:Math.max(0,Math.min(1,x.confidence)),needsDeepReview:x.needsDeepReview,promptInjectionSuspected:x.promptInjectionSuspected,reasons:x.reasons.filter((r:any)=>typeof r==="string").slice(0,8)}}

export async function analyzeWithHuggingFace(ctx:ActionContext,base:ActionManifest,opt:HuggingFaceOptions):Promise<{manifest:ActionManifest;gate?:GateResult;meta:HuggingFaceMeta}>{
 const started=Date.now(),reduced=privacyReduceContext(ctx),injection=detectPromptInjection(ctx),ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),Math.max(1500,opt.timeoutMs));
 try{const r=await fetch(`${opt.gatewayUrl.replace(/\/$/,"")}/v1/hf/analyze`,{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${opt.gatewayToken}`},body:JSON.stringify({context:reduced,base:{actionType:base.actionType,risk:base.risk,reversibility:base.reversibility,confidence:base.confidence,dataCategories:base.dataCategories}}),signal:ctrl.signal});const raw=await r.text();let x:any={};try{x=raw?JSON.parse(raw):{}}catch{}if(!r.ok||!x?.ok)throw new Error(String(x?.error??`hf_gateway_${r.status}`));const gate=parseGate(x.result),manifest=mergeGate(base,gate,injection);return{manifest,gate,meta:{ok:true,model:x.meta?.model,provider:x.meta?.provider??null,mode:x.meta?.mode,latencyMs:Number(x.meta?.latencyMs??Date.now()-started),needsDeepReview:gate.needsDeepReview,promptInjectionSuspected:gate.promptInjectionSuspected}}}catch(err:any){return{manifest:base,meta:{ok:false,latencyMs:Date.now()-started,error:String(err?.name==="AbortError"?"hf_timeout":err?.message??err).slice(0,500)}}}finally{clearTimeout(timer)}}

export function shouldEscalateAfterHuggingFace(manifest:ActionManifest,gate:GateResult|undefined,injection:boolean){if(!gate)return true;return gate.needsDeepReview||injection||gate.promptInjectionSuspected||gate.confidence<.78||manifest.risk==="HIGH"||manifest.risk==="CRITICAL"||manifest.reversibility==="UNKNOWN"}
