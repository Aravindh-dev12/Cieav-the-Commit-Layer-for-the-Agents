import crypto from "node:crypto";
import {ProofObservationRequestSchema,ProofProviderResultSchema,ProviderHealthSchema,type ProofObservationRequest,type ProofProviderResult} from "@cieav/contracts";
import type {ProofProvider} from "@cieav/core/provider-runtime";

const PROVIDER_ID="cieav.http-proof.v1";
const digest=(value:Buffer|string)=>crypto.createHash("sha256").update(value).digest("hex");

export class HttpProofProvider implements ProofProvider{
  readonly descriptor={id:PROVIDER_ID,version:"1",evidenceKinds:["HTTP_STATUS","HTTP_HEADER","HTTP_BODY_SHA256"],canObservePreState:true,canObservePostState:true,canSettleOutcome:true,authority:false as const};
  private readonly allowedOrigins:Set<string>;
  constructor(allowedOrigins:string[],private readonly maxBodyBytes=4*1024*1024){
    if(!allowedOrigins.length)throw new Error("http_proof_allowed_origin_required");
    if(!Number.isSafeInteger(maxBodyBytes)||maxBodyBytes<1||maxBodyBytes>32*1024*1024)throw new Error("http_proof_invalid_max_body_bytes");
    this.allowedOrigins=new Set(allowedOrigins.map(value=>new URL(value).origin));
  }
  async health(){return ProviderHealthSchema.parse({ok:true,providerId:PROVIDER_ID,checkedAt:new Date().toISOString(),detail:"HTTP proof provider ready with origin allowlist and credential-free deterministic readback.",authority:false})}
  private target(targetRef:string){
    const url=new URL(targetRef);
    if(!["http:","https:"].includes(url.protocol))throw new Error("http_proof_protocol_not_allowed");
    if(url.username||url.password)throw new Error("http_proof_embedded_credentials_forbidden");
    if(!this.allowedOrigins.has(url.origin))throw new Error("http_proof_origin_not_allowed");
    return url;
  }
  async observe(raw:ProofObservationRequest):Promise<ProofProviderResult>{
    const request=ProofObservationRequestSchema.parse(raw);
    if(request.providerId!==PROVIDER_ID)throw new Error("http_proof_provider_id_mismatch");
    const observedAt=new Date().toISOString();
    try{
      const url=this.target(request.targetRef),method=request.operation.toUpperCase()==="HEAD"?"HEAD":"GET";
      if(!["GET","HEAD"].includes(method))throw new Error("http_proof_method_not_allowed");
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),request.timeoutMs);
      let response:Response;
      try{response=await fetch(url,{method,redirect:"error",credentials:"omit",cache:"no-store",headers:{accept:"*/*","user-agent":"CIEAV-Proof/1"},signal:controller.signal})}finally{clearTimeout(timer)}
      const chunks:Uint8Array[]=[];let total=0;
      if(method!=="HEAD"&&response.body){const reader=response.body.getReader();for(;;){const {done,value}=await reader.read();if(done)break;if(value){total+=value.byteLength;if(total>this.maxBodyBytes){await reader.cancel();throw new Error("http_proof_body_too_large")}chunks.push(value)}}}
      const body=Buffer.concat(chunks.map(x=>Buffer.from(x))),bodyDigest=digest(body);
      const observations=[
        {kind:"HTTP_STATUS",source:url.toString(),observedAt,summary:`status=${response.status}`,digest:digest(String(response.status)),confidence:1},
        {kind:"HTTP_BODY_SHA256",source:url.toString(),observedAt,summary:`sha256=${bodyDigest};bytes=${body.byteLength}`,digest:bodyDigest,confidence:1}
      ];
      const checks=request.expectedState.map(expected=>{
        if(expected.startsWith("status:"))return response.status===Number(expected.slice(7));
        if(expected.startsWith("body-sha256:"))return bodyDigest===expected.slice(12).toLowerCase();
        if(expected.startsWith("header:")){
          const spec=expected.slice(7),i=spec.indexOf("=");if(i<=0)return null;
          return response.headers.get(spec.slice(0,i).trim())===spec.slice(i+1).trim();
        }
        return null;
      });
      const understood=checks.filter((x):x is boolean=>x!==null),allUnderstood=understood.length===checks.length;
      const proposedOutcome=request.expectedState.length&&allUnderstood?(understood.every(Boolean)?"SUCCESS":"FAILURE"):undefined;
      return ProofProviderResultSchema.parse({provider:this.descriptor,requestId:request.requestId,observations,...(proposedOutcome?{proposedOutcome}:{}),conclusive:Boolean(proposedOutcome),authority:false,mayMintExecutionAuthority:false});
    }catch(error:any){
      return ProofProviderResultSchema.parse({provider:this.descriptor,requestId:request.requestId,observations:[],conclusive:false,error:String(error?.name==="AbortError"?"http_proof_timeout":error?.message??error).slice(0,1500),authority:false,mayMintExecutionAuthority:false});
    }
  }
}
