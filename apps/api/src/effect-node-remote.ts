import type {EffectExecutionAdapter,EffectExecutionResult} from "./effect-dispatch.js";

function endpointFromTool(tool:Parameters<EffectExecutionAdapter["execute"]>[0]["tool"]){const raw=tool.metadata.endpoint;if(typeof raw!=="string"||!raw)throw new Error("verified Effect Node endpoint is missing");const url=new URL(raw),loopback=url.hostname==="127.0.0.1"||url.hostname==="localhost"||url.hostname==="::1";if(url.username||url.password||url.search||url.hash)throw new Error("Effect Node endpoint cannot contain credentials, query, or fragment");if(url.protocol!=="https:"&&!(loopback&&url.protocol==="http:"))throw new Error("remote Effect Node endpoint requires HTTPS");url.pathname=url.pathname.replace(/\/$/,"");return url}

export class CieavRemoteEffectNodeAdapter implements EffectExecutionAdapter{
  constructor(private readonly tokenForNode:(nodeId:string)=>string|Promise<string>,private readonly timeoutMs=30_000){}
  async execute({proposal,tool,authorization}:Parameters<EffectExecutionAdapter["execute"]>[0]):Promise<EffectExecutionResult>{
    let root:URL;try{root=endpointFromTool(tool)}catch(error){return{ok:false,definitiveFailure:true,errorClass:"invalid_verified_endpoint",error:error instanceof Error?error.message:String(error)}}
    const token=await this.tokenForNode(tool.sourceId);if(!token||token.length<43)return{ok:false,definitiveFailure:true,errorClass:"node_transport_token_unavailable",error:"Node transport authentication is unavailable."};
    const endpoint=new URL(root.toString());endpoint.pathname=`${root.pathname}/v1/effects/execute`.replace(/\/+/g,"/");
    try{const response=await fetch(endpoint,{method:"POST",redirect:"error",signal:AbortSignal.timeout(Math.max(1000,Math.min(120_000,this.timeoutMs))),headers:{"content-type":"application/json",authorization:`Bearer ${token}`},body:JSON.stringify({proposal,authorization})}),text=(await response.text()).slice(0,1_000_000);let value:any={};try{value=text?JSON.parse(text):{}}catch{return{ok:false,definitiveFailure:false,errorClass:"node_invalid_json",error:"Effect Node returned invalid JSON."}}if(!response.ok){const definitive=response.status===401||response.status===403||response.status===409||response.status===422;return{ok:false,definitiveFailure:definitive,errorClass:`node_http_${response.status}`,error:String(value.error??value.detail??"Effect Node request failed").slice(0,1000)}}return{ok:value.ok===true,definitiveFailure:value.definitiveFailure===true,result:value.result,...(typeof value.errorClass==="string"?{errorClass:value.errorClass}:{}),...(typeof value.error==="string"?{error:value.error.slice(0,1000)}:{})}}
    catch(error){return{ok:false,definitiveFailure:false,errorClass:"node_transport_error",error:error instanceof Error?error.message:String(error)}}
  }
}
