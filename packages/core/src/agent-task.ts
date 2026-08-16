import type {AgentOpenLoop,AgentTask,AgentTaskEvent,AgentTaskState,Commitment} from "@cieav/contracts";

const terminal=new Set<AgentTaskState>(["COMPLETED","FAILED","CANCELLED"]);
const transitions:Record<AgentTaskState,ReadonlySet<AgentTaskState>>={
  CREATED:new Set(["QUEUED","CANCELLED"]),
  QUEUED:new Set(["PLANNING","CANCELLED","FAILED"]),
  PLANNING:new Set(["WAITING_FOR_AUTHORITY","RUNNING","WAITING","FAILED","CANCELLED"]),
  WAITING_FOR_AUTHORITY:new Set(["QUEUED","RUNNING","WAITING","CANCELLED","FAILED","RECOVERY_REQUIRED"]),
  RUNNING:new Set(["OBSERVING","WAITING","FAILED","CANCELLED","RECOVERY_REQUIRED"]),
  OBSERVING:new Set(["COMPLETED","WAITING","FAILED","RECOVERY_REQUIRED"]),
  WAITING:new Set(["QUEUED","PLANNING","RUNNING","OBSERVING","FAILED","CANCELLED","RECOVERY_REQUIRED"]),
  COMPLETED:new Set(),
  FAILED:new Set(["QUEUED","RECOVERY_REQUIRED"]),
  CANCELLED:new Set(),
  RECOVERY_REQUIRED:new Set(["QUEUED","PLANNING","WAITING_FOR_AUTHORITY","OBSERVING","FAILED","CANCELLED"])
};

export function isTerminalAgentTaskState(state:AgentTaskState){return terminal.has(state)}
export function canTransitionAgentTask(from:AgentTaskState,to:AgentTaskState){return from===to||transitions[from].has(to)}
export function assertAgentTaskTransition(from:AgentTaskState,to:AgentTaskState){if(!canTransitionAgentTask(from,to))throw new Error(`invalid agent task transition: ${from} -> ${to}`)}

export function transitionAgentTask(task:AgentTask,to:AgentTaskState,at=new Date().toISOString(),reason="state transition"):{task:AgentTask;event:Omit<AgentTaskEvent,"id"|"sequence">}{
  assertAgentTaskTransition(task.state,to);
  if(to==="RUNNING"&&task.commitmentRequired&&!task.authoritySatisfiedAt)throw new Error("agent task cannot run consequential work before authority is satisfied");
  if(to==="COMPLETED"&&task.state!=="OBSERVING")throw new Error("agent task cannot complete without observation");
  const next:AgentTask={...task,state:to,updatedAt:at,openLoop:["WAITING_FOR_AUTHORITY","WAITING","OBSERVING","RECOVERY_REQUIRED"].includes(to)};
  return{task:next,event:{taskId:task.id,type:to==="CANCELLED"?"CANCELLED":to==="RECOVERY_REQUIRED"?"RECOVERY_REQUIRED":"STATE_CHANGED",at,fromState:task.state,toState:to,reason,data:{}}};
}

export function requireCommitment(task:AgentTask,at=new Date().toISOString(),reason="consequential action requires local authority"):{task:AgentTask;event:Omit<AgentTaskEvent,"id"|"sequence">}{
  if(isTerminalAgentTaskState(task.state))throw new Error("terminal agent task cannot require a new commitment");
  const next={...task,commitmentRequired:true,commitmentId:undefined,authoritySatisfiedAt:undefined,updatedAt:at,openLoop:true,state:"WAITING_FOR_AUTHORITY" as const};
  return{task:next,event:{taskId:task.id,type:"COMMITMENT_REQUIRED",at,fromState:task.state,toState:"WAITING_FOR_AUTHORITY",reason,data:{}}};
}

export function bindTaskCommitment(task:AgentTask,commitment:Pick<Commitment,"id"|"state">,at=new Date().toISOString()):{task:AgentTask;event:Omit<AgentTaskEvent,"id"|"sequence">}{
  if(!task.commitmentRequired)throw new Error("agent task has not declared a commitment requirement");
  if(commitment.state!=="AUTHORIZED")throw new Error("agent task requires an AUTHORIZED commitment before authority can be satisfied");
  const next={...task,commitmentId:commitment.id,authoritySatisfiedAt:at,updatedAt:at};
  return{task:next,event:{taskId:task.id,type:"AUTHORITY_BOUND",at,fromState:task.state,toState:task.state,reason:"Authorized commitment bound to task.",commitmentId:commitment.id,data:{}}};
}

export function scheduleRetry(task:AgentTask,nextRunAt:string,at=new Date().toISOString(),reason="retry scheduled"):{task:AgentTask;event:Omit<AgentTaskEvent,"id"|"sequence">}{
  if(task.retryCount>=task.maxRetries)throw new Error("agent task retry budget exhausted");
  if(isTerminalAgentTaskState(task.state)&&task.state!=="FAILED")throw new Error("terminal agent task cannot be retried");
  const retryCount=task.retryCount+1,next={...task,retryCount,nextRunAt,updatedAt:at,state:"WAITING" as const,openLoop:true};
  return{task:next,event:{taskId:task.id,type:"RETRY_SCHEDULED",at,fromState:task.state,toState:"WAITING",reason,data:{retryCount,nextRunAt}}};
}

export function enforceTaskDeadline(task:AgentTask,now=new Date()):{task:AgentTask;event:Omit<AgentTaskEvent,"id"|"sequence">}|null{
  if(!task.deadlineAt||isTerminalAgentTaskState(task.state)||Date.parse(task.deadlineAt)>now.getTime())return null;
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
  const next={...task,state:"RECOVERY_REQUIRED" as const,updatedAt:at,openLoop:true,lastError:"process_interrupted_before_settlement"};
  return{task:next,event:{taskId:task.id,type:"RECOVERY_REQUIRED",at,fromState:task.state,toState:"RECOVERY_REQUIRED",reason:"Task was active when the runtime restarted; CIEAV requires governed recovery instead of assuming success.",data:{}}};
}
