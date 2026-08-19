#!/usr/bin/env node
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(path.join(ROOT,p),"utf8"),fail=m=>{console.error(`CIEAV trusted execution adapter gate FAIL: ${m}`);process.exit(2)};
function expectTokens(file,tokens){const body=read(file);for(const token of tokens)if(!body.includes(token))fail(`${file} missing invariant: ${token}`)}
expectTokens("apps/api/package.json",["@modelcontextprotocol/client","@modelcontextprotocol/server"]);
expectTokens("apps/api/src/execution-router.ts",["loadTrustedHttpFamilyAdaptersSync","loadTrustedMcpStdioAdaptersSync","loadTrustedMcpHttpAdaptersSync","selectAdapter","adapter.preflight?.(preflightContext)","execution_adapter_ambiguous","consumeMandate","consumeTicket"]);
expectTokens("apps/api/src/trusted-http-adapter.ts",["execution_adapter_dns_contains_non_public_address","execution_adapter_https_required","redirectBlocked","responseDigest","CIEAV_INJECTED"]);
expectTokens("apps/api/src/trusted-mcp-adapter.ts",["TrustedMcpStdioAdapter","StdioClientTransport","commandSha256","execution_mcp_command_digest_mismatch","execution_mcp_downstream_ref_mismatch","forbiddenEnv","client.listTools()","client.callTool","transport:isError?\"UNKNOWN\":\"ACCEPTED\"","mcpStdioDownstreamRef"]);
expectTokens("apps/api/src/trusted-mcp-http-adapter.ts",["TrustedMcpHttpAdapter","StreamableHTTPClientTransport","createPinnedFetch","execution_mcp_http_endpoint_escape","execution_mcp_http_dns_contains_non_public_address","execution_mcp_http_https_required","execution_mcp_http_downstream_ref_mismatch","maxResponseBytes","maxRetries:0","transport:isError?\"UNKNOWN\":\"ACCEPTED\"","mcpHttpDownstreamRef"]);
expectTokens("apps/api/src/trusted-http-adapter.test.ts",["injects credentials locally","blocks redirects rather than following them","oversized responses"]);
expectTokens("apps/api/src/trusted-mcp-adapter.test.ts",["exact allowlisted downstream MCP tool","MCP isError","tool-name substitution","executable whose digest","oversized normalized arguments"]);
expectTokens("apps/api/src/trusted-mcp-http-adapter.test.ts",["pinned custom fetch","MCP isError","injects configured credentials locally","does not follow redirects","endpoint or tool substitution","oversized normalized arguments"]);
expectTokens("EXECUTION-ADAPTERS.md",["Trusted downstream MCP stdio","MCP Streamable HTTP","mcp+stdio:","mcp+streamable-http:","tools/call","UNKNOWN"]);
expectTokens("distribution/execution-adapters.example.json",["mcpStdio","mcpHttp","commandSha256","downstreamToolName","envBindings"]);
const npm=process.platform==="win32"?"npm.cmd":"npm";
function run(args){const executable=process.platform==="win32"?(process.env.ComSpec||"cmd.exe"):npm,finalArgs=process.platform==="win32"?["/d","/s","/c",`${npm} ${args.join(" ")}`]:args,result=spawnSync(executable,finalArgs,{cwd:ROOT,stdio:"inherit",shell:false});if(result.error)throw result.error;if(result.status!==0)fail(`${npm} ${args.join(" ")} exited ${result.status}`)}
run(["run","test","-w","@cieav/api","--","trusted-http-adapter.test.ts","trusted-mcp-adapter.test.ts","trusted-mcp-http-adapter.test.ts","execution-router.test.ts"]);
run(["run","typecheck","-w","@cieav/api"]);
console.log(`CIEAV trusted execution adapter gate PASS · platform=${process.platform} · HTTP/A2A/cloud + MCP stdio + MCP Streamable HTTP preflight, endpoint/binary binding, pinned networking, credential isolation and uncertainty semantics verified`);
