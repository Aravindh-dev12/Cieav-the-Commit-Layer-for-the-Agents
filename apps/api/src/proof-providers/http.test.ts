import {afterEach,describe,expect,it} from "vitest";
import * as http from "node:http";
import crypto from "node:crypto";
import {HttpProofProvider} from "./http.js";

const servers:http.Server[]=[];
afterEach(async()=>{await Promise.all(servers.splice(0).map(server=>new Promise<void>(resolve=>server.close(()=>resolve()))))});
const sha=(value:string|Buffer)=>crypto.createHash("sha256").update(value).digest("hex");
async function listen(handler:http.RequestListener){const server=http.createServer(handler);servers.push(server);await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const address=server.address();if(!address||typeof address==="string")throw new Error("server_address_unavailable");return`http://127.0.0.1:${address.port}`}

describe("HttpProofProvider",()=>{
  it("proves status and exact body digest without credentials or authority",async()=>{
    const body="verified-http-state";const origin=await listen((_req,res)=>{res.statusCode=200;res.setHeader("x-state","ready");res.end(body)});
    const provider=new HttpProofProvider([origin]);
    const result=await provider.observe({requestId:"request-http-proof-1",providerId:provider.descriptor.id,operation:"GET",phase:"POST_STATE",targetRef:`${origin}/state`,expectedState:["status:200",`body-sha256:${sha(body)}`,"header:x-state=ready"],correlationRefs:[],timeoutMs:1000,authority:false});
    expect(result.proposedOutcome).toBe("SUCCESS");expect(result.conclusive).toBe(true);expect(result.authority).toBe(false);expect(result.mayMintExecutionAuthority).toBe(false);
    expect(result.observations.some(x=>x.kind==="HTTP_BODY_SHA256"&&x.digest===sha(body))).toBe(true);
  });

  it("fails closed for an origin outside the explicit allowlist",async()=>{
    const allowed=await listen((_req,res)=>res.end("allowed"));const disallowed=await listen((_req,res)=>res.end("disallowed"));
    const provider=new HttpProofProvider([allowed]);
    const result=await provider.observe({requestId:"request-http-proof-2",providerId:provider.descriptor.id,operation:"GET",phase:"POST_STATE",targetRef:`${disallowed}/state`,expectedState:["status:200"],correlationRefs:[],timeoutMs:1000,authority:false});
    expect(result.conclusive).toBe(false);expect(result.error).toContain("http_proof_origin_not_allowed");expect(result.observations).toEqual([]);
  });

  it("does not follow redirects across proof boundaries",async()=>{
    const target=await listen((_req,res)=>res.end("target"));const redirector=await listen((_req,res)=>{res.statusCode=302;res.setHeader("location",`${target}/secret`);res.end()});
    const provider=new HttpProofProvider([redirector,target]);
    const result=await provider.observe({requestId:"request-http-proof-3",providerId:provider.descriptor.id,operation:"GET",phase:"RECONCILIATION",targetRef:`${redirector}/redirect`,expectedState:["status:200"],correlationRefs:[],timeoutMs:1000,authority:false});
    expect(result.conclusive).toBe(false);expect(result.error).toBeTruthy();expect(result.observations).toEqual([]);
  });

  it("does not claim a conclusive outcome for unknown expectation syntax",async()=>{
    const origin=await listen((_req,res)=>res.end("state"));const provider=new HttpProofProvider([origin]);
    const result=await provider.observe({requestId:"request-http-proof-4",providerId:provider.descriptor.id,operation:"GET",phase:"POST_STATE",targetRef:`${origin}/state`,expectedState:["semantic:looks-good"],correlationRefs:[],timeoutMs:1000,authority:false});
    expect(result.conclusive).toBe(false);expect(result.proposedOutcome).toBeUndefined();
  });
});
