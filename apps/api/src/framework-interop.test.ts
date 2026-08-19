import {mkdtemp,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach,describe,expect,it} from "vitest";
import {CieavAgentKernelStore} from "./agent-kernel.js";

const dirs:string[]=[];
afterEach(async()=>{await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})))});
async function kernel(){const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-framework-interop-"));dirs.push(dir);return new CieavAgentKernelStore(path.join(dir,"kernel.json"),"k".repeat(64))}
const intentId="11111111-1111-4111-8111-111111111111";
const call={id:"langgraph:thread-1:call-1",version:1 as const,framework:"LANGGRAPH" as const,frameworkRunId:"thread-1",frameworkTaskId:"node-send",agentId:"agent-1",toolName:"gmail.send",operation:"send",normalizedArgumentsDigest:"a".repeat(64),semanticEffect:{kind:"COMMUNICATE" as const,target:"customer@example.com",attributes:{channel:"email"}},retryOrdinal:0,occurredAt:"2026-08-19T00:00:00.000Z"};

describe("CIEAV durable framework interop",()=>{
  it("ships researched framework presets as governed/observe rather than pretending they are mandatory",async()=>{const k=await kernel(),manifests=await k.frameworkInterop.listManifests();expect(manifests.some(x=>x.framework==="LANGGRAPH")).toBe(true);expect(manifests.some(x=>x.framework==="AGNO")).toBe(true);expect(manifests.find(x=>x.framework==="LANGFUSE")?.mode).toBe("OBSERVE");expect((await k.frameworkInterop.stats()).mandatoryEligible).toBe(0);await k.close()});

  it("binds a framework call to the durable task and rejects replay of the same framework call",async()=>{const k=await kernel(),created=await k.create({scopeDeviceId:"dev_test_12345678",intentId,sessionId:"22222222-2222-4222-8222-222222222222",owner:{id:"user-1",kind:"HUMAN"},actor:{id:"agent-1",kind:"AGENT"},goal:"Send governed message",maxRetries:2,metadata:{}}),task=created.task;const first=await k.frameworkInterop.bind(call,{agentTaskId:task.id,intentId,adapterManifestId:"cieav.langgraph.middleware"});expect(first.binding.frameworkCallId).toBe(call.id);expect(first.binding.status).toBe("BOUND");await expect(k.frameworkInterop.bind(call,{agentTaskId:task.id,intentId,adapterManifestId:"cieav.langgraph.middleware"})).rejects.toThrow("framework_call_already_bound");await k.close()});

  it("rejects agent substitution in a framework binding",async()=>{const k=await kernel(),created=await k.create({scopeDeviceId:"dev_test_12345678",intentId,sessionId:"22222222-2222-4222-8222-222222222222",owner:{id:"user-1",kind:"HUMAN"},actor:{id:"agent-1",kind:"AGENT"},goal:"Send governed message",maxRetries:2,metadata:{}});await expect(k.frameworkInterop.bind({...call,agentId:"other-agent"},{agentTaskId:created.task.id,intentId,adapterManifestId:"cieav.langgraph.middleware"})).rejects.toThrow("framework_binding_agent_mismatch");await k.close()});
});
