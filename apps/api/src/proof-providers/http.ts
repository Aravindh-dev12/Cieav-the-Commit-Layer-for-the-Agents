import crypto from "node:crypto";
import * as http from "node:http";
import * as https from "node:https";
import {lookup} from "node:dns/promises";
import {BlockList,isIP} from "node:net";
import {ProofObservationRequestSchema,ProofProviderResultSchema,ProviderHealthSchema,type ProofObservationRequest,type ProofProviderResult} from "@cieav/contracts";
import type {ProofProvider} from "@cieav/core/provider-runtime";

const PROVIDER_ID="cieav.http-proof.v1";
const digest=(value:Buffer|string)=>crypto.createHash("sha256").update(value).digest("hex");
const blocked=new BlockList();
for(const [address,prefix,type] of [
  ["0.0.0.0",8,"ipv4"],["10.0.0.0",8,"ipv4"],["100.64.0.0",10,"ipv4"],["127.0.0.0",8,"ipv4"],["169.254.0.0",16,"ipv4"],["172.16.0.0",12,"ipv4"],["192.168.0.0",16,"ipv4"],["198.18.0.0",15,"ipv4"],["224.0.0.0",4,"ipv4"],["240.0.0.0",4,"ipv4"],
  ["::",128,"ipv6"],["::1",128,"ipv6"],["::ffff:0:0",96,"ipv6"],["fc00::",7,"ipv6"],["fe80::",10,"ipv6"],["ff00::",8,"ipv6"]
] as const)blocked.addSubnet(address,prefix,type);

type Readback={status:number;headers:http.IncomingHttpHeaders;body:Buffer;address:string};
const hostnameForLookup=(hostname:string)=>hostname.startsWith("[")&&hostname.endsWith("]")?hostname.slice(1,-1):hostname;

