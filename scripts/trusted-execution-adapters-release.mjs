#!/usr/bin/env node
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(path.join(ROOT,p),"utf8"),fail=m=>{console.error(`CIEAV trusted execution adapter gate FAIL: ${m}`);process.exit(2)};
function expectTokens(file,tokens){const body=read(file);for(const token of tokens)if(!body.includes(token))fail(`${file} missing invariant: ${token}`)}
expectTokens("apps/api/package.json",["@modelcontextprotocol/client","@modelcontextprotocol/server"]);
expectTokens("packages/contracts/src/credential-authority.ts",["KeyHandleSchema","exportable:z.literal(false)","CredentialDerivationContractSchema","normalizedArgumentsDigest","CredentialDerivationReceiptSchema","accessTokenDigest","certificateThumbprint","TOKEN_EXCHANGE","DPOP","MTLS"]);
expectTokens("apps/api/src/credential-authority.ts",["LOCAL_WRAPPED_P256","aes-256-gcm","importLocalP256Key","MTLS_CLIENT_AUTH","X509Certificate","credential_authority_mtls_certificate_key_mismatch","credential_authority_mtls_sender_constraint_required","resourceMtlsIdentity","PRIVATE_KEY_JWT","urn:ietf:params:oauth:grant-type:token-exchange","subject_token","actor_token","signDpop","accessTokenDigest"]);
expectTokens("apps/api/src/credential-authority-api.ts",["keys/import-p256","privateKeyExport:false","mtls:true","mtlsSameCertificateBinding:true","hardwareBackedMtls:false"]);
expectTokens("apps/api/src/execution-router.ts",["loadTrustedHttpFamilyAdaptersSync","loadTrustedOAuthHttpAdaptersSync","loadTrustedMcpStdioAdaptersSync","loadTrustedMcpHttpAdaptersSync","loadTrustedA2aTaskAdaptersSync","selectAdapter","adapter.preflight?.(preflightContext)","execution_adapter_ambiguous","consumeMandate","consumeTicket"]);
expectTokens("apps/api/src/trusted-http-adapter.ts",["execution_adapter_dns_contains_non_public_address","execution_adapter_https_required","redirectBlocked","responseDigest","CIEAV_INJECTED"]);
expectTokens("apps/api/src/trusted-oauth-http-adapter.ts",["TrustedOAuthHttpAdapter","DOWNSTREAM_OAUTH","assertProfileReady","deriveForExecution","resourceMtlsIdentity","execution_oauth_mtls_certificate_binding_mismatch","certificateThumbprint","requestHeaders","credentialDerivationReceiptId","execution_oauth_dns_contains_non_public_address","execution_oauth_https_required"]);
expectTokens("apps/api/src/trusted-mcp-adapter.ts",["TrustedMcpStdioAdapter","StdioClientTransport","commandSha256","execution_mcp_command_digest_mismatch","execution_mcp_downstream_ref_mismatch","forbiddenEnv","client.listTools()","client.callTool","transport:isError?\"UNKNOWN\":\"ACCEPTED\"","mcpStdioDownstreamRef"]);
expectTokens("apps/api/src/trusted-mcp-http-adapter.ts",["TrustedMcpHttpAdapter","StreamableHTTPClientTransport","createPinnedFetch","execution_mcp_http_endpoint_escape","execution_mcp_http_dns_contains_non_public_address","execution_mcp_http_https_required","execution_mcp_http_downstream_ref_mismatch","maxResponseBytes","maxRetries:0","transport:isError?\"UNKNOWN\":\"ACCEPTED\"","mcpHttpDownstreamRef"]);
expectTokens("apps/api/src/trusted-a2a-adapter.ts",["TrustedA2aTaskAdapter","a2aTaskDownstreamRef","SendMessage","GetTask","returnImmediately:true","ROLE_USER","TASK_STATE_COMPLETED","execution_a2a_redirect_blocked","transport:\"UNKNOWN\""]);
expectTokens("apps/api/src/credential-authority.test.ts",["private_key_jwt + DPoP","TOKEN_EXCHANGE","argument substitution"]);
expectTokens("apps/api/src/credential-mtls.test.ts",["requestCert:true","rejectUnauthorized:true","uses the same CIEAV-bound certificate","credential_authority_mtls_certificate_key_mismatch","credential_authority_mtls_sender_constraint_required","mtls-bound-secret"]);
expectTokens("apps/api/src/trusted-oauth-http-adapter.test.ts",["derives DPoP credentials inside CIEAV","preflights credential readiness","DOWNSTREAM_OAUTH"]);
expectTokens("apps/api/src/trusted-http-adapter.test.ts",["injects credentials locally","blocks redirects rather than following them","oversized responses"]);
expectTokens("apps/api/src/trusted-mcp-adapter.test.ts",["exact allowlisted downstream MCP tool","MCP isError","tool-name substitution","executable whose digest","oversized normalized arguments"]);
expectTokens("apps/api/src/trusted-mcp-http-adapter.test.ts",["pinned custom fetch","MCP isError","injects configured credentials locally","does not follow redirects","endpoint or tool substitution","oversized normalized arguments"]);
expectTokens("apps/api/src/trusted-a2a-adapter.test.ts",["forces SendMessage ROLE_USER","polls GetTask","failed A2A task as UNKNOWN","protocol error after dispatch as UNKNOWN","injects A2A credentials locally","does not follow redirects"]);
expectTokens("CREDENTIAL-AUTHORITY.md",["execution mechanism, never as authority","access-token non-persistence","CredentialDerivationReceipt","same client certificate","software-wrapped","hardware-backed","Transaction Token"]);
expectTokens("distribution/execution-adapters.example.json",["oauthHttp","mcpStdio","mcpHttp","a2aTask","senderConstraint","DPOP","commandSha256","downstreamToolName","envBindings"]);
const npm=process.platform==="win32"?"npm.cmd":"npm";
function run(args){const executable=process.platform==="win32"?(process.env.ComSpec||"cmd.exe"):npm,finalArgs=process.platform==="win32"?["/d","/s","/c",`${npm} ${args.join(" ")}`]:args,result=spawnSync(executable,finalArgs,{cwd:ROOT,stdio:"inherit",shell:false});if(result.error)throw result.error;if(result.status!==0)fail(`${npm} ${args.join(" ")} exited ${result.status}`)}
run(["run","test","-w","@cieav/api","--","credential-authority.test.ts","credential-mtls.test.ts","trusted-oauth-http-adapter.test.ts","trusted-http-adapter.test.ts","trusted-mcp-adapter.test.ts","trusted-mcp-http-adapter.test.ts","trusted-a2a-adapter.test.ts","execution-router.test.ts"]);
run(["run","typecheck","-w","@cieav/contracts"]);
run(["run","typecheck","-w","@cieav/api"]);
console.log(`CIEAV trusted execution adapter gate PASS · platform=${process.platform} · credential authority + OAuth client credentials/token exchange/private_key_jwt/DPoP + RFC 8705-style certificate-bound mTLS + HTTP/cloud + MCP stdio + MCP Streamable HTTP + A2A task execution verified`);
