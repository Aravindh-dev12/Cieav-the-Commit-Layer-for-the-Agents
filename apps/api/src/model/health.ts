import {CIEAV_PRIVATE_INFERENCE_PROTOCOL} from "./cloud.js";
import {privateInferenceReliability,providerKey,type ProviderHealthSnapshot} from "./reliability.js";

export interface PrivateInferenceHealthOptions {baseUrl:string;model:string;apiKey?:string;timeoutMs:number}
export interface PrivateInferenceHealthResult {ok:boolean;model:string;listed:boolean;latencyMs:number;health:ProviderHealthSnapshot;error?:string}

function safeBaseUrl(raw:string){
  let parsed:URL;try{parsed=new URL(raw)}catch{throw new Error("private_inference_invalid_base_url")}
  const host=parsed.hostname.toLowerCase(),loopback=host==="127.0.0.1"||host==="localhost"||host==="::1"||host==="[::1]";
  if(parsed.username||parsed.password||parsed.search||parsed.hash)throw new Error("private_inference_base_url_must_not_embed_credentials_query_or_fragment");
  if(parsed.protocol!=="https:"&&!(loopback&&parsed.protocol==="http:"))throw new Error("private_inference_requires_https_except_loopback");
  return raw.replace(/\/$/,"");
}

export async function probePrivateInferenceHealth(opt:PrivateInferenceHealthOptions):Promise<PrivateInferenceHealthResult>{
  const started=Date.now(),baseUrl=safeBaseUrl(opt.baseUrl),key=providerKey(baseUrl,opt.model),lease=privateInferenceReliability.acquire(key);
  if(!lease.ok)return{ok:false,model:opt.model,listed:false,latencyMs:Date.now()-started,health:privateInferenceReliability.snapshot(key),error:`private_inference_${lease.reason}`};
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.max(1000,Math.min(10_000,opt.timeoutMs)));
  try{
    const headers:Record<string,string>={accept:"application/json","x-cieav-inference-protocol":CIEAV_PRIVATE_INFERENCE_PROTOCOL};if(opt.apiKey)headers.authorization=`Bearer ${opt.apiKey}`;
    const response=await fetch(`${baseUrl}/models`,{headers,signal:controller.signal,redirect:"error"});
    if(!response.ok)throw new Error(`private_inference_health_http_${response.status}`);
    const value=await response.json() as any,data=Array.isArray(value?.data)?value.data:[],listed=data.some((x:any)=>x&&typeof x.id==="string"&&x.id===opt.model);
    privateInferenceReliability.success(key);
    return{ok:true,model:opt.model,listed,latencyMs:Date.now()-started,health:privateInferenceReliability.snapshot(key)};
  }catch(error){const message=(error instanceof Error?error.message:String(error)).slice(0,300);privateInferenceReliability.failure(key,message);return{ok:false,model:opt.model,listed:false,latencyMs:Date.now()-started,health:privateInferenceReliability.snapshot(key),error:message}}
  finally{clearTimeout(timer);lease.release()}
}
