import {Readable} from "node:stream";
import {mkdtemp,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {IncomingMessage} from "node:http";
import {afterEach,describe,expect,it} from "vitest";
import type {AgentTokenPayload} from "./auth.js";
import {CieavAgentKernelStore} from "./agent-kernel.js";
import {CieavAgentKernelApi} from "./agent-kernel-api.js";

const dirs:string[]=[];
afterEach(async()=>{await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})))});
const intentId="11111111-1111-4111-8111-111111111111",deviceId="dev_test_12345678",sessionId="22222222-2222-4222-8222-222222222222";
const identity:AgentTokenPayload={sub:deviceId,installId:"agent-session",iat:1,exp:4102444800,tokenType:"agent",sessionId,scopeDeviceId:deviceId,agentId:"agent-1",allowedIntentIds:[intentId],allowedActionTypes:["*"],maxRisk:"HIGH"};
const owner={id:"user-1",kind:"HUMAN" as const},actor={id:"agent-1",kind:"AGENT" as const};
function request(method:string,value?:unknown){const r=Readable.from(value===undefined?[]:[JSON.stringify(value)]) as unknown as IncomingMessage;(r as any).method=method;return r}
async function fixture(){const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-framework-api-"));dirs.push(dir);const store=new CieavAgentKernelStore(path.join(dir,"kernel.json"),"k".repeat(64)),reality={store:{getIntent:async(scope:string,id:string)=>scope===deviceId&&id===intentId?{id:intentId,owner}:null}} as any,proof={store:{get:async()=>null}} as any;return{store,api:new CieavAgentKernelApi(store,reality,proof)}}
const call={id:"thread-1:call-1",version:1 as const,framework:"LANGGRAPH" as const,frameworkRunId:"thread-1",agentId:"attempted-substitution",toolName:"gmail.send",operation:"send",normalizedArgumentsDigest:"a".repeat(64),semanticEffect:{kind:"COMMUNICATE" as const,target:"customer@example.com",attributes:{}},retryOrdinal:0,occurredAt:"2026-08-19T00:00:00.000Z"};

describe("CIEAV framework interop agent API",()=>{
  it("forces authenticated agent identity into framework bindings",async()=>{const{api,store}=await fixture(),created=await api.handleAgent(request("POST",{intentId,actor,goal:"Send governed message"}),"/v1/agent/tasks",identity),taskId=(created?.body as any).task.id;const bound=await api.handleAgent(request("POST",{adapterManifestId:"cieav.langgraph.middleware",call}),`/v1/agent/tasks/${taskId}/framework-calls`,identity);expect(bound?.status).toBe(201);expect((bound?.body as any).binding.framework).toBe("LANGGRAPH");const bindings=await api.handleAgent(request("GET"),`/v1/agent/tasks/${taskId}/framework-bindings`,identity);expect((bindings?.body as any).bindings).toHaveLength(1);await store.close()});
  it("rejects a framework call whose manifest belongs to another framework",async()=>{const{api,store}=await fixture(),created=await api.handleAgent(request("POST",{intentId,actor,goal:"Send governed message"}),"/v1/agent/tasks",identity),taskId=(created?.body as any).task.id;const bad=await api.handleAgent(request("POST",{adapterManifestId:"cieav.agno.tool-hook",call}),`/v1/agent/tasks/${taskId}/framework-calls`,identity);expect(bad?.status).toBe(409);expect(String((bad?.body as any).error)).toContain("framework_adapter_manifest_mismatch");await store.close()});
});
