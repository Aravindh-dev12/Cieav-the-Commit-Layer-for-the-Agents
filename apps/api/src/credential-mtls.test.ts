import crypto from "node:crypto";
import https from "node:https";
import {mkdtemp,readFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach,describe,expect,it} from "vitest";
import {digest} from "@cieav/core/execution-fabric";
import {CieavCredentialAuthority} from "./credential-authority.js";
import {TrustedOAuthHttpAdapter,TrustedOAuthHttpToolConfigSchema} from "./trusted-oauth-http-adapter.js";

const CA=`-----BEGIN CERTIFICATE-----
MIIBhTCCASugAwIBAgIUcmo0E2YKGF5GmVRTicg+5tiLs2gwCgYIKoZIzj0EAwIw
GDEWMBQGA1UEAwwNQ0lFQVYgVGVzdCBDQTAeFw0yNjA4MTkxMTA3MTdaFw0zNjA4
MTYxMTA3MTdaMBgxFjAUBgNVBAMMDUNJRUFWIFRlc3QgQ0EwWTATBgcqhkjOPQIB
BggqhkjOPQMBBwNCAAQSXpvi0iIZnIfO5qSWpSJ/f/5Wrd/NopSrAwg/QvpFBECl
W6eBFmnOx/dw3nFgBrJH0lYiCS6RuB7sOOOYmmXAo1MwUTAdBgNVHQ4EFgQUc7f2
+3qOZ69P2giAKVoqZ5tnEskwHwYDVR0jBBgwFoAUc7f2+3qOZ69P2giAKVoqZ5tn
EskwDwYDVR0TAQH/BAUwAwEB/zAKBggqhkjOPQQDAgNIADBFAiEA1OhJqcBpQKkZ
TjTk6HM5BezaYRpfF3XLMUZv1MIZMXACIGz2e8VUD7KoTAEYJ4XpFphmTaMdhRkq
/8637Ps0SqIu
-----END CERTIFICATE-----`;
const SERVER_KEY=`-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIJPrJpLXHZKLsrMAElVyP1+V+LjDtqag8VqMNd2bCLo1oAoGCCqGSM49
AwEHoUQDQgAEnvLoLv7iGk0ragVHmPWFUmAKuUehYN7v7dmtJtgfHlVFJ7eWFocG
OJubxboE5kYjkXPQbqo0WfEJdyOFpCWDdA==
-----END EC PRIVATE KEY-----`;
const SERVER_CERT=`-----BEGIN CERTIFICATE-----
MIIBljCCATygAwIBAgIUF6SSmY4HB3AosxsBLsnRvZdtttwwCgYIKoZIzj0EAwIw
GDEWMBQGA1UEAwwNQ0lFQVYgVGVzdCBDQTAeFw0yNjA4MTkxMTA3MTdaFw0yNzA4
MTkxMTA3MTdaMBQxEjAQBgNVBAMMCTEyNy4wLjAuMTBZMBMGByqGSM49AgEGCCqG
SM49AwEHA0IABJ7y6C7+4hpNK2oFR5j1hVJgCrlHoWDe7+3ZrSbYHx5VRSe3lhaH
Bjibm8W6BOZGI5Fz0G6qNFnxCXcjhaQlg3SjaDBmMA8GA1UdEQQIMAaHBH8AAAEw
EwYDVR0lBAwwCgYIKwYBBQUHAwEwHQYDVR0OBBYEFBGKafHwDV6D2ZVtEHY70Cna
lUvgMB8GA1UdIwQYMBaAFHO39vt6jmevT9oIgClaKmebZxLJMAoGCCqGSM49BAMC
A0gAMEUCIBLVT9T3AZvbdmekg75umirC9hwsMKQ6pC//TVVhEG56AiEA/qDMGxYl
lb8zD480dH9rK0enCC82Vp2bXquwB91sQO8=
-----END CERTIFICATE-----`;
const CLIENT_KEY=`-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg7Kde0927Y+CFTexn
wRagwY7St0FWMdc29Nyw+wwvMSyhRANCAASx4n8+X3NMCWChoccDloJm6UxXBu52
1nWyAn75j+322vA8943LkeUu9qSe6RiZiafS32LKWiTrxZxw+8uA7756
-----END PRIVATE KEY-----`;
const CLIENT_CERT=`-----BEGIN CERTIFICATE-----
MIIBjTCCATOgAwIBAgIUF6SSmY4HB3AosxsBLsnRvZdttt0wCgYIKoZIzj0EAwIw
GDEWMBQGA1UEAwwNQ0lFQVYgVGVzdCBDQTAeFw0yNjA4MTkxMTA3MTdaFw0yNzA4
MTkxMTA3MTdaMBwxGjAYBgNVBAMMEUNJRUFWIFRlc3QgQ2xpZW50MFkwEwYHKoZI
zj0CAQYIKoZIzj0DAQcDQgAEseJ/Pl9zTAlgoaHHA5aCZulMVwbudtZ1sgJ++Y/t
9trwPPeNy5HlLvaknukYmYmn0t9iylok68WccPvLgO++eqNXMFUwEwYDVR0lBAww
CgYIKwYBBQUHAwIwHQYDVR0OBBYEFFJnfEWHFkKIdyuxBADSJrr4NEaRMB8GA1Ud
IwQYMBaAFHO39vt6jmevT9oIgClaKmebZxLJMAoGCCqGSM49BAMCA0gAMEUCIF0O
uDCI8EOYBq6lBfyCkQ9vyctUYUtKwTxHgYFdeLgAAiEAnou6TpSIKtdpiOznHFzy
kD0QCMi3duwC3UqXSt425OI=
-----END CERTIFICATE-----`;

