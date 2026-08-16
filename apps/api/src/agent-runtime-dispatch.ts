import type {AgentPlanStep,AgentTask} from "@cieav/contracts";
import type {AgentDispatchResult,AgentStepDispatcher} from "./agent-runtime.js";

export type GovernanceTransport="MCP"|"A2A";
export interface GovernanceInvocation {taskId:string;stepId:string;operation:string;input:Record<string,unknown>;commitmentId?:string}
export type GovernanceInvoker=(request:GovernanceInvocation)=>Promise<{ok:boolean;verified:boolean;result?:unknown;error?:string}>;

const allowedOperations=new Set(["evaluate_action","get_approval","claim_approved_permit","consume_permit","list_open_loops","evaluate_recovery_action","list_proofs","get_proof","report_proof_observation","list_business_plans","get_business_plan","report_business_fact"]);

export function createGovernanceDispatcher(transport:GovernanceTransport,invoke:GovernanceInvoker):AgentStepDispatcher{
  return{async dispatch({task,step}:{task:AgentTask;step:AgentPlanStep}):Promise<AgentDispatchResult>{
    if((transport==="MCP"&&step.kind!=="MCP_GOVERNANCE")||(transport==="A2A"&&step.kind!=="A2A_GOVERNANCE"))throw new Error(`dispatcher_transport_mismatch:${transport}`);
    const operation=typeof step.metadata.operation==="string"?step.metadata.operation:"";
    if(!allowedOperations.has(operation))return{ok:false,observation:"UNKNOWN",error:"unsupported_governance_operation"};
    if(step.consequential&&!step.commitmentId)return{ok:false,observation:"UNKNOWN",error:"consequential_dispatch_requires_commitment"};
    const rawInput=typeof step.metadata.inputJson==="string"?step.metadata.inputJson:"{}";let input:Record<string,unknown>;
    try{const parsed=JSON.parse(rawInput);if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw new Error();input=parsed}catch{return{ok:false,observation:"UNKNOWN",error:"invalid_governance_input"}}
    const out=await invoke({taskId:task.id,stepId:step.id,operation,input,...(step.commitmentId?{commitmentId:step.commitmentId}:{})});
    return{ok:out.ok,observation:out.verified?out.ok?"PROVEN":"DISPROVEN":"UNKNOWN",...(out.result!==undefined?{result:out.result}:{}),...(out.error?{error:out.error}:{})};
  }};
}
