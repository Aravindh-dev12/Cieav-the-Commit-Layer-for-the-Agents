import http from "node:http";
import {afterEach,describe,expect,it} from "vitest";
import {HardenedHttpFamilyAdapter} from "./trusted-http-adapter.js";

const servers:http.Server[]=[];
afterEach(async()=>{await Promise.all(servers.splice(0).map(server=>new Promise<void>(resolve=>server.close(()=>resolve()))))});
async function listen(handler:http.RequestListener){const server=http.createServer(handler);servers.push(server);await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const address=server.address();if(!address||typeof address==="string")throw new Error("test server unavailable");return`http://127.0.0.1:${address.port}/execute`}
const tool=(endpoint:string,credentialMode:"NONE"|"CIEAV_INJECTED"="NONE")=>({id:"tool.http.test",displayName:"HTTP test",protocol:"HTTP",operation:"test.execute",downstreamRef:endpoint,credentialMode,risk:"HIGH",consequenceCapable:true,proofSources:["provider"],enabled:true} as const);
const context=(endpoint:string,args:unknown,credentialMode:"NONE"|"CIEAV_INJECTED"="NONE")=>({tool:tool(endpoint,credentialMode),normalizedArguments:args,ticket:{},proposal:{}} as any);

describe("HardenedHttpFamilyAdapter",()=>{
  it("injects credentials locally, pins loopback only when explicitly allowed, and persists only response digests",async()=>{
    let seenAuth="",seenBody="";const endpoint=await listen((req,res)=>{seenAuth=String(req.headers.authorization??"");const chunks:Buffer[]=[];req.on("data",c=>chunks.push(Buffer.from(c)));req.on("end",()=>{seenBody=Buffer.concat(chunks).toString("utf8");res.setHeader("x-request-id","req-42");res.setHeader("content-type","application/json");res.end(JSON.stringify({ok:true,secret:"must-not-persist"}))})});
    const adapter=new HardenedHttpFamilyAdapter("HTTP",[{toolId:"tool.http.test",protocol:"HTTP",endpoint,method:"POST",allowLoopback:true,timeoutMs:2000,maxResponseBytes:4096,staticHeaders:{"x-cieav-static":"1"},credential:{kind:"BEARER_ENV",env:"CIEAV_TEST_PROVIDER_TOKEN"},successStatusMin:200,successStatusMax:299}],{CIEAV_TEST_PROVIDER_TOKEN:"provider-secret"});
    const ctx=context(endpoint,{body:{hello:"world"},query:{}},"CIEAV_INJECTED");await adapter.preflight(ctx);const result=await adapter.execute(ctx);
    expect(seenAuth).toBe("Bearer provider-secret");expect(JSON.parse(seenBody)).toEqual({hello:"world"});expect(result.transport).toBe("ACCEPTED");expect(result.externalRef).toBe("req-42");expect(JSON.stringify(result)).not.toContain("provider-secret");expect(JSON.stringify(result)).not.toContain("must-not-persist");expect((result.metadata as any).responseDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("blocks redirects rather than following them",async()=>{const endpoint=await listen((_req,res)=>{res.statusCode=302;res.setHeader("location","http://127.0.0.1:1/should-not-follow");res.end()});const adapter=new HardenedHttpFamilyAdapter("HTTP",[{toolId:"tool.http.test",protocol:"HTTP",endpoint,method:"POST",allowLoopback:true,credential:{kind:"NONE"}}]);const ctx=context(endpoint,{body:{x:1},query:{}});await adapter.preflight(ctx);const result=await adapter.execute(ctx);expect(result.transport).toBe("REJECTED");expect((result.metadata as any).redirectBlocked).toBe(true)});

  it("refuses cleartext destinations unless they are explicitly loopback-only",async()=>{const endpoint="http://127.0.0.1:9999/execute",adapter=new HardenedHttpFamilyAdapter("HTTP",[{toolId:"tool.http.test",protocol:"HTTP",endpoint,method:"POST",allowLoopback:false,credential:{kind:"NONE"}}]);await expect(adapter.preflight(context(endpoint,{body:{x:1},query:{}}))).rejects.toThrow("execution_adapter_https_required")});

  it("fails preflight when registered tool endpoint or credential configuration does not match",async()=>{const endpoint=await listen((_req,res)=>res.end("ok")),adapter=new HardenedHttpFamilyAdapter("HTTP",[{toolId:"tool.http.test",protocol:"HTTP",endpoint,method:"POST",allowLoopback:true,credential:{kind:"NONE"}}]);await expect(adapter.preflight(context(endpoint+"?different=1",{body:{},query:{}}))).rejects.toThrow("execution_adapter_registered_endpoint_mismatch")});

  it("treats oversized responses as an indeterminate post-attempt adapter error",async()=>{const endpoint=await listen((_req,res)=>{res.setHeader("content-length","5000");res.end("x".repeat(5000))}),adapter=new HardenedHttpFamilyAdapter("HTTP",[{toolId:"tool.http.test",protocol:"HTTP",endpoint,method:"POST",allowLoopback:true,maxResponseBytes:1024,credential:{kind:"NONE"}}]),ctx=context(endpoint,{body:{},query:{}});await adapter.preflight(ctx);await expect(adapter.execute(ctx)).rejects.toThrow("execution_adapter_response_too_large")});
});
