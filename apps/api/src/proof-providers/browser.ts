import * as http from "node:http";
import path from "node:path";
import {existsSync,readFileSync} from "node:fs";
import {z} from "zod";
import {ProofObservationRequestSchema,ProofProviderResultSchema,ProviderHealthSchema,type ProofObservationRequest,type ProofProviderResult} from "@cieav/contracts";
import type {ProofProvider} from "@cieav/core/provider-runtime";

const PROVIDER_ID="cieav.browser-proof.v1";
const Digest=z.string().regex(/^[0-9a-f]{64}$/);
const HttpLoopback=z.string().url().transform(value=>{const url=new URL(value);if(url.protocol!=="http:"||url.username||url.password||url.pathname!=="/"||url.search||url.hash||url.hostname!=="127.0.0.1")throw new Error("browser_proof_control_base_must_be_loopback_http");return url.origin});
const WebOrigin=z.string().url().transform(value=>{const url=new URL(value);if(!["http:","https:"].includes(url.protocol)||url.username||url.password||url.pathname!=="/"||url.search||url.hash)throw new Error("browser_proof_origin_invalid");return url.origin});
const WebUrl=z.string().url().transform(value=>{const url=new URL(value);if(!["http:","https:"].includes(url.protocol)||url.username||url.password)throw new Error("browser_proof_url_invalid");return url.href});
export const BrowserProofTargetSchema=z.object({
  id:z.string().regex(/^[A-Za-z0-9._-]{1,160}$/),
  origin:WebOrigin,
  url:WebUrl.optional(),
  controlBase:HttpLoopback.default("http://127.0.0.1:8790"),
  tokenEnv:z.string().regex(/^[A-Z][A-Z0-9_]{2,127}$/).default("CIEAV_BROWSER_OBSERVATION_TOKEN"),
  timeoutMs:z.number().int().min(500).max(30_000).default(8_000),
  maxDocumentBytes:z.number().int().min(1024).max(2*1024*1024).default(2*1024*1024)
}).strict().superRefine((value,ctx)=>{if(value.url&&new URL(value.url).origin!==value.origin)ctx.addIssue({code:z.ZodIssueCode.custom,message:"browser_proof_url_origin_mismatch",path:["url"]})});
export type BrowserProofTarget=z.infer<typeof BrowserProofTargetSchema>;
const CatalogSchema=z.object({version:z.literal(1),browserProof:z.array(BrowserProofTargetSchema).max(1000).default([])}).passthrough();
const HostObservationSchema=z.object({ok:z.literal(true),observation:z.object({url:WebUrl,origin:WebOrigin,documentSha256:Digest,documentBytes:z.number().int().nonnegative(),frameTreeSha256:Digest,frameCount:z.number().int().positive(),observedAt:z.string().datetime(),authority:z.literal(false),mayMintExecutionAuthority:z.literal(false)}).strict()}).strict();

function targetRef(id:string){if(!/^[A-Za-z0-9._-]{1,160}$/.test(id))throw new Error("browser_proof_target_id_invalid");return`browser-proof:${id}`}
export function browserProofTargetRef(id:string){return targetRef(id)}
function parseTargetRef(value:string){const match=value.match(/^browser-proof:([A-Za-z0-9._-]{1,160})$/);if(!match)throw new Error("browser_proof_target_ref_invalid");return match[1]!}
function tokenFor(target:BrowserProofTarget){const token=String(process.env[target.tokenEnv]??"");if(token.length<43)throw new Error(`browser_proof_observation_capability_missing:${target.tokenEnv}`);return token}

async function observeHost(target:BrowserProofTarget,timeoutMs:number){
  const endpoint=new URL("/api/observe",target.controlBase),token=tokenFor(target),body=Buffer.from(JSON.stringify({origin:target.origin,...(target.url?{url:target.url}:{}),maxDocumentBytes:target.maxDocumentBytes}),"utf8");
  return await new Promise<z.infer<typeof HostObservationSchema>>((resolve,reject)=>{
    let settled=false,total=0;const chunks:Buffer[]=[];
    const done=(error?:Error,value?:z.infer<typeof HostObservationSchema>)=>{if(settled)return;settled=true;error?reject(error):resolve(value!)};
    const req=http.request({protocol:"http:",hostname:"127.0.0.1",port:Number(endpoint.port||80),path:endpoint.pathname,method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/json","content-length":String(body.byteLength),accept:"application/json",connection:"close"}},res=>{
      res.on("data",chunk=>{if(settled)return;const part=Buffer.from(chunk);total+=part.length;if(total>256*1024){res.destroy();done(new Error("browser_proof_host_response_too_large"));return}chunks.push(part)});
      res.on("end",()=>{if(settled)return;const text=Buffer.concat(chunks).toString("utf8");let value:any;try{value=text?JSON.parse(text):{}}catch{return done(new Error("browser_proof_host_invalid_json"))}if((res.statusCode??0)<200||(res.statusCode??0)>=300)return done(new Error(`browser_proof_host_${res.statusCode??0}:${String(value?.error??"request_failed").slice(0,300)}`));try{return done(undefined,HostObservationSchema.parse(value))}catch(error:any){return done(new Error(`browser_proof_host_contract_invalid:${String(error?.message??error).slice(0,300)}`))}});
      res.on("error",error=>done(error));
    });
    req.setTimeout(Math.min(timeoutMs,target.timeoutMs),()=>req.destroy(new Error("browser_proof_timeout")));
    req.on("error",error=>done(error));
    req.end(body);
  });
}