export class HttpProofProvider implements ProofProvider{
  readonly descriptor={id:PROVIDER_ID,version:"1",evidenceKinds:["HTTP_ENDPOINT","HTTP_STATUS","HTTP_HEADER","HTTP_BODY_SHA256"],canObservePreState:true,canObservePostState:true,canSettleOutcome:true,authority:false as const};
  private readonly allowedOrigins:Set<string>;
  constructor(allowedOrigins:string[],private readonly maxBodyBytes=4*1024*1024,private readonly allowPrivateNetworks=false){
    if(!allowedOrigins.length)throw new Error("http_proof_allowed_origin_required");
    if(!Number.isSafeInteger(maxBodyBytes)||maxBodyBytes<1||maxBodyBytes>32*1024*1024)throw new Error("http_proof_invalid_max_body_bytes");
    this.allowedOrigins=new Set(allowedOrigins.map(value=>new URL(value).origin));
  }
  async health(){return ProviderHealthSchema.parse({ok:true,providerId:PROVIDER_ID,checkedAt:new Date().toISOString(),detail:`HTTP proof provider ready with origin allowlist, DNS pinning, redirects disabled and private-network access ${this.allowPrivateNetworks?"explicitly enabled":"blocked"}.`,authority:false})}
  private target(targetRef:string){
    const url=new URL(targetRef);
    if(!["http:","https:"].includes(url.protocol))throw new Error("http_proof_protocol_not_allowed");
    if(url.username||url.password)throw new Error("http_proof_embedded_credentials_forbidden");
    if(!this.allowedOrigins.has(url.origin))throw new Error("http_proof_origin_not_allowed");
    return url;
  }
  private async resolve(url:URL){
    const hostname=hostnameForLookup(url.hostname),results=await lookup(hostname,{all:true,verbatim:true});
    if(!results.length)throw new Error("http_proof_dns_no_address");
    if(!this.allowPrivateNetworks&&results.some(item=>blocked.check(item.address,item.family===6?"ipv6":"ipv4")))throw new Error("http_proof_private_or_special_address_forbidden");
    return results[0]!;
  }
  private async read(url:URL,method:"GET"|"HEAD",timeoutMs:number):Promise<Readback>{
    const resolved=await this.resolve(url),hostname=hostnameForLookup(url.hostname),client=url.protocol==="https:"?https:http;
    return await new Promise<Readback>((resolve,reject)=>{
      let settled=false,total=0;const chunks:Buffer[]=[];
      const done=(error?:Error,value?:Readback)=>{if(settled)return;settled=true;error?reject(error):resolve(value!)};
      const req=client.request({protocol:url.protocol,hostname:resolved.address,family:resolved.family,port:url.port?Number(url.port):url.protocol==="https:"?443:80,path:`${url.pathname}${url.search}`,method,headers:{host:url.host,accept:"*/*","user-agent":"CIEAV-Proof/1","accept-encoding":"identity",connection:"close"},...(url.protocol==="https:"&&!isIP(hostname)?{servername:hostname}:{})},res=>{
        const status=res.statusCode??0;
        if(status>=300&&status<400&&res.headers.location){res.resume();done(new Error("http_proof_redirect_forbidden"));return}
        res.on("data",chunk=>{if(settled)return;const part=Buffer.from(chunk);total+=part.byteLength;if(total>this.maxBodyBytes){res.destroy();done(new Error("http_proof_body_too_large"));return}chunks.push(part)});
        res.on("end",()=>done(undefined,{status,headers:res.headers,body:method==="HEAD"?Buffer.alloc(0):Buffer.concat(chunks),address:resolved.address}));
        res.on("error",error=>done(error));
      });
      req.setTimeout(timeoutMs,()=>req.destroy(new Error("http_proof_timeout")));
      req.on("error",error=>done(error));
      req.end();
    });
  }
  async observe(raw:ProofObservationRequest):Promise<ProofProviderResult>{
    const request=ProofObservationRequestSchema.parse(raw);
    if(request.providerId!==PROVIDER_ID)throw new Error("http_proof_provider_id_mismatch");
    const observedAt=new Date().toISOString();
    try{
      const url=this.target(request.targetRef),operation=request.operation.toUpperCase(),method:"GET"|"HEAD"=operation==="GET"||operation==="READ"?"GET":operation==="HEAD"?"HEAD":(()=>{throw new Error("http_proof_method_not_allowed")})();
      const response=await this.read(url,method,request.timeoutMs),bodyDigest=digest(response.body);
      const observations=[
        {kind:"HTTP_ENDPOINT",source:url.toString(),observedAt,summary:`resolvedAddressDigest=${digest(response.address)}`,digest:digest(response.address),confidence:1},
        {kind:"HTTP_STATUS",source:url.toString(),observedAt,summary:`status=${response.status}`,digest:digest(String(response.status)),confidence:1},
        {kind:"HTTP_BODY_SHA256",source:url.toString(),observedAt,summary:`sha256=${bodyDigest};bytes=${response.body.byteLength}`,digest:bodyDigest,confidence:1}
      ];
      const checks=request.expectedState.map(expected=>{
        if(expected.startsWith("status:"))return response.status===Number(expected.slice(7));
        if(expected.startsWith("body-sha256:"))return bodyDigest===expected.slice(12).toLowerCase();
        if(expected.startsWith("header:")){
          const spec=expected.slice(7),i=spec.indexOf("=");if(i<=0)return null;const name=spec.slice(0,i).trim().toLowerCase(),wanted=spec.slice(i+1).trim(),actual=response.headers[name];
          return(Array.isArray(actual)?actual.join(", "):actual===undefined?null:String(actual))===wanted;
        }
        return null;
      });
      const understood=checks.filter((x):x is boolean=>x!==null),allUnderstood=understood.length===checks.length;
      const proposedOutcome=request.expectedState.length&&allUnderstood?(understood.every(Boolean)?"SUCCESS":"FAILURE"):undefined;
      return ProofProviderResultSchema.parse({provider:this.descriptor,requestId:request.requestId,observations,...(proposedOutcome?{proposedOutcome}:{}),conclusive:Boolean(proposedOutcome),authority:false,mayMintExecutionAuthority:false});
    }catch(error:any){
      return ProofProviderResultSchema.parse({provider:this.descriptor,requestId:request.requestId,observations:[],conclusive:false,error:String(error?.message??error).slice(0,1500),authority:false,mayMintExecutionAuthority:false});
    }
  }
}
