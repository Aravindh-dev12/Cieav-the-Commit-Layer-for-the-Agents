import {describe,expect,it} from "vitest";
import type {AgentPlanStep,AgentRuntimePlan} from "@cieav/contracts";
import {bindStepCommitment,nextRunnableStep,requireStepCommitment,stablePlanDigest,transitionAgentStep} from "./agent-runtime.js";

const step=(overrides:Partial<AgentPlanStep>={}):AgentPlanStep=>({id:"step-1",sequence:1,kind:"MCP_GOVERNANCE",summary:"Evaluate proposed action",consequential:false,state:"PENDING",attemptCount:0,metadata:{},...overrides});

describe("Agent Runtime governed step lifecycle",()=>{
  it("blocks consequential dispatch before authorized commitment binding",()=>{
    const pending=step({consequential:true});
    expect(()=>transitionAgentStep(pending,"READY")).toThrow(/commitment binding/i);
    const waiting=requireStepCommitment(pending);
    expect(waiting.state).toBe("WAITING_FOR_AUTHORITY");
    expect(()=>bindStepCommitment(waiting,{id:"00000000-0000-4000-8000-000000000001",state:"PROPOSED"})).toThrow(/AUTHORIZED/i);
    const ready=bindStepCommitment(waiting,{id:"00000000-0000-4000-8000-000000000001",state:"AUTHORIZED"});
    expect(ready.state).toBe("READY");
    expect(transitionAgentStep(ready,"DISPATCHED").attemptCount).toBe(1);
  });

  it("requires observation before completion",()=>{
    const ready=step({state:"READY"}),dispatched=transitionAgentStep(ready,"DISPATCHED");
    expect(()=>transitionAgentStep(dispatched,"COMPLETED")).toThrow(/without observation/i);
    expect(transitionAgentStep(transitionAgentStep(dispatched,"OBSERVING"),"COMPLETED").state).toBe("COMPLETED");
  });

  it("only returns a runnable step when predecessors are complete",()=>{
    const plan:AgentRuntimePlan={version:1,taskId:"00000000-0000-4000-8000-000000000010",plannedAt:"2026-08-16T11:30:00.000Z",planner:{provider:"test",model:"test",protocolVersion:"v1",executionAuthority:false,privacyReduced:true},planDigest:"a".repeat(64),steps:[step({id:"a",sequence:1,state:"READY"}),step({id:"b",sequence:2,state:"READY"})]};
    expect(nextRunnableStep(plan)?.id).toBe("a");
    plan.steps[0]={...plan.steps[0]!,state:"COMPLETED"};
    expect(nextRunnableStep(plan)?.id).toBe("b");
  });

  it("produces stable digests independent of object key order",()=>{
    expect(stablePlanDigest({a:1,b:2})).toBe(stablePlanDigest({b:2,a:1}));
  });
});
