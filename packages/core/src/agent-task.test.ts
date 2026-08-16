import {describe,expect,it} from "vitest";
import type {AgentTask,Commitment} from "@cieav/contracts";
import {bindTaskCommitment,detectAgentOpenLoop,enforceTaskDeadline,recoverInterruptedTask,requireCommitment,scheduleRetry,transitionAgentTask} from "./agent-task.js";

const now="2026-08-16T11:15:00.000Z";
function task(overrides:Partial<AgentTask>={}):AgentTask{return{id:"11111111-1111-4111-8111-111111111111",version:1,owner:{id:"user-1",kind:"HUMAN"},actor:{id:"agent-1",kind:"AGENT"},goal:"Complete governed work",state:"CREATED",createdAt:now,updatedAt:now,retryCount:0,maxRetries:2,commitmentRequired:false,openLoop:false,metadata:{},...overrides}}
const authorized:Pick<Commitment,"id"|"state">={id:"22222222-2222-4222-8222-222222222222",state:"AUTHORIZED"};

describe("CIEAV Agent Kernel Core v1",()=>{
  it("requires observation before completion",()=>{
    const queued=transitionAgentTask(task(),"QUEUED",now).task;
    const planning=transitionAgentTask(queued,"PLANNING",now).task;
    const running=transitionAgentTask(planning,"RUNNING",now).task;
    expect(()=>transitionAgentTask(running,"COMPLETED",now)).toThrow(/invalid agent task transition|without observation/i);
    const observing=transitionAgentTask(running,"OBSERVING",now).task;
    expect(transitionAgentTask(observing,"COMPLETED",now).task.state).toBe("COMPLETED");
  });

  it("blocks consequential execution until an authorized Commitment is bound",()=>{
    const planning=task({state:"PLANNING"});
    const required=requireCommitment(planning,now);
    expect(required.task.state).toBe("WAITING_FOR_AUTHORITY");
    expect(required.task.commitmentRequired).toBe(true);
    expect(()=>transitionAgentTask(required.task,"RUNNING",now)).toThrow(/authority/i);
    expect(()=>bindTaskCommitment(required.task,{...authorized,state:"PROPOSED"},now)).toThrow(/AUTHORIZED/);
    const bound=bindTaskCommitment(required.task,authorized,now).task;
    expect(transitionAgentTask(bound,"RUNNING",now).task.state).toBe("RUNNING");
  });

  it("enforces retry budgets and deadlines",()=>{
    const failed=task({state:"FAILED",maxRetries:1});
    const retry=scheduleRetry(failed,"2026-08-16T11:16:00.000Z",now).task;
    expect(retry.retryCount).toBe(1);
    expect(retry.state).toBe("WAITING");
    expect(()=>scheduleRetry({...retry,state:"FAILED"},"2026-08-16T11:17:00.000Z",now)).toThrow(/retry budget exhausted/i);
    const overdue=task({state:"WAITING",deadlineAt:"2026-08-16T11:00:00.000Z"});
    const result=enforceTaskDeadline(overdue,new Date(now));
    expect(result?.task.state).toBe("FAILED");
    expect(result?.event.type).toBe("DEADLINE_EXCEEDED");
  });

  it("marks interrupted active work for governed recovery instead of success",()=>{
    const recovered=recoverInterruptedTask(task({state:"RUNNING"}),now);
    expect(recovered?.task.state).toBe("RECOVERY_REQUIRED");
    expect(recovered?.task.lastError).toBe("process_interrupted_before_settlement");
    expect(detectAgentOpenLoop(recovered!.task,new Date(now))?.reasons).toContain("RECOVERY_REQUIRED");
  });
});
