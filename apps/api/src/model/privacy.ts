import crypto from "node:crypto";
import type {ActionContext} from "@latch/contracts";

const EMAIL=/\b[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g;
const PHONE=/\b(?:\+?\d[\d\s().-]{7,}\d)\b/g;
const CARD=/\b(?:\d[ -]*?){13,19}\b/g;
const OTP=/(?<!\d)\d{6}(?!\d)/g;
const API_KEY=/(?:sk|pk|api)[-_][A-Za-z0-9_-]{16,}/gi;
const BEARER=/\bBearer\s+[A-Za-z0-9._~+\/-]{16,}={0,2}\b/gi;
const SENSITIVE_TESTS=[new RegExp(EMAIL.source,"i"),new RegExp(PHONE.source,"i"),new RegExp(CARD.source,"i"),new RegExp(OTP.source),new RegExp(API_KEY.source,"i"),new RegExp(BEARER.source,"i")];
const contextKeys=new Set(["requestId","url","origin","title","element","form","nearbyText","timestamp","clientVersion"]);
const elementKeys=new Set(["tag","role","text","ariaLabel","name","inputType","href","method","action","declaredActionType","declaredSummary","declaredReversibility"]);
const formKeys=new Set(["method","action","fields","fileNames","submitterText"]);
const fieldKeys=new Set(["name","type","label","required","redacted","dataCategory"]);
const baselineKeys=new Set(["actionType","risk","reversibility","confidence","dataCategories"]);

function cleanText(raw:unknown,limit:number){
  if(typeof raw!=="string")return undefined;
  return raw.replace(EMAIL,"[EMAIL]").replace(PHONE,"[PHONE]").replace(CARD,"[POSSIBLE_CARD]").replace(OTP,"[POSSIBLE_OTP]").replace(API_KEY,"[POSSIBLE_SECRET]").replace(BEARER,"[POSSIBLE_BEARER]").slice(0,limit);
}
function stripUrl(raw?:string){
  if(!raw)return undefined;
  try{const u=new URL(raw);if(!["http:","https:"].includes(u.protocol)||u.username||u.password)return undefined;return`${u.origin}${u.pathname}`.slice(0,4096)}catch{return undefined}
}
function genericFileName(raw:string){const m=String(raw??"").match(/\.([A-Za-z0-9]{1,10})$/);return m?`[selected-file.${m[1]!.toLowerCase()}]`:"[selected-file]"}
function exactKeys(raw:any,allowed:Set<string>,where:string){if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new Error(`privacy_invalid_${where}`);for(const k of Object.keys(raw))if(!allowed.has(k))throw new Error(`privacy_forbidden_${where}_field:${k}`)}
function reducedUrl(raw:unknown,where:string){if(typeof raw!=="string")return;let u:URL;try{u=new URL(raw)}catch{throw new Error(`privacy_invalid_${where}_url`)}if(!["http:","https:"].includes(u.protocol)||u.username||u.password||u.search||u.hash)throw new Error(`privacy_unreduced_${where}_url`)}
function rawSensitive(raw:unknown){return typeof raw==="string"&&SENSITIVE_TESTS.some(r=>r.test(raw))}
function assertNoRawSensitive(raw:unknown,where:string){if(rawSensitive(raw))throw new Error(`privacy_sensitive_literal:${where}`)}

export function privacyReduceContext(ctx:ActionContext):ActionContext{
  const url=stripUrl(ctx.url)??stripUrl(ctx.origin);if(!url)throw new Error("privacy_invalid_action_url");
  const origin=new URL(url).origin;
  const element={
    tag:cleanText(ctx.element.tag,50)??"unknown",
    ...(cleanText(ctx.element.role,80)?{role:cleanText(ctx.element.role,80)}:{}),
    ...(cleanText(ctx.element.text,700)?{text:cleanText(ctx.element.text,700)}:{}),
    ...(cleanText(ctx.element.ariaLabel,300)?{ariaLabel:cleanText(ctx.element.ariaLabel,300)}:{}),
    ...(cleanText(ctx.element.name,200)?{name:cleanText(ctx.element.name,200)}:{}),
    ...(cleanText(ctx.element.inputType,80)?{inputType:cleanText(ctx.element.inputType,80)}:{}),
    ...(stripUrl(ctx.element.href)?{href:stripUrl(ctx.element.href)}:{}),
    ...(cleanText(ctx.element.method,20)?{method:cleanText(ctx.element.method,20)}:{}),
    ...(stripUrl(ctx.element.action)?{action:stripUrl(ctx.element.action)}:{}),
    ...(cleanText(ctx.element.declaredActionType,160)?{declaredActionType:cleanText(ctx.element.declaredActionType,160)}:{}),
    ...(cleanText(ctx.element.declaredSummary,300)?{declaredSummary:cleanText(ctx.element.declaredSummary,300)}:{}),
    ...(ctx.element.declaredReversibility?{declaredReversibility:ctx.element.declaredReversibility}:{})
  };
  const form=ctx.form?{
    ...(cleanText(ctx.form.method,20)?{method:cleanText(ctx.form.method,20)}:{}),
    ...(stripUrl(ctx.form.action)?{action:stripUrl(ctx.form.action)}:{}),
    fields:ctx.form.fields.slice(0,100).map(f=>({
      name:cleanText(f.name,160)??"field",
      type:cleanText(f.type,80)??"unknown",
      ...(cleanText(f.label,220)?{label:cleanText(f.label,220)}:{}),
      ...(typeof f.required==="boolean"?{required:f.required}:{}),
      redacted:true,
      ...(f.dataCategory?{dataCategory:f.dataCategory}:{})
    })),
    fileNames:ctx.form.fileNames.slice(0,20).map(genericFileName),
    ...(cleanText(ctx.form.submitterText,300)?{submitterText:cleanText(ctx.form.submitterText,300)}:{})
  }:undefined;
  return{
    requestId:cleanText(ctx.requestId,128)??crypto.randomUUID(),
    url,origin,
    ...(cleanText(ctx.title,300)?{title:cleanText(ctx.title,300)}:{}),
    element,
    ...(form?{form}:{}),
    ...(cleanText(ctx.nearbyText,1800)?{nearbyText:cleanText(ctx.nearbyText,1800)}:{}),
    timestamp:ctx.timestamp,
    clientVersion:cleanText(ctx.clientVersion,50)??"unknown"
  };
}

export function assertCloudPrivacyIngress(raw:any){
  exactKeys(raw,contextKeys,"context");
  if("pageText" in raw)throw new Error("privacy_page_text_forbidden");
  reducedUrl(raw.url,"context");
  if(typeof raw.origin!=="string")throw new Error("privacy_origin_required");
  let origin:URL;try{origin=new URL(raw.origin)}catch{throw new Error("privacy_invalid_origin")}
  if(origin.origin!==raw.origin||origin.username||origin.password||origin.search||origin.hash)throw new Error("privacy_unreduced_origin");
  for(const [k,v] of Object.entries(raw))if(typeof v==="string"&&!['url','origin','timestamp'].includes(k))assertNoRawSensitive(v,`context.${k}`);
  exactKeys(raw.element,elementKeys,"element");
  for(const [k,v] of Object.entries(raw.element)){
    if(["href","action"].includes(k))reducedUrl(v,`element_${k}`);
    else assertNoRawSensitive(v,`element.${k}`);
  }
  if(raw.form!==undefined){
    exactKeys(raw.form,formKeys,"form");
    reducedUrl(raw.form.action,"form_action");
    assertNoRawSensitive(raw.form.submitterText,"form.submitterText");
    if(!Array.isArray(raw.form.fields)||!Array.isArray(raw.form.fileNames))throw new Error("privacy_invalid_form_arrays");
    for(const [i,f] of raw.form.fields.entries()){
      exactKeys(f,fieldKeys,"field");
      if(f.redacted!==true)throw new Error(`privacy_field_not_redacted:${i}`);
      assertNoRawSensitive(f.name,`field.${i}.name`);assertNoRawSensitive(f.label,`field.${i}.label`);
    }
    for(const [i,n] of raw.form.fileNames.entries())if(typeof n!=="string"||!/^\[selected-file(?:\.[A-Za-z0-9]{1,10})?\]$/.test(n))throw new Error(`privacy_raw_filename_forbidden:${i}`);
  }
  return true;
}

export function assertCloudPrivacyBaseline(raw:any){
  exactKeys(raw,baselineKeys,"baseline");
  if(typeof raw.actionType!=="string"||rawSensitive(raw.actionType))throw new Error("privacy_invalid_baseline_action");
  if(!Array.isArray(raw.dataCategories)||raw.dataCategories.some((x:any)=>typeof x!=="string"))throw new Error("privacy_invalid_baseline_categories");
  return true;
}

export function detectPromptInjection(ctx:ActionContext){const t=[ctx.element.text,ctx.element.ariaLabel,ctx.element.name,ctx.form?.submitterText,ctx.nearbyText,ctx.title].filter(Boolean).join(" \n");return[/ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|messages|rules)/i,/(system|developer)\s+(prompt|message|instructions)/i,/you\s+are\s+(chatgpt|an?\s+assistant|the\s+model)/i,/(reveal|print|show|exfiltrate)\s+(the\s+)?(prompt|instructions|system message|developer message)/i,/do\s+not\s+(classify|warn|block|intercept|report)/i,/(override|bypass)\s+(safety|policy|instructions|latch|cieav)/i].some(r=>r.test(t))}
export function semanticFingerprint(ctx:ActionContext){return crypto.createHash("sha256").update(JSON.stringify({...ctx,requestId:"",timestamp:""})).digest("hex")}
