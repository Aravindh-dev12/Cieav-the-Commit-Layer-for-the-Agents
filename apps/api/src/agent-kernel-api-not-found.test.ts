import {Readable} from "node:stream";
import {afterEach,describe,expect,it} from "vitest";
import type {IncomingMessage} from "node:http";
import {mkdtemp,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {AgentTokenPayload} from "./auth.js";
import {CieavAgentKernelStore} from "./agent-kernel.js";
import {CieavAgentKernelApi} from "./agent-kernel-api.js";

const dirs:string[]=[];
afterEach(async()=>{await Promise.all(dirs.splice(0).map(dir=>rm(dir,{recursive:true,force:true})))});
const identity:AgentTokenPayload={sub:"dev_test_12345678",installId:"agent-session",iat:1,exp:4102444800,tokenType:"agent",sessionId:"55555555-5555-4555-8555-555555555555",scopeDeviceId:"dev_test_12345678",agentId:"agent-1",allowedIntentIds:["33333333-3333-4333-8333-333333333333"],allowedActionTypes:["data.share"],maxRisk:"HIGH"};
function request(){const req=Readable.from([JSON.stringify({to:"RUNNING"})]) as unknown as IncomingMessage;(req as any).method="POST";return req}

describe("Agent Kernel missing-task response contract",()=>{
  it("returns 404/not_found for a transition on a nonexistent task",async()=>{const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-agent-not-found-"));dirs.push(dir);const store=new CieavAgentKernelStore(path.join(dir,"kernel.json"),"k".repeat(64)),reality={store:{getIntent:async()=>null}} as any,proof={store:{get:async()=>null}} as any,api=new CieavAgentKernelApi(store,reality,proof),result=await api.handleAgent(request(),"/v1/agent/tasks/11111111-1111-4111-8111-111111111111/transition",identity);expect(result?.status).toBe(404);expect((result?.body as any).error).toBe("not_found");await store.close()});
});
