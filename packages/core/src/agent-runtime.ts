import crypto from "node:crypto";
import type {AgentPlanStep,AgentRuntimePlan,AgentStepState,Commitment} from "@cieav/contracts";

const terminal=new Set<AgentStepState>(["COMPLETED","FAILED","UNKNOWN","CANCELLED"]);
const transitions:Record<AgentStepState,ReadonlySet<AgentStepState>>={
  PENDING:new Set(["WAITING_FOR_AUTHORITY","READY","CANCELLED","FAILED"]),
  WAITING_FOR_AUTHORITY:new Set(["READY","CANCELLED","FAILED"]),
  READY:new Set(["DISPATCHED","WAITING_FOR_AUTHORITY","CANCELLED","FAILED"]),
  DISPATCHED:new Set(["OBSERVING","FAILED","UNKNOWN"]),
  OBSERVING:new Set(["COMPLETED","FAILED","UNKNOWN"]),
  COMPLETED:new Set(),FAILED:new Set(),UNKNOWN:new Set(),CANCELLED:new Set()
};

export function canTransitionAgentStep(from:AgentStepState,to:AgentStepState){return from===to||transitions[from].has(to)}
export function assertAgentStepTransition(from:AgentStepState,to:AgentStepState){if(!canTransitionAgentStep(from,to))throw new Error(`invalid agent step transition: ${from} -> ${to}`)}

export function transitionAgentStep(step:AgentPlanStep,to:AgentStepState,at=new Date().toISOString()):AgentPlanStep{
  assertAgentStepTransition(step.state,to);
  if(to==="READY"&&step.consequential&&!step.commitmentId)throw new Error("consequential agent step cannot become READY before commitment binding");
  if(to==="DISPATCHED"&&step.consequential&&!step.commitmentId)throw new Error("consequential agent step cannot dispatch before commitment binding");
  if(to==="COMPLETED"&&step.state!=="OBSERVING")throw new Error("agent step cannot complete without observation");
  return{...step,state:to,...(to==="DISPATCHED"?{attemptCount:step.attemptCount+1,lastAttemptAt:at}:{}),lastError:to==="FAILED"?step.lastError:undefined};
}

export function requireStepCommitment(step:AgentPlanStep):AgentPlanStep{
  if(terminal.has(step.state))throw new Error("terminal agent step cannot require commitment");
  if(!step.consequential)throw new Error("non-consequential agent step does not require commitment");
  assertAgentStepTransition(step.state,"WAITING_FOR_AUTHORITY");
  return{...step,state:"WAITING_FOR_AUTHORITY",commitmentId:undefined};
}

export function bindStepCommitment(step:AgentPlanStep,commitment:Pick<Commitment,"id"|"state">):AgentPlanStep{
  if(step.state!=="WAITING_FOR_AUTHORITY")throw new Error("agent step must be WAITING_FOR_AUTHORITY before commitment binding");
  if(!step.consequential)throw new Error("non-consequential agent step cannot bind commitment");
  if(commitment.state!=="AUTHORIZED")throw new Error("agent step requires an AUTHORIZED commitment");
  return{...step,commitmentId:commitment.id,state:"READY"};
}

export function nextRunnableStep(plan:AgentRuntimePlan,now=new Date()):AgentPlanStep|null{
  const sorted=[...plan.steps].sort((a,b)=>a.sequence-b.sequence);
  for(const step of sorted){
    if(step.state!=="READY"&&step.state!=="PENDING")continue;
    if(step.nextAttemptAt&&Date.parse(step.nextAttemptAt)>now.getTime())continue;
    const previous=sorted.filter(s=>s.sequence<step.sequence);
    if(previous.some(s=>s.state!=="COMPLETED"))continue;
    if(step.consequential&&!step.commitmentId)return null;
    return step;
  }
  return null;
}

export function stablePlanDigest(value:unknown){const canonical=(x:unknown):string=>Array.isArray(x)?`[${x.map(canonical).join(",")}]`:x&&typeof x==="object"?`{${Object.keys(x as Record<string,unknown>).sort().map(k=>`${JSON.stringify(k)}:${canonical((x as Record<string,unknown>)[k])}`).join(",")}}`:JSON.stringify(x);return crypto.createHash("sha256").update(canonical(value)).digest("hex")}
