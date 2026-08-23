import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..");
const read=(relative:string)=>readFileSync(path.join(ROOT,relative),"utf8");

describe("remote Git production consequence boundary",()=>{
  it("requires exact expected-old remote lease and forbids unconstrained push semantics",()=>{const source=read("apps/api/src/trusted-git-smart-http-adapter.ts");for(const token of ['context.tool.protocol!=="GIT"','context.tool.operation!=="GIT_PUSH_REF"','--force-with-lease=${c.remoteRef}:${input.expectedOldOid}','${input.newCommitOid}:${c.remoteRef}','execution_git_remote_prestate_mismatch','reconciled.oid===input.newCommitOid','transport:"UNKNOWN"'])expect(source).toContain(token);for(const forbidden of ['--force"','--force-with-lease"','push --mirror','--all','--tags','shell:true','exec(','execSync('])expect(source).not.toContain(forbidden)});

  it("pins Smart HTTP networking and disables ambient proxy, redirect, cookie and credential-helper state",()=>{const source=read("apps/api/src/trusted-git-smart-http-adapter.ts");for(const token of ['http.curloptResolve','http.followRedirects","false"','http.proxy",""','credential.helper",""','credential.interactive","false"','http.cookieFile",""','http.saveCookies","false"','NO_PROXY:"*"','GIT_ALLOW_PROTOCOL:protocol','GIT_PROTOCOL_FROM_USER:"0"','http.sslVerify","true"','execution_git_remote_dns_contains_non_public_address'])expect(source).toContain(token)});

  it("keeps credentials out of argv, URLs, evidence and authority-free proof",()=>{const execution=read("apps/api/src/trusted-git-smart-http-adapter.ts"),proof=read("apps/api/src/proof-providers/git-remote-ref.ts");for(const token of ['credentialHeader(','GIT_CONFIG_VALUE_','Authorization: Bearer','Authorization: Basic','credentialBinding(','url.username||url.password','authority:false as const','mayMintExecutionAuthority:false','"ls-remote","--refs"'])expect(`${execution}\n${proof}`).toContain(token);for(const forbidden of ['https://${secret}','http://${secret}','push","--password','push","--token','trusted-git-smart-http-adapter','"push"','update-ref','mintExecutionTicket(','consumeTicket(','issueCredentialLease(','shell:true'])expect(proof).not.toContain(forbidden)});

  it("binds the local object store and treats post-receive-pack ambiguity conservatively",()=>{const source=read("apps/api/src/trusted-git-smart-http-adapter.ts"),test=read("apps/api/src/trusted-git-smart-http-adapter.test.ts");for(const token of ['--path-format=absolute","--git-path","objects"','GIT_ALTERNATE_OBJECT_DIRECTORIES','effectAttempted:pushStarted','Remote hook or partial consequences cannot be excluded','pre-receive','server-hook-ran','expect(result.transport).toBe("UNKNOWN")'])expect(`${source}\n${test}`).toContain(token)});
});
