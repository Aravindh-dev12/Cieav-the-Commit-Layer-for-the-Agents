#!/usr/bin/env node
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import http from "node:http";
import {once} from "node:events";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const api=http.createServer(async(req,res)=>{const chunks=[];for await(const c of req)chunks.push(c);const value=chunks.length?JSON.parse(Buffer.concat(chunks).toString("utf8")):{};assert.equal(req.headers.authorization?.startsWith("Bearer "),true);res.setHeader("content-type","application/json");if(req.url==="/v1/agent/intents"){res.end(JSON.stringify({intents:[{id:"00000000-0000-4000-8000-000000000001",goal:"Test governance"}]}));return}if(req.url==="/v1/agent/reality/evaluate"){assert.equal(value.actor.id,"a2a-agent");assert.equal(value.actor.kind,"AGENT");res.end(JSON.stringify({authority:{decision:"ALLOW"},permit:{id:"permit-1",maxUses:1},proposal:{id:"proposal-1"}}));return}res.statusCode=404;res.end(JSON.stringify({error:"not_found"}))});
api.listen(0,"127.0.0.1");await once(api,"listening");const apiPort=api.address().port;
const reserve=http.createServer();reserve.listen(0,"127.0.0.1");await once(reserve,"listening");const a2aPort=reserve.address().port;await new Promise(r=>reserve.close(r));
const payload=Buffer.from(JSON.stringify({tokenType:"agent",agentId:"a2a-agent",agentName:"A2A Test Agent",provider:"test",sessionId:"55555555-5555-4555-8555-555555555555",scopeDeviceId:"dev_test_12345678"})).toString("base64url"),agentToken=`e30.${payload}.sig`,clientToken="C".repeat(64);
const child=spawn(process.execPath,[path.join(root,"apps/a2a/src/index.mjs")],{cwd:root,env:{...process.env,CIEAV_AGENT_TOKEN:agentToken,CIEAV_A2A_CLIENT_TOKEN:clientToken,CIEAV_A2A_PORT:String(a2aPort),CIEAV_API_URL:`http://127.0.0.1:${apiPort}`},stdio:["ignore","pipe","pipe"]});
async function waitReady(){for(let i=0;i<50;i++){try{const r=await fetch(`http://127.0.0.1:${a2aPort}/.well-known/agent-card.json`);if(r.ok)return await r.json()}catch{}await new Promise(r=>setTimeout(r,50))}throw new Error("A2A server did not start")}
try{
  const card=await waitReady();assert.equal(card.supportedInterfaces[0].protocolBinding,"JSONRPC");assert.equal(card.supportedInterfaces[0].protocolVersion,"1.0");assert.equal(card.capabilities.streaming,false);assert(card.securitySchemes.cieavLocal.httpAuthSecurityScheme);
  let unauthorized=await fetch(`http://127.0.0.1:${a2aPort}/rpc`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"ListTasks",params:{}})});assert.equal(unauthorized.status,401);
  const headers={"content-type":"application/json","authorization":`Bearer ${clientToken}`,"a2a-version":"1.0"};
  const list=await (await fetch(`http://127.0.0.1:${a2aPort}/rpc`,{method:"POST",headers,body:JSON.stringify({jsonrpc:"2.0",id:2,method:"SendMessage",params:{message:{messageId:"msg-1",role:"ROLE_USER",parts:[{data:{operation:"list_intents",input:{}}}]}}})})).json();assert.equal(list.result.message.role,"ROLE_AGENT");assert.equal(list.result.message.parts[0].data.result.intents.length,1);
  const evaluate=await (await fetch(`http://127.0.0.1:${a2aPort}/rpc`,{method:"POST",headers,body:JSON.stringify({jsonrpc:"2.0",id:3,method:"SendMessage",params:{message:{messageId:"msg-2",role:"ROLE_USER",parts:[{data:{operation:"evaluate_action",input:{intentId:"00000000-0000-4000-8000-000000000001",actor:{id:"attacker",kind:"HUMAN"},manifest:{requestId:"request-12345678",actionType:"test.action"}}}}]}}})})).json();assert.equal(evaluate.result.message.parts[0].data.result.authority.decision,"ALLOW");
  const missing=await (await fetch(`http://127.0.0.1:${a2aPort}/rpc`,{method:"POST",headers,body:JSON.stringify({jsonrpc:"2.0",id:4,method:"GetTask",params:{id:"does-not-exist"}})})).json();assert.equal(missing.error.code,-32001);
  const badVersion=await (await fetch(`http://127.0.0.1:${a2aPort}/rpc`,{method:"POST",headers:{...headers,"a2a-version":"0.3"},body:JSON.stringify({jsonrpc:"2.0",id:5,method:"ListTasks",params:{}})})).json();assert.equal(badVersion.error.code,-32009);
  console.log("CIEAV A2A 1.0 loopback governance checks passed");
}finally{child.kill("SIGTERM");await Promise.race([once(child,"exit"),new Promise(r=>setTimeout(r,1000))]);await new Promise(r=>api.close(r))}
