import crypto from "node:crypto";
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {describe,expect,it} from "vitest";
import {TrustedMcpStdioAdapter,mcpStdioDownstreamRef} from "./trusted-mcp-adapter.js";

const here=path.dirname(fileURLToPath(import.meta.url));
const fixture=path.join(here,"fixtures","mcp-stdio-test-server.mjs");
const nodeDigest=crypto.createHash("sha256").update(readFileSync(process.execPath)).digest("hex");
const baseConfig={toolId:"tool.mcp.echo",serverId:"test-server",downstreamToolName:"echo",command:process.execPath,commandSha256:nodeDigest,args:[fixture],timeoutMs:8000,connectTimeoutMs:8000,maxMessageBytes:128*1024,maxArgumentBytes:16*1024,maxStderrBytes:4096,staticEnv:{CIEAV_TEST_STATIC:"1"},envBindings:{}} as const;
const tool=(name="echo")=>({id:"tool.mcp.echo",displayName:"MCP echo",protocol:"MCP",operation:"test.echo",downstreamRef:mcpStdioDownstreamRef("test-server",name),credentialMode:"NONE",risk:"HIGH",consequenceCapable:true,proofSources:["mcp-result"],enabled:true} as const);
const ctx=(name="echo",args:unknown={value:"hello"})=>({tool:tool(name),normalizedArguments:args,ticket:{id:crypto.randomUUID()},proposal:{}} as any);

describe("TrustedMcpStdioAdapter",()=>{
  it("executes an exact allowlisted downstream MCP tool and stores only a result digest",async()=>{const adapter=new TrustedMcpStdioAdapter([baseConfig]);const context=ctx();await adapter.preflight(context);const result=await adapter.execute(context);expect(result.transport).toBe("ACCEPTED");expect((result.metadata as any).callSent).toBe(true);expect((result.metadata as any).mcpResultDigest).toMatch(/^[0-9a-f]{64}$/);expect(JSON.stringify(result)).not.toContain("echo:hello")});

  it("treats MCP isError after tools/call as UNKNOWN rather than safe failure",async()=>{const config={...baseConfig,toolId:"tool.mcp.error",downstreamToolName:"reported-error"},adapter=new TrustedMcpStdioAdapter([config]),context={...ctx("reported-error",{value:"x"}),tool:{...tool("reported-error"),id:"tool.mcp.error"}} as any;await adapter.preflight(context);const result=await adapter.execute(context);expect(result.transport).toBe("UNKNOWN");expect((result.metadata as any).mcpIsError).toBe(true)});

  it("rejects a downstream tool-name substitution before authority is consumed",async()=>{const adapter=new TrustedMcpStdioAdapter([baseConfig]),context=ctx("different-tool");await expect(adapter.preflight(context)).rejects.toThrow("execution_mcp_downstream_ref_mismatch")});

  it("rejects an executable whose digest no longer matches trusted configuration",async()=>{const adapter=new TrustedMcpStdioAdapter([{...baseConfig,commandSha256:"0".repeat(64)}]);await expect(adapter.preflight(ctx())).rejects.toThrow("execution_mcp_command_digest_mismatch")});

  it("requires declared injected credentials to exist locally",()=>{expect(()=>new TrustedMcpStdioAdapter([{...baseConfig,envBindings:{DOWNSTREAM_TOKEN:"CIEAV_MISSING_TEST_TOKEN"}}],{})).toThrow("execution_mcp_credential_missing")});

  it("rejects oversized normalized arguments before launching the downstream MCP server",async()=>{const adapter=new TrustedMcpStdioAdapter([{...baseConfig,maxArgumentBytes:1024}]),context=ctx("echo",{value:"x".repeat(5000)});await expect(adapter.preflight(context)).rejects.toThrow("execution_mcp_arguments_too_large")});
});
