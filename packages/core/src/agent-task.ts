import type {AgentOpenLoop,AgentTask,AgentTaskEvent,AgentTaskState,Commitment} from "@cieav/contracts";

const terminal=new Set<AgentTaskState>(["COMPLETED","FAILED","CANCELLED"]);
const transitions:Record<AgentTaskState,ReadonlySet<AgentTaskState>>={
  CREATED:new Set(["QUEUED","CANCELLED","FAILED"]),
  QUEUED:new Set(["PLANNING","CANCELLED","FAILED"]),
  PLANNING:new Set(["WAITING_FOR_AUTHORITY","RUNNING","WAITING","FAILED","CANCELLED","RECOVERY_REQUIRED"]),
  WAITING_FOR_AUTHORITY:new Set(["QUEUED","RUNNING","WAITING","CANCELLED","FAILED","RECOVERY_REQUIRED"]),
  RUNNING:new Set(["OBSERVING","WAITING","FAILED","CANCELLED","RECOVERY_REQUIRED"]),
  OBSERVING:new Set(["WAITING","FAILED","RECOVERY_REQUIRED"]),
  WAITING:new Set(["QUEUED","PLANNING","RUNNING","OBSERVING","FAILED","CANCELLED","RECOVERY_REQUIRED","WAITING_FOR_AUTHORITY"]),
  COMPLETED:new Set(),
  FAILED:new Set(["WAITING","RECOVERY_REQUIRED"]),
  CANCELLED:new Set(),
  RECOVERY_REQUIRED:new Set(["QUEUED","PLANNING","WAITING_FOR_AUTHORITY","OBSERVING","FAILED","CANCELLED","WAITING"])
};

export function isTerminalAgentTaskState(state:AgentTaskState){return terminal.has(state)}
export function canTransitionAgentTask(from:AgentTaskState,to:AgentTaskState){return from===to||transitions[from].has(to)}
export function assertAgentTaskTransition(from:AgentTaskState,to:AgentTaskState){if(!canTransitionAgentTask(from,to))throw new Error(`invalid agent task transition: ${from} -> ${to}`)}

export function transitionAgentTask(task:AgentTask,to:AgentTaskState,at=new Date().toISOString(),reason="state transition"):{task:AgentTask;event:Omit<AgentTaskEvent,"id"|"sequence">}{
  if(to==="COMPLETED")throw new Error("agent task completion requires trusted proof settlement");
  assertAgentTaskTransition(task.state,to);
  if(to==="RUNNING"&&task.commitmentRequired&&!task.authoritySatisfiedAt)throw new Error("agent task cannot run consequential work before authority is satisfied");
  const next:AgentTask={...task,state:to,updatedAt:at,openLoop:["WAITING_FOR_AUTHORITY","WAITING","OBSERVING","RECOVERY_REQUIRED"].includes(to)};
  return{task:next,event:{taskId:task.id,type:to==="CANCELLED"?"CANCELLED":to==="RECOVERY_REQUIRED"?"RECOVERY_REQUIRED":"STATE_CHANGED",at,fromState:task.state,toState:to,reason,data:{}}};
}

export function requireCommitment(task:AgentTask,at=new Date().toISOString(),reason="consequential action requires local authority"):{task:AgentTask;event:Omit<AgentTaskEvent,"id"|"sequence">}{
  if(!["PLANNING","WAITING","RECOVERY_REQUIRED"].includes(task.state))throw new Error(`agent task cannot require a new commitment from state ${task.state}`);
  assertAgentTaskTransition(task.state,"WAITING_FOR_AUTHORITY");
  const next={...task,commitmentRequired:true,commitmentId:undefined,authoritySatisfiedAt:undefined,updatedAt:at,openLoop:true,state:"WAITING_FOR_AUTHORITY" as const};
  return{task:next,event:{taskId:task.id,type:"COMMITMENT_REQUIRED",at,fromState:task.state,toState:"WAITING_FOR_AUTHORITY",reason,data:{}}};
}

export function bindTaskCommitment(task:AgentTask,commitment:Pick<Commitment,"id"|"state">,at=new Date().toISOString()):{task:AgentTask;event:Omit<AgentTaskEvent,"id"|"sequence">}{
  if(task.state!=="WAITING_FOR_AUTHORITY")throw new Error("agent task must be WAITING_FOR_AUTHORITY before binding a commitment");
  if(!task.commitmentRequired)throw new Error("agent task has not declared a commitment requirement");
  if(commitment.state!=="AUTHORIZED")throw new Error("agent task requires an AUTHORIZED commitment before authority can be satisfied");
  const next={...task,commitmentId:commitment.id,authoritySatisfiedAt:at,updatedAt:at};
  return{task:next,event:{taskId:task.id,type:"AUTHORITY_BOUND",at,fromState:task.state,toState:task.state,reason:"Trusted local authority bound an authorized commitment to the task.",commitmentId:commitment.id,data:{}}};
}

export function bindTaskProof(task:AgentTask,proofCaseId:string,at=new Date().toISOString()):{task:AgentTask;event:Omit<AgentTaskEvent,"id"|"sequence">}{
  if(task.state!=="OBSERVING")throw new Error("proof can only be bound while task is OBSERVING");
  const next:AgentTask={...task,proofCaseId,updatedAt:at,openLoop:true};
  return{task:next,event:{taskId:task.id,type:"PROOF_BOUND",at,fromState:task.state,toState:task.state,reason:"Trusted proof case bound to task observation.",data:{proofCaseId}}};
}

