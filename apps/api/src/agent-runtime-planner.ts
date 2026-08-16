import {z} from "zod";
import type {AgentModelFabricPlanner,ModelFabricPlanOutput} from "./agent-runtime.js";

const PlannedStepSchema=z.object({id:z.string().min(1).max(160),kind:z.enum(["MODEL","MCP_GOVERNANCE","A2A_GOVERNANCE","WAIT","OBSERVE"]),summary:z.string().min(1).max(1200),actionType:z.string().min(1).max(200).optional(),target:z.string().min(1).max(1000).optional(),consequential:z.boolean(),metadata:z.record(z.union([z.string().max(4000),z.number(),z.boolean(),z.null()])).default({})}).strict();
const ResponseSchema=z.object({steps:z.array(PlannedStepSchema).min(1).max(200)}).strict();

export interface StructuredModelFabricClient {
  inferPlan(input:{taskId:string;goal:string;metadata:Record<string,string|number|boolean|null>;systemPolicy:string}):Promise<{provider:string;model:string;protocolVersion:string;output:unknown}>;
}

export function createModelFabricPlanner(client:StructuredModelFabricClient):AgentModelFabricPlanner{
  return{async plan(input):Promise<ModelFabricPlanOutput>{
    const response=await client.inferPlan({taskId:input.taskId,goal:input.goal,metadata:input.metadata,systemPolicy:"Return a bounded CIEAV plan only. You have no execution authority. Mark every step that could change external state, communicate externally, transfer value, alter access, publish, delete, deploy, or execute code as consequential=true. Use MCP_GOVERNANCE or A2A_GOVERNANCE only for CIEAV governance operations. Never include secrets, credentials, OTPs, card values, raw form data, or capabilities."});
    const parsed=ResponseSchema.parse(response.output);
    return{provider:response.provider,model:response.model,protocolVersion:response.protocolVersion,steps:parsed.steps.map((step,index)=>({...step,sequence:index+1}))};
  }};
}