const servers:https.Server[]=[];
afterEach(async()=>{await Promise.all(servers.splice(0).map(server=>new Promise<void>(resolve=>server.close(()=>resolve()))))});
async function listenMtls(handler:https.RequestListener){const server=https.createServer({key:SERVER_KEY,cert:SERVER_CERT,ca:CA,requestCert:true,rejectUnauthorized:true},handler);servers.push(server);await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const a=server.address();if(!a||typeof a==="string")throw new Error("fixture unavailable");return`https://127.0.0.1:${a.port}`}
const uuids={proposal:"11111111-1111-4111-8111-111111111111",task:"22222222-2222-4222-8222-222222222222",intent:"33333333-3333-4333-8333-333333333333",ticket:"44444444-4444-4444-8444-444444444444",commit:"55555555-5555-4555-8555-555555555555",lease:"66666666-6666-4666-8666-666666666666",attestation:"77777777-7777-4777-8777-777777777777"};
function context(endpoint:string,args:any={body:{amount:42},query:{}}){const normalizedArgumentsDigest=digest(args),proposal:any={id:uuids.proposal,version:1,taskId:uuids.task,intentId:uuids.intent,scopeDeviceId:"device_mtls_test",subjectId:"agent:test",identityAttestationId:uuids.attestation,credentialLeaseId:uuids.lease,toolId:"tool.oauth.mtls",protocol:"HTTP",operation:"POST",target:endpoint,risk:"HIGH",normalizedArgumentsDigest,semanticEffect:{kind:"PAYMENT",target:"merchant",amount:{currency:"USD",value:42},attributes:{}},realityWitness:{version:1,observedAt:new Date().toISOString(),facts:[{key:"invoice",valueDigest:"a".repeat(64),source:"fixture",observedAt:new Date().toISOString()}],digest:"b".repeat(64)},expectedPostStateDigest:"c".repeat(64),proofObligationDigest:"d".repeat(64),attenuationWitnessIds:[],createdAt:new Date().toISOString()},ticket:any={id:uuids.ticket,version:1,proposalId:uuids.proposal,intentId:uuids.intent,taskId:uuids.task,toolId:"tool.oauth.mtls",authorizationDigest:"e".repeat(64),realityBoundCommitId:uuids.commit,credentialLeaseId:uuids.lease,routeDigest:"f".repeat(64),issuedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+60_000).toISOString(),status:"CONSUMED",consumedAt:new Date().toISOString()},tool:any={id:"tool.oauth.mtls",displayName:"mTLS payment",protocol:"HTTP",operation:"POST",downstreamRef:new URL(endpoint).href,credentialMode:"DOWNSTREAM_OAUTH",risk:"HIGH",consequenceCapable:true,proofSources:["provider"],enabled:true};return{proposal,ticket,tool,normalizedArguments:args}}
function peerThumbprint(req:https.IncomingMessage){const raw=req.socket.getPeerCertificate(true).raw;if(!raw)throw new Error("peer certificate unavailable");return crypto.createHash("sha256").update(raw).digest("hex")}