export class BrowserProofProvider implements ProofProvider{
  readonly descriptor={id:PROVIDER_ID,version:"1",evidenceKinds:["BROWSER_URL","BROWSER_DOCUMENT_SHA256","BROWSER_FRAME_TREE_SHA256"],canObservePreState:true,canObservePostState:true,canSettleOutcome:true,authority:false as const};
  private readonly targets=new Map<string,BrowserProofTarget>();
  constructor(targets:BrowserProofTarget[]){if(!targets.length)throw new Error("browser_proof_target_required");for(const raw of targets){const target=BrowserProofTargetSchema.parse(raw);if(this.targets.has(target.id))throw new Error(`browser_proof_duplicate_target:${target.id}`);tokenFor(target);this.targets.set(target.id,target)}}
  static fromCatalogFile(file:string){if(!path.isAbsolute(file))throw new Error("browser_proof_catalog_must_be_absolute");if(!existsSync(file))throw new Error(`browser_proof_catalog_missing:${file}`);const catalog=CatalogSchema.parse(JSON.parse(readFileSync(file,"utf8")));return catalog.browserProof.length?new BrowserProofProvider(catalog.browserProof):null}
  async health(){return ProviderHealthSchema.parse({ok:true,providerId:PROVIDER_ID,checkedAt:new Date().toISOString(),detail:`Browser proof provider ready with ${this.targets.size} capability-isolated, loopback-only DOM observers.`,authority:false})}
  async observe(raw:ProofObservationRequest):Promise<ProofProviderResult>{
    const request=ProofObservationRequestSchema.parse(raw);if(request.providerId!==PROVIDER_ID)throw new Error("browser_proof_provider_id_mismatch");
    try{
      if(!["READ","OBSERVE","DOM_SNAPSHOT"].includes(request.operation.toUpperCase()))throw new Error("browser_proof_operation_not_read_only");
      const id=parseTargetRef(request.targetRef),target=this.targets.get(id);if(!target)throw new Error("browser_proof_target_not_configured");
      const response=await observeHost(target,request.timeoutMs),value=response.observation,observedAt=value.observedAt,source=value.url;
      if(value.origin!==target.origin)throw new Error("browser_proof_host_origin_mismatch");if(target.url&&value.url!==target.url)throw new Error("browser_proof_host_url_mismatch");if(new URL(value.url).origin!==target.origin)throw new Error("browser_proof_host_url_origin_mismatch");if(value.documentBytes>target.maxDocumentBytes)throw new Error("browser_proof_document_limit_exceeded");
      const observations=[
        {kind:"BROWSER_URL",source,observedAt,summary:`url=${value.url};origin=${value.origin}`,confidence:1},
        {kind:"BROWSER_DOCUMENT_SHA256",source,observedAt,summary:`sha256=${value.documentSha256};bytes=${value.documentBytes}`,digest:value.documentSha256,confidence:1},
        {kind:"BROWSER_FRAME_TREE_SHA256",source,observedAt,summary:`sha256=${value.frameTreeSha256};frames=${value.frameCount}`,digest:value.frameTreeSha256,confidence:1}
      ];
      const checks=request.expectedState.map(expected=>{
        if(expected.startsWith("url:"))return value.url===expected.slice(4);
        if(expected.startsWith("origin:"))return value.origin===expected.slice(7);
        if(expected.startsWith("document-sha256:"))return value.documentSha256===expected.slice(16).toLowerCase();
        if(expected.startsWith("frame-tree-sha256:"))return value.frameTreeSha256===expected.slice(18).toLowerCase();
        if(expected.startsWith("frame-count:")){const n=Number(expected.slice(12));return Number.isSafeInteger(n)&&n>=0?value.frameCount===n:null}
        if(expected.startsWith("document-bytes-lte:")){const n=Number(expected.slice(19));return Number.isSafeInteger(n)&&n>=0?value.documentBytes<=n:null}
        return null;
      }),understood=checks.filter((x):x is boolean=>x!==null),allUnderstood=understood.length===checks.length,proposedOutcome=request.expectedState.length&&allUnderstood?(understood.every(Boolean)?"SUCCESS":"FAILURE"):undefined;
      return ProofProviderResultSchema.parse({provider:this.descriptor,requestId:request.requestId,observations,...(proposedOutcome?{proposedOutcome}:{}),conclusive:Boolean(proposedOutcome),authority:false,mayMintExecutionAuthority:false});
    }catch(error:any){return ProofProviderResultSchema.parse({provider:this.descriptor,requestId:request.requestId,observations:[],conclusive:false,error:String(error?.message??error).slice(0,1500),authority:false,mayMintExecutionAuthority:false})}
  }
}
