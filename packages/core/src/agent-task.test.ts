import {describe,expect,it} from "vitest";
import type {AgentTask,Commitment} from "@cieav/contracts";
import {bindTaskCommitment,bindTaskProof,detectAgentOpenLoop,enforceTaskDeadline,recoverInterruptedTask,requireCommitment,scheduleRetry,settleAgentTask,transitionAgentTask} from "./agent-task.js";

const now="2026-08-16T11:15:00.000Z";
function task(overrides:Partial<AgentTask>={}):AgentTask{return{id:"11111111-1111-4111-8111-111111111111",version:1,scopeDeviceId:"dev_test_12345678",intentId:"33333333-3333-4333-8333-333333333333",owner:{id:"user-1",kind:"HUMAN"},actor:{id:"agent-1",kind:"AGENT"},goal:"Complete governed work",state:"CREATED",createdAt:now,updatedAt:now,retryCount:0,maxRetries:2,commitmentRequired:false,openLoop:false,metadata:{},...overrides}}
const authorized:Pick<Commitment,"id"|"state">={id:"22222222-2222-4222-8222-222222222222",state:"AUTHORIZED"};
function authorizedRunning(){const queued=transitionAgentTask(task(),"QUEUED",now).task,planning=transitionAgentTask(queued,"PLANNING",now).task,required=requireCommitment(planning,now).task,bound=bindTaskCommitment(required,authorized,now).task;return transitionAgentTask(bound,"RUNNING",now).task}

describe("CIEAV Agent Kernel Core v1",()=>{
  it("requires trusted authority before agent execution and trusted proof settlement before completion",()=>{
    const queued=transitionAgentTask(task(),"QUEUED",now).task,planning=transitionAgentTask(queued,"PLANNING",now).task;
    expect(()=>transitionAgentTask(planning,"RUNNING",now)).toThrow(/trusted authority/i);
    const running=authorizedRunning();
    expect(()=>transitionAgentTask(running,"COMPLETED",now)).toThrow(/proof settlement/i);
    const observing=transitionAgentTask(running,"OBSERVING",now).task;
    expect(()=>settleAgentTask(observing,"PROVEN",now)).toThrow(/bound proof/i);
    const proofed=bindTaskProof(observing,"44444444-4444-4444-8444-444444444444",now).task;
    const completed=settleAgentTask(proofed,"PROVEN",now).task;
    expect(completed.state).toBe("COMPLETED");expect(completed.settlement).toBe("PROVEN");
  });

  it("blocks execution until an authorized Commitment is bound",()=>{
    const planning=task({state:"PLANNING"});
    expect(()=>transitionAgentTask(planning,"RUNNING",now)).toThrow(/trusted authority/i);
    const required=requireCommitment(planning,now);
    expect(required.task.state).toBe("WAITING_FOR_AUTHORITY");expect(required.task.commitmentRequired).toBe(true);
    expect(()=>transitionAgentTask(required.task,"RUNNING",now)).toThrow(/authority/i);
    expect(()=>bindTaskCommitment(required.task,{...authorized,state:"PROPOSED"},now)).toThrow(/AUTHORIZED/);
    const bound=bindTaskCommitment(required.task,authorized,now).task;
    expect(transitionAgentTask(bound,"RUNNING",now).task.state).toBe("RUNNING");
  });

  it("enforces retry budgets and deadlines",()=>{
    const failed=task({state:"FAILED",maxRetries:1});const retry=scheduleRetry(failed,"2026-08-16T11:16:00.000Z",now).task;
    expect(retry.retryCount).toBe(1);expect(retry.state).toBe("WAITING");
    expect(()=>scheduleRetry({...retry,state:"FAILED"},"2026-08-16T11:17:00.000Z",now)).toThrow(/retry budget exhausted/i);
    const overdue=task({state:"WAITING",deadlineAt:"2026-08-16T11:00:00.000Z"}),result=enforceTaskDeadline(overdue,new Date(now));
    expect(result?.task.state).toBe("FAILED");expect(result?.event.type).toBe("DEADLINE_EXCEEDED");
  });

  it("marks interrupted planning and running work for governed recovery",()=>{
    for(const state of ["PLANNING","RUNNING"] as const){const recovered=recoverInterruptedTask(task({state}),now);expect(recovered?.task.state).toBe("RECOVERY_REQUIRED");expect(recovered?.task.lastError).toBe("process_interrupted_before_settlement");expect(detectAgentOpenLoop(recovered!.task,new Date(now))?.reasons).toContain("RECOVERY_REQUIRED")}
  });

  it("maps unknown proof to recovery instead of success",()=>{
    const observing=bindTaskProof(task({state:"OBSERVING"}),"44444444-4444-4444-8444-444444444444",now).task,settled=settleAgentTask(observing,"UNKNOWN",now).task;
    expect(settled.state).toBe("RECOVERY_REQUIRED");expect(settled.openLoop).toBe(true);
  });
});