describe("certificate-bound OAuth mTLS",()=>{
  it("uses the same CIEAV-bound certificate at token and protected-resource endpoints",async()=>{let tokenThumbprint="",resourceThumbprint="",tokenHits=0,resourceHits=0;const tokenBase=await listenMtls(async(req,res)=>{tokenHits++;expect(req.socket.authorized).toBe(true);tokenThumbprint=peerThumbprint(req);const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const form=new URLSearchParams(Buffer.concat(chunks).toString("utf8"));expect(form.get("grant_type")).toBe("client_credentials");res.setHeader("content-type","application/json");res.end(JSON.stringify({access_token:"mtls-bound-secret",token_type:"Bearer",expires_in:60}))}),resourceBase=await listenMtls(async(req,res)=>{resourceHits++;expect(req.socket.authorized).toBe(true);resourceThumbprint=peerThumbprint(req);expect(req.headers.authorization).toBe("Bearer mtls-bound-secret");res.setHeader("content-type","application/json");res.end(JSON.stringify({ok:true}))}),dir=await mkdtemp(path.join(os.tmpdir(),"cieav-mtls-")),state=path.join(dir,"credential-state.json"),authority=new CieavCredentialAuthority(state,"m".repeat(64)),key=await authority.importLocalP256Key("mtls-client",["MTLS_CLIENT_AUTH"],CLIENT_KEY);await authority.putProfile({id:"mtls-provider",tokenEndpoint:`${tokenBase}/token`,clientId:"cieav-mtls",clientAuth:{kind:"MTLS",keyHandleId:key.id,certificatePem:CLIENT_CERT},tlsCaPem:CA});const endpoint=`${resourceBase}/pay`,adapter=new TrustedOAuthHttpAdapter("HTTP",[{toolId:"tool.oauth.mtls",protocol:"HTTP",endpoint,method:"POST",oauth:{profileId:"mtls-provider",grantType:"CLIENT_CREDENTIALS",resource:resourceBase,scopes:["pay.write"],senderConstraint:"MTLS",keyHandleId:key.id,maxTokenLifetimeSeconds:60}}],authority),ctx=context(endpoint);await adapter.preflight(ctx as any);expect(tokenHits).toBe(0);const result=await adapter.execute(ctx as any);expect(result.transport).toBe("ACCEPTED");expect(tokenHits).toBe(1);expect(resourceHits).toBe(1);expect(tokenThumbprint).toBe(resourceThumbprint);expect((result.metadata as any).certificateThumbprint).toBe(tokenThumbprint);expect(JSON.stringify(result)).not.toContain("mtls-bound-secret");const persisted=await readFile(state,"utf8");expect(persisted).not.toContain("mtls-bound-secret");expect(persisted).not.toContain(CLIENT_KEY.split("\n")[1]!);await authority.close()});

  it("rejects a certificate that does not match the CIEAV key handle",async()=>{const tokenBase=await listenMtls((_req,res)=>res.end(JSON.stringify({access_token:"x"}))),dir=await mkdtemp(path.join(os.tmpdir(),"cieav-mtls-mismatch-")),authority=new CieavCredentialAuthority(path.join(dir,"state.json"),"n".repeat(64)),wrong=await authority.createLocalKey("wrong",["MTLS_CLIENT_AUTH"]);await expect(authority.putProfile({id:"mismatch",tokenEndpoint:`${tokenBase}/token`,clientId:"cieav",clientAuth:{kind:"MTLS",keyHandleId:wrong.id,certificatePem:CLIENT_CERT},tlsCaPem:CA})).rejects.toThrow("credential_authority_mtls_certificate_key_mismatch");await authority.close()});

  it("rejects mTLS profiles when the sender constraint is downgraded",async()=>{const tokenBase=await listenMtls((_req,res)=>res.end(JSON.stringify({access_token:"x"}))),dir=await mkdtemp(path.join(os.tmpdir(),"cieav-mtls-downgrade-")),authority=new CieavCredentialAuthority(path.join(dir,"state.json"),"o".repeat(64)),key=await authority.importLocalP256Key("mtls",["MTLS_CLIENT_AUTH"],CLIENT_KEY);await authority.putProfile({id:"mtls",tokenEndpoint:`${tokenBase}/token`,clientId:"cieav",clientAuth:{kind:"MTLS",keyHandleId:key.id,certificatePem:CLIENT_CERT},tlsCaPem:CA});await expect(authority.assertProfileReady("mtls","CLIENT_CREDENTIALS","NONE")).rejects.toThrow("credential_authority_mtls_sender_constraint_required");await authority.close()});

  it("requires HTTPS and a key handle for mTLS resource configuration",()=>{expect(()=>TrustedOAuthHttpToolConfigSchema.parse({toolId:"tool.oauth.mtls",protocol:"HTTP",endpoint:"http://127.0.0.1/pay",method:"POST",allowLoopback:true,oauth:{profileId:"mtls",grantType:"CLIENT_CREDENTIALS",resource:"https://resource.example",scopes:[],senderConstraint:"MTLS"}})).toThrow()});
});
