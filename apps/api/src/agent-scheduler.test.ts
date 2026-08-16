import {describe,expect,it,vi} from "vitest";
import {CieavAgentScheduler} from "./agent-scheduler.js";

describe("CIEAV proactive scheduler",()=>{
  it("recovers once and prevents overlapping runtime ticks",async()=>{let resolveTick!:()=>void,calls=0;const runtime:any={recoverOnStartup:vi.fn(async()=>({tasks:[{}],steps:[{},{}]})),tick:vi.fn(async()=>{calls++;await new Promise<void>(r=>resolveTick=r);return[]})},scheduler=new CieavAgentScheduler(runtime,{intervalMs:60_000,jitterMs:0});await scheduler.start();const first=scheduler.tick(),second=scheduler.tick();expect(calls).toBe(1);expect(await second).toEqual([]);resolveTick();await first;const snap=await scheduler.stop();expect(runtime.recoverOnStartup).toHaveBeenCalledTimes(1);expect(snap.recoveredTasks).toBe(1);expect(snap.recoveredSteps).toBe(2);expect(snap.tickInFlight).toBe(false)});
  it("isolates runtime errors and remains stoppable",async()=>{const runtime:any={recoverOnStartup:async()=>({tasks:[],steps:[]}),tick:async()=>{throw new Error("boom")}},scheduler=new CieavAgentScheduler(runtime,{intervalMs:60_000,jitterMs:0});await scheduler.start();await scheduler.tick();const snap=await scheduler.stop();expect(snap.lastError).toBe("boom");expect(snap.running).toBe(false)});
});
