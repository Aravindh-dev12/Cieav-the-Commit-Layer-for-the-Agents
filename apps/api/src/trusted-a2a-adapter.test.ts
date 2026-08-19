import crypto from "node:crypto";
import http from "node:http";
import {afterEach,describe,expect,it} from "vitest";
import {TrustedA2aTaskAdapter,a2aTaskDownstreamRef} from "./trusted-a2a-adapter.js";

const servers:http.Server[]=[];
afterEach(async()=>{await Promise.all(servers.splice(0).map(server=>new Promise<void>(resolve=>server.close(()=>resolve()))))});

type Mode="direct"|"task-completes"|"task-fails"|"protocol-error"|"redirect";
async function serveA2a(mode:Mode,onRequest?:(body:any,req:http.IncomingMessage)=>void,redirectTo?:string){
  let polls=0;
  const server=http.createServer(async(req,res)=>{
    if(mode==="redirect"){res.statusCode=307;res.setHeader("location",redirectTo??"http://127.0.0.1:1/escape");res.end();return}
    const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const body=JSON.parse(Buffer.concat(chunks).toString("utf8")||"null");onRequest?.(body,req);
    res.setHeader("content-type","application/a2a+json");
    if(body?.method==="SendMessage"){
      if(mode==="protocol-error"){res.end(JSON.stringify({jsonrpc:"2.0",id:body.id,error:{code:-32603,message:"downstream rejected after dispatch"}}));return}
      if(mode==="direct"){res.end(JSON.stringify({jsonrpc:"2.0",id:body.id,result:{message:{messageId:"reply-1",role:"ROLE_AGENT",parts:[{text:"accepted"}]}}}));return}
      res.end(JSON.stringify({jsonrpc:"2.0",id:body.id,result:{task:{id:"task-123",contextId:"ctx-1",status:{state:"TASK_STATE_WORKING"}}}}));return;
    }
    if(body?.method==="GetTask"){
      polls++;const state=mode==="task-fails"?"TASK_STATE_FAILED":polls>=2?"TASK_STATE_COMPLETED":"TASK_STATE_WORKING";res.end(JSON.stringify({jsonrpc:"2.0",id:body.id,result:{id:"task-123",contextId:"ctx-1",status:{state},artifacts:[]}}));return;
    }
    res.statusCode=404;res.end(JSON.stringify({error:"not_found"}));
  });
  servers.push(server);await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const address=server.address();if(!address||typeof address==="string")throw new Error("fixture unavailable");return`http://127.0.0.1:${address.port}/rpc`;
}

const config=(endpoint:string,overrides:Record<string,unknown>={})=>({toolId:"tool.a2a.execute",agentId:"remote-agent",endpoint,version:"1.0" as const,allowLoopback:true,staticHeaders:{},credential:{kind:"NONE" as const},connectTimeoutMs:2000,timeoutMs:2000,pollIntervalMs:50,maxTaskPolls:4,maxArgumentBytes:16*1024,maxRequestBytes:128*1024,maxResponseBytes:128*1024,...overrides});
const tool=(endpoint:string,credentialMode:"NONE"|"CIEAV_INJECTED"="NONE")=>({id:"tool.a2a.execute",displayName:"A2A execute",protocol:"A2A",operation:"SendMessage",downstreamRef:a2aTaskDownstreamRef("remote-agent",endpoint),credentialMode,risk:"HIGH",consequenceCapable:true,proofSources:["a2a-task"],enabled:true} as const);
const ctx=(endpoint:string,args:unknown={parts:[{data:{operation:"execute",input:{value:"hello"}},mediaType:"application/json"}]},credentialMode:"NONE"|"CIEAV_INJECTED"="NONE")=>({tool:tool(endpoint,credentialMode),normalizedArguments:args,ticket:{id:"11111111-1111-4111-8111-111111111111"},proposal:{}} as any);