export function settleAgentTask(task:AgentTask,status:"PROVEN"|"DISPROVEN"|"UNKNOWN",at=new Date().toISOString()):{task:AgentTask;event:Omit<AgentTaskEvent,"id"|"sequence">}{
  if(task.state!=="OBSERVING")throw new Error("agent task settlement requires OBSERVING state");
  if(!task.proofCaseId)throw new Error("agent task settlement requires a bound proof case");
  const state:AgentTaskState=status==="PROVEN"?"COMPLETED":status==="DISPROVEN"?"FAILED":"RECOVERY_REQUIRED";
  const next:AgentTask={...task,state,settlement:status,settledAt:at,updatedAt:at,openLoop:state==="RECOVERY_REQUIRED",...(status==="DISPROVEN"?{lastError:"proof_disproven"}:status==="UNKNOWN"?{lastError:"proof_unknown"}:{})};
  return{task:next,event:{taskId:task.id,type:"SETTLED",at,fromState:task.state,toState:state,reason:status==="PROVEN"?"Independent proof satisfied task completion.":status==="DISPROVEN"?"Independent proof disproved the expected result.":"Proof remained insufficient; governed recovery is required.",data:{settlement:status,proofCaseId:task.proofCaseId}}};
}

export function scheduleRetry(task:AgentTask,nextRunAt:string,at=new Date().toISOString(),reason="retry scheduled"):{task:AgentTask;event:Omit<AgentTaskEvent,"id"|"sequence">}{
  if(task.retryCount>=task.maxRetries)throw new Error("agent task retry budget exhausted");
  if(!["FAILED","WAITING","RECOVERY_REQUIRED"].includes(task.state))throw new Error(`agent task cannot schedule retry from state ${task.state}`);
  assertAgentTaskTransition(task.state,"WAITING");
  const retryCount=task.retryCount+1,next={...task,retryCount,nextRunAt,updatedAt:at,state:"WAITING" as const,openLoop:true};
  return{task:next,event:{taskId:task.id,type:"RETRY_SCHEDULED",at,fromState:task.state,toState:"WAITING",reason,data:{retryCount,nextRunAt}}};
}

export function enforceTaskDeadline(task:AgentTask,now=new Date()):{task:AgentTask;event:Omit<AgentTaskEvent,"id"|"sequence">}|null{
  if(!task.deadlineAt||isTerminalAgentTaskState(task.state)||Date.parse(task.deadlineAt)>now.getTime())return null;
  if(!canTransitionAgentTask(task.state,"FAILED"))return{task:{...task,state:"RECOVERY_REQUIRED",updatedAt:now.toISOString(),openLoop:true,lastError:"deadline_exceeded"},event:{taskId:task.id,type:"DEADLINE_EXCEEDED",at:now.toISOString(),fromState:task.state,toState:"RECOVERY_REQUIRED",reason:"Agent task deadline exceeded in a state that requires governed recovery.",data:{deadlineAt:task.deadlineAt}}};
  const at=now.toISOString(),next={...task,state:"FAILED" as const,updatedAt:at,openLoop:false,lastError:"deadline_exceeded"};
  return{task:next,event:{taskId:task.id,type:"DEADLINE_EXCEEDED",at,fromState:task.state,toState:"FAILED",reason:"Agent task deadline exceeded before verified completion.",data:{deadlineAt:task.deadlineAt}}};
}

export function detectAgentOpenLoop(task:AgentTask,now=new Date(),staleAfterMs=5*60_000):AgentOpenLoop|null{
  if(isTerminalAgentTaskState(task.state))return null;
  const reasons:AgentOpenLoop["reasons"]=[];
  if(task.state==="WAITING_FOR_AUTHORITY")reasons.push("WAITING_FOR_AUTHORITY");
  if(task.state==="WAITING")reasons.push("WAITING_EXTERNAL");
  if(task.state==="OBSERVING")reasons.push("OBSERVATION_PENDING");
  if(task.state==="RECOVERY_REQUIRED")reasons.push("RECOVERY_REQUIRED");
  if(task.deadlineAt&&Date.parse(task.deadlineAt)<=now.getTime())reasons.push("DEADLINE_EXCEEDED");
  if(!reasons.length&&now.getTime()-Date.parse(task.updatedAt)>=staleAfterMs)reasons.push("STALE_ACTIVE_TASK");
  return reasons.length?{taskId:task.id,state:task.state,detectedAt:now.toISOString(),reasons}:null;
}

export function recoverInterruptedTask(task:AgentTask,at=new Date().toISOString()):{task:AgentTask;event:Omit<AgentTaskEvent,"id"|"sequence">}|null{
  if(!["PLANNING","RUNNING"].includes(task.state))return null;
  assertAgentTaskTransition(task.state,"RECOVERY_REQUIRED");
  const next={...task,state:"RECOVERY_REQUIRED" as const,updatedAt:at,openLoop:true,lastError:"process_interrupted_before_settlement"};
  return{task:next,event:{taskId:task.id,type:"RECOVERY_REQUIRED",at,fromState:task.state,toState:"RECOVERY_REQUIRED",reason:"Task was active when the runtime restarted; CIEAV requires governed recovery instead of assuming success.",data:{}}};
}
