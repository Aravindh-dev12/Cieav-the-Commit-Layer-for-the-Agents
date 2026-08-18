import {mkdtemp,readFile,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach,describe,expect,it} from "vitest";
import {CieavAgentKernelStore} from "./agent-kernel.js";

const dirs:string[]=[];
afterEach(async()=>{await Promise.all(dirs.splice(0).map(dir=>rm(dir,{recursive:true,force:true})))});
async function store(){const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-agent-kernel-"));dirs.push(dir);return{dir,file:path.join(dir,"tasks.json"),kernel:new CieavAgentKernelStore(path.join(dir,"tasks.json"),"k".repeat(64))}}
const create={scopeDeviceId:"dev_test_12345678",intentId:"33333333-3333-4333-8333-333333333333",owner:{id:"user-1",kind:"HUMAN" as const},actor:{id:"agent-1",kind:"AGENT" as const},goal:"Prepare and send the governed customer update",maxRetries:2,metadata:{source:"test"}};
async function authorizeRunning(kernel:CieavAgentKernelStore,id:string){await kernel.transition(id,"QUEUED");await kernel.transition(id,"PLANNING");await kernel.requireCommitment(id,"execution requires authority");await kernel.bindCommitmentTrusted(id,{id:"22222222-2222-4222-8222-222222222222",state:"AUTHORIZED"});return kernel.transition(id,"RUNNING")}

describe("CIEAV durable Agent Kernel store",()=>{
  it("persists device-scoped tasks and append-only ordered events across reload",async()=>{
    const s=await store(),created=await s.kernel.create(create);await s.kernel.transition(created.task.id,"QUEUED","ready");await s.kernel.transition(created.task.id,"PLANNING","planner started");await s.kernel.close();
    const reopened=new CieavAgentKernelStore(s.file,"k".repeat(64)),task=await reopened.get(created.task.id),events=await reopened.listEvents(created.task.id);
    expect(task?.state).toBe("PLANNING");expect(task?.intentId).toBe(create.intentId);expect(task?.scopeDeviceId).toBe(create.scopeDeviceId);expect(events.map(e=>e.sequence)).toEqual([1,2,3]);expect(events.map(e=>e.type)).toEqual(["TASK_CREATED","STATE_CHANGED","STATE_CHANGED"]);
    const raw=await readFile(s.file,"utf8");expect(raw).toContain('"mac"');await reopened.close();
  });

  it("recovers interrupted authorized RUNNING work as RECOVERY_REQUIRED and surfaces an open loop",async()=>{
    const s=await store(),created=await s.kernel.create(create);await authorizeRunning(s.kernel,created.task.id);
    const recovered=await s.kernel.recoverOnStartup(),loops=await s.kernel.openLoops();
    expect(recovered).toHaveLength(1);expect(recovered[0]?.state).toBe("RECOVERY_REQUIRED");expect(loops[0]?.reasons).toContain("RECOVERY_REQUIRED");
    const events=await s.kernel.listEvents(created.task.id);expect(events.at(-1)?.type).toBe("RECOVERY_REQUIRED");
  });

  it("refuses agent execution until trusted authority binds an AUTHORIZED Commitment",async()=>{
    const s=await store(),created=await s.kernel.create(create);await s.kernel.transition(created.task.id,"QUEUED");await s.kernel.transition(created.task.id,"PLANNING");
    await expect(s.kernel.transition(created.task.id,"RUNNING")).rejects.toThrow(/trusted authority/i);
    const required=await s.kernel.requireCommitment(created.task.id,"send has external consequence");
    await expect(s.kernel.transition(created.task.id,"RUNNING")).rejects.toThrow(/authority/i);
    await expect(s.kernel.bindCommitmentTrusted(created.task.id,{id:"22222222-2222-4222-8222-222222222222",state:"PROPOSED"})).rejects.toThrow(/AUTHORIZED/);
    const bound=await s.kernel.bindCommitmentTrusted(created.task.id,{id:"22222222-2222-4222-8222-222222222222",state:"AUTHORIZED"});expect(bound.task.commitmentId).toBeTruthy();
    expect((await s.kernel.transition(created.task.id,"RUNNING")).task.state).toBe("RUNNING");expect(required.event.type).toBe("COMMITMENT_REQUIRED");
  });

  it("requires bound proof before trusted settlement can complete a task",async()=>{
    const s=await store(),created=await s.kernel.create(create);await authorizeRunning(s.kernel,created.task.id);await s.kernel.transition(created.task.id,"OBSERVING");
    await expect(s.kernel.settleTrusted(created.task.id,"PROVEN")).rejects.toThrow(/bound proof/i);
    await s.kernel.bindProofTrusted(created.task.id,"44444444-4444-4444-8444-444444444444");
    const settled=await s.kernel.settleTrusted(created.task.id,"PROVEN");expect(settled.task.state).toBe("COMPLETED");expect(settled.task.settlement).toBe("PROVEN");
  });

  it("fails closed when durable state integrity is corrupted",async()=>{
    const s=await store(),created=await s.kernel.create(create);await s.kernel.close();const raw=await readFile(s.file,"utf8");await import("node:fs/promises").then(fs=>fs.writeFile(s.file,raw.replace(created.task.goal,"tampered goal"),"utf8"));
    const corrupted=new CieavAgentKernelStore(s.file,"k".repeat(64));await expect(corrupted.list()).rejects.toThrow(/corrupt|unauthenticated|integrity/i);
  });
});