describe("TrustedA2aTaskAdapter",()=>{
  it("forces SendMessage ROLE_USER semantics and treats a direct Message as transport acceptance only",async()=>{let seen:any;const endpoint=await serveA2a("direct",(body,req)=>{seen={body,version:req.headers["a2a-version"]}}),adapter=new TrustedA2aTaskAdapter([config(endpoint)]),context=ctx(endpoint);await adapter.preflight(context);const result=await adapter.execute(context);expect(result.transport).toBe("ACCEPTED");expect(seen.body.method).toBe("SendMessage");expect(seen.body.params.message.role).toBe("ROLE_USER");expect(seen.body.params.message.messageId).toBe(context.ticket.id);expect(seen.body.params.configuration.returnImmediately).toBe(true);expect(seen.version).toBe("1.0");expect((result.metadata as any).resultKind).toBe("MESSAGE");expect((result.metadata as any).resultDigest).toMatch(/^[0-9a-f]{64}$/);expect(result.metadata).not.toHaveProperty("message");expect(result.metadata).not.toHaveProperty("parts")});

  it("polls GetTask after SendMessage and accepts only the A2A COMPLETED transport state",async()=>{const endpoint=await serveA2a("task-completes"),adapter=new TrustedA2aTaskAdapter([config(endpoint)]),context=ctx(endpoint);await adapter.preflight(context);const result=await adapter.execute(context);expect(result.transport).toBe("ACCEPTED");expect(result.externalRef).toBe("task-123");expect((result.metadata as any).taskState).toBe("TASK_STATE_COMPLETED");expect((result.metadata as any).taskDigest).toMatch(/^[0-9a-f]{64}$/)});

  it("classifies a failed A2A task as UNKNOWN because partial consequences cannot be excluded",async()=>{const endpoint=await serveA2a("task-fails"),adapter=new TrustedA2aTaskAdapter([config(endpoint)]),context=ctx(endpoint);await adapter.preflight(context);const result=await adapter.execute(context);expect(result.transport).toBe("UNKNOWN");expect((result.metadata as any).taskState).toBe("TASK_STATE_FAILED")});

  it("classifies a SendMessage protocol error after dispatch as UNKNOWN",async()=>{const endpoint=await serveA2a("protocol-error"),adapter=new TrustedA2aTaskAdapter([config(endpoint)]),context=ctx(endpoint);await adapter.preflight(context);const result=await adapter.execute(context);expect(result.transport).toBe("UNKNOWN");expect((result.metadata as any).callSent).toBe(true)});

  it("injects A2A credentials locally and never returns the secret",async()=>{let auth="";const endpoint=await serveA2a("direct",(_body,req)=>{auth=String(req.headers.authorization??"")}),cfg={...config(endpoint),credential:{kind:"BEARER_ENV" as const,env:"CIEAV_A2A_REMOTE_TOKEN"}},adapter=new TrustedA2aTaskAdapter([cfg],{CIEAV_A2A_REMOTE_TOKEN:"a2a-secret"}),context=ctx(endpoint,undefined,"CIEAV_INJECTED");await adapter.preflight(context);const result=await adapter.execute(context);expect(auth).toBe("Bearer a2a-secret");expect(JSON.stringify(result)).not.toContain("a2a-secret")});

  it("does not follow redirects from the configured A2A endpoint",async()=>{let targetHits=0;const target=await serveA2a("direct",()=>{targetHits++}),source=await serveA2a("redirect",undefined,target),adapter=new TrustedA2aTaskAdapter([config(source)]),context=ctx(source);await adapter.preflight(context);const result=await adapter.execute(context);expect(result.transport).toBe("UNKNOWN");expect(targetHits).toBe(0)});

  it("rejects endpoint substitution and oversized arguments during preflight",async()=>{const endpoint=await serveA2a("direct"),adapter=new TrustedA2aTaskAdapter([config(endpoint,{maxArgumentBytes:1024})]);const changed={...ctx(endpoint),tool:{...tool(endpoint),downstreamRef:a2aTaskDownstreamRef("other-agent",endpoint)}};await expect(adapter.preflight(changed as any)).rejects.toThrow("execution_a2a_downstream_ref_mismatch");await expect(adapter.preflight(ctx(endpoint,{parts:[{text:"x".repeat(5000)}]}))).rejects.toThrow("execution_a2a_arguments_too_large")});
});
