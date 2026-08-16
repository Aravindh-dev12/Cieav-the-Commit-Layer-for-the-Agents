import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach,describe,expect,it} from "vitest";
import {stablePlanDigest} from "@cieav/core";
import {CieavAgentKernelStore} from "./agent-kernel.js";
import {CieavAgentRuntimeStore} from "./agent-runtime-store.js";
import {CieavAgentRuntime} from "./agent-runtime.js";
import {createGovernanceDispatcher} from "./agent-runtime-dispatch.js";

const dirs:string[]=[];
afterEach(async()=>{await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})))});
async function stores(){const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-agent-runtime-"));dirs.push(dir);const secret="s".repeat(48);return{dir,tasks:new CieavAgentKernelStore(path.join(dir,"tasks.json"),secret),runtime:new CieavAgentRuntimeStore(path.join(dir,"runtime.json"),secret)}}
const principal={id:"agent-1",kind:"AGENT" as const};

function planner(consequential=false){return{async plan({goal}:{goal:string}){return{provider:"cieav-private-inference",model:"Qwen/Qwen3.6-35B-A3B",protocolVersion:"cieav-private-inference-v1",steps:[{id:"step-1",sequence:1,kind:"MCP_GOVERNANCE" as const,summary:"Evaluate action",actionType:"web.action",consequential,metadata:{operation:"evaluate_action",inputJson:JSON.stringify({goal})}}]}}}}

describe("CIEAV Agent Kernel Runtime v1",()=>{
  it("plans privacy-reduced work and completes only after verified dispatch observation",async()=>{
    const {tasks,runtime}=await stores(),created=await tasks.create({owner:principal,actor:principal,goal:"Email alice@example.com and call +1 555 123 4567",maxRetries:2,metadata:{}});await tasks.transition(created.task.id,"QUEUED","test");
    let seenGoal="";const p={async plan(input:any){seenGoal=input.goal;return planner(false).plan(input)}};
    const dispatcher=createGovernanceDispatcher("MCP",async()=>({ok:true,verified:true,result:{decision:"ALLOW"}}));
    const kernel=new CieavAgentRuntime(tasks,runtime,p,{MCP_GOVERNANCE:dispatcher});const out=await kernel.runOnce(created.task.id);
    expect(seenGoal).toContain("[EMAIL]");expect(seenGoal).not.toContain("alice@example.com");
    expect(out?.task.state).toBe("COMPLETED");expect(out?.receipt?.executionAuthority).toBe(false);expect(out?.receipt?.transport).toBe("MCP");
    const receipts=await runtime.listReceipts(created.task.id);expect(receipts).toHaveLength(1);expect(receipts[0]?.resultDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("pauses consequential work until an AUTHORIZED Commitment is bound",async()=>{
    const {tasks,runtime}=await stores(),created=await tasks.create({owner:principal,actor:principal,goal:"Purchase approved subscription",maxRetries:2,metadata:{}});await tasks.transition(created.task.id,"QUEUED","test");
    let dispatches=0;const dispatcher=createGovernanceDispatcher("MCP",async()=>{dispatches++;return{ok:true,verified:true,result:{decision:"ALLOW"}}});
    const kernel=new CieavAgentRuntime(tasks,runtime,planner(true),{MCP_GOVERNANCE:dispatcher});const first=await kernel.runOnce(created.task.id);
    expect(first?.task.state).toBe("WAITING_FOR_AUTHORITY");expect(dispatches).toBe(0);
    const plan=await runtime.getPlan(created.task.id),step=plan!.steps[0]!;expect(step.state).toBe("WAITING_FOR_AUTHORITY");
    const commitment={id:"00000000-0000-4000-8000-000000000099",state:"AUTHORIZED" as const};await kernel.bindCommitment(created.task.id,step.id,commitment);const second=await kernel.runOnce(created.task.id);
    expect(dispatches).toBe(1);expect(second?.task.state).toBe("COMPLETED");expect(second?.receipt?.commitmentId).toBe(commitment.id);
  });

  it("moves unverified dispatch outcomes to RECOVERY_REQUIRED",async()=>{
    const {tasks,runtime}=await stores(),created=await tasks.create({owner:principal,actor:principal,goal:"Check external state",maxRetries:2,metadata:{}});await tasks.transition(created.task.id,"QUEUED","test");
    const dispatcher=createGovernanceDispatcher("MCP",async()=>({ok:true,verified:false,result:{claimed:"done"}}));const kernel=new CieavAgentRuntime(tasks,runtime,planner(false),{MCP_GOVERNANCE:dispatcher});const out=await kernel.runOnce(created.task.id);
    expect(out?.task.state).toBe("RECOVERY_REQUIRED");const plan=await runtime.getPlan(created.task.id);expect(plan?.steps[0]?.state).toBe("UNKNOWN");
  });

  it("recovers DISPATCHED steps as UNKNOWN after restart and rejects tampered runtime state",async()=>{
    const {dir,runtime}=await stores(),taskId="00000000-0000-4000-8000-000000000010",plannedAt="2026-08-16T11:30:00.000Z";
    const body={version:1 as const,taskId,plannedAt,planner:{provider:"test",model:"test",protocolVersion:"v1",executionAuthority:false as const,privacyReduced:true as const},steps:[{id:"step-1",sequence:1,kind:"MCP_GOVERNANCE" as const,summary:"Evaluate",consequential:false,state:"DISPATCHED" as const,attemptCount:1,lastAttemptAt:plannedAt,metadata:{operation:"evaluate_action",inputJson:"{}"}}]};
    await runtime.putPlan({...body,planDigest:stablePlanDigest(body)});const recovered=await runtime.recoverInFlight();expect(recovered[0]?.state).toBe("UNKNOWN");expect((await runtime.getPlan(taskId))?.steps[0]?.state).toBe("UNKNOWN");
    const file=path.join(dir,"runtime.json"),raw=await readFile(file,"utf8"),parsed=JSON.parse(raw);parsed.payload.plans[0].planner.model="tampered";await writeFile(file,JSON.stringify(parsed));
    const reopened=new CieavAgentRuntimeStore(file,"s".repeat(48));await expect(reopened.listPlans()).rejects.toThrow(/corrupt|unauthenticated|integrity/i);
  });
});
