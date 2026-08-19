import crypto from "node:crypto";
import http from "node:http";
import {afterEach,describe,expect,it} from "vitest";
import {TrustedMcpHttpAdapter,mcpHttpDownstreamRef} from "./trusted-mcp-http-adapter.js";

const servers:http.Server[]=[];
afterEach(async()=>{await Promise.all(servers.splice(0).map(server=>new Promise<void>(resolve=>server.close(()=>resolve()))))});

type FixtureOptions={redirectTo?:string;onRequest?:(req:http.IncomingMessage)=>void};
async function serveMcp(options:FixtureOptions={}){
  const server=http.createServer(async(req,res)=>{
    options.onRequest?.(req);
    if(options.redirectTo){res.statusCode=307;res.setHeader("location",options.redirectTo);res.end();return}
    if(req.method==="GET"){res.statusCode=405;res.setHeader("allow","POST, DELETE");res.end();return}
    if(req.method==="DELETE"){res.statusCode=200;res.end();return}
    if(req.method!=="POST"){res.statusCode=405;res.end();return}
    const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
    const message=JSON.parse(Buffer.concat(chunks).toString("utf8")||"null");
    if(!message||typeof message!=="object"){res.statusCode=400;res.end();return}
    if(message.method==="notifications/initialized"){res.statusCode=202;res.end();return}
    let result:unknown;
    if(message.method==="initialize")result={protocolVersion:message.params?.protocolVersion??"2025-11-25",capabilities:{tools:{}},serverInfo:{name:"cieav-http-fixture",version:"1.0.0"}};
    else if(message.method==="tools/list")result={tools:[
      {name:"echo",description:"Echo",inputSchema:{type:"object",properties:{value:{type:"string"}},required:["value"],additionalProperties:false}},
      {name:"reported-error",description:"Error",inputSchema:{type:"object",properties:{value:{type:"string"}},additionalProperties:false}}
    ]};
    else if(message.method==="tools/call"){
      const name=message.params?.name,value=message.params?.arguments?.value;
      result=name==="reported-error"?{isError:true,content:[{type:"text",text:"reported failure"}]}:{content:[{type:"text",text:`echo:${String(value??"")}`}]};
    }else{res.statusCode=404;res.end();return}
    res.statusCode=200;res.setHeader("content-type","application/json");res.end(JSON.stringify({jsonrpc:"2.0",id:message.id,result}));
  });
  servers.push(server);await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const address=server.address();if(!address||typeof address==="string")throw new Error("fixture unavailable");return`http://127.0.0.1:${address.port}/mcp`;
}

const config=(endpoint:string,overrides:Record<string,unknown>={})=>({toolId:"tool.mcp.http.echo",serverId:"remote-test",downstreamToolName:"echo",endpoint,allowLoopback:true,staticHeaders:{"x-cieav-static":"1"},credential:{kind:"NONE" as const},connectTimeoutMs:3000,timeoutMs:3000,maxArgumentBytes:16*1024,maxRequestBytes:128*1024,maxResponseBytes:256*1024,...overrides});
const tool=(endpoint:string,name="echo",credentialMode:"NONE"|"CIEAV_INJECTED"="NONE")=>({id:"tool.mcp.http.echo",displayName:"Remote MCP echo",protocol:"MCP",operation:"test.echo",downstreamRef:mcpHttpDownstreamRef("remote-test",endpoint,name),credentialMode,risk:"HIGH",consequenceCapable:true,proofSources:["mcp-result"],enabled:true} as const);
const ctx=(endpoint:string,name="echo",args:unknown={value:"hello"},credentialMode:"NONE"|"CIEAV_INJECTED"="NONE")=>({tool:tool(endpoint,name,credentialMode),normalizedArguments:args,ticket:{id:crypto.randomUUID()},proposal:{}} as any);

describe("TrustedMcpHttpAdapter",()=>{
  it("executes the exact remote MCP tool through the pinned custom fetch and persists only a result digest",async()=>{const endpoint=await serveMcp(),adapter=new TrustedMcpHttpAdapter([config(endpoint)]),context=ctx(endpoint);expect(adapter.supports(context)).toBe(true);await adapter.preflight(context);const result=await adapter.execute(context);expect(result.transport).toBe("ACCEPTED");expect((result.metadata as any).callSent).toBe(true);expect((result.metadata as any).mcpResultDigest).toMatch(/^[0-9a-f]{64}$/);expect(JSON.stringify(result)).not.toContain("echo:hello")});

  it("treats MCP isError after tools/call as UNKNOWN",async()=>{const endpoint=await serveMcp(),cfg={...config(endpoint),toolId:"tool.mcp.http.error",downstreamToolName:"reported-error"},adapter=new TrustedMcpHttpAdapter([cfg]),context={...ctx(endpoint,"reported-error",{value:"x"}),tool:{...tool(endpoint,"reported-error"),id:"tool.mcp.http.error"}} as any;await adapter.preflight(context);const result=await adapter.execute(context);expect(result.transport).toBe("UNKNOWN");expect((result.metadata as any).mcpIsError).toBe(true)});

  it("injects configured credentials locally without exposing them in the adapter result",async()=>{let authorization="";const endpoint=await serveMcp({onRequest:req=>{authorization=String(req.headers.authorization??"")}}),cfg={...config(endpoint),credential:{kind:"BEARER_ENV" as const,env:"CIEAV_REMOTE_MCP_TOKEN"}},adapter=new TrustedMcpHttpAdapter([cfg],{CIEAV_REMOTE_MCP_TOKEN:"remote-secret"}),context=ctx(endpoint,"echo",{value:"credential"},"CIEAV_INJECTED");await adapter.preflight(context);const result=await adapter.execute(context);expect(result.transport).toBe("ACCEPTED");expect(authorization).toBe("Bearer remote-secret");expect(JSON.stringify(result)).not.toContain("remote-secret")});

  it("does not follow redirects to another origin",async()=>{let targetHits=0;const target=await serveMcp({onRequest:()=>{targetHits++}}),source=await serveMcp({redirectTo:target}),adapter=new TrustedMcpHttpAdapter([config(source)]),context=ctx(source);await adapter.preflight(context);const result=await adapter.execute(context);expect(result.transport).toBe("REJECTED");expect((result.metadata as any).callSent).toBe(false);expect(targetHits).toBe(0)});

  it("rejects downstream endpoint or tool substitution before authority consumption",async()=>{const endpoint=await serveMcp(),adapter=new TrustedMcpHttpAdapter([config(endpoint)]);await expect(adapter.preflight(ctx(endpoint,"different-tool"))).rejects.toThrow("execution_mcp_http_downstream_ref_mismatch")});

  it("rejects oversized normalized arguments before any network call",async()=>{let hits=0;const endpoint=await serveMcp({onRequest:()=>{hits++}}),adapter=new TrustedMcpHttpAdapter([config(endpoint,{maxArgumentBytes:1024})]),context=ctx(endpoint,"echo",{value:"x".repeat(5000)});await expect(adapter.preflight(context)).rejects.toThrow("execution_mcp_http_arguments_too_large");expect(hits).toBe(0)});
});
