import crypto from "node:crypto";
import type {AgentDispatchReceipt,AgentPlanStep,AgentTask,Commitment,ToolCatalog} from "@cieav/contracts";
import {buildEffectProposal,consequenceGraphDigest,proofObligationDigest} from "@cieav/core";
import type {AgentStepDispatcher} from "./agent-runtime.js";
import {CieavEffectAuthority} from "./effect-authority.js";
import {CieavEffectDispatcher} from "./effect-dispatch.js";

export interface GovernedToolDispatchOptions {catalog:()=>Promise<ToolCatalog>;commitment:(id:string)=>Promise<Commitment|null>;authority:CieavEffectAuthority;effects:CieavEffectDispatcher}
const transport=(provider:string):AgentDispatchReceipt["transport"]=>provider==="EFFECT_NODE"?"NODE":provider==="BROWSER"?"BROWSER":provider==="MCP"?"MCP":provider==="A2A"?"A2A":"LOCAL";

export function createGovernedToolStepDispatcher(options:GovernedToolDispatchOptions):AgentStepDispatcher{
  return{async dispatch({task,step}:{task:AgentTask;step:AgentPlanStep}){
    if(step.kind!=="TOOL")return{ok:false,observation:"DISPROVEN" as const,error:"governed tool dispatcher requires TOOL step"};
    if(!step.consequential||!step.commitmentId)return{ok:false,observation:"UNKNOWN" as const,error:"TOOL step has no bound Commitment authority"};
    const toolId=typeof step.metadata.toolId==="string"?step.metadata.toolId:null,inputJson=typeof step.metadata.inputJson==="string"?step.metadata.inputJson:null;if(!toolId||!inputJson)return{ok:false,observation:"DISPROVEN" as const,error:"TOOL step metadata is incomplete"};
    let input:unknown;try{input=JSON.parse(inputJson)}catch{return{ok:false,observation:"DISPROVEN" as const,error:"TOOL inputJson is invalid JSON"}}
    const [catalog,commitment]=await Promise.all([options.catalog(),options.commitment(step.commitmentId)]);if(!commitment)return{ok:false,observation:"UNKNOWN" as const,error:"Bound Commitment could not be resolved"};const tool=catalog.tools.find(t=>t.id===toolId);if(!tool)return{ok:false,observation:"UNKNOWN" as const,error:"Selected tool is no longer present in the governed catalog"};
    const proposal=buildEffectProposal({version:1,requestId:crypto.randomUUID(),taskId:task.id,stepId:step.id,commitmentId:commitment.id,toolId:tool.id,provider:tool.provider,sourceId:tool.sourceId,sourceOperation:tool.sourceOperation,actionType:step.actionType??`tool.${tool.sourceOperation}`,...(step.target?{target:step.target}:{}),input,catalogDigest:catalog.catalogDigest,consequenceGraphDigest:consequenceGraphDigest(commitment),proofObligationDigest:proofObligationDigest(commitment),createdAt:new Date().toISOString()}),authorization=await options.authority.issue(commitment,proposal),result=await options.effects.dispatch({proposal,authorization,commitment,catalog}),status=result.settlement.status;
    return{ok:status==="PROVEN",observation:status,result:{effectReceiptId:result.receipt.id,settlement:status,proposalDigest:result.receipt.proposalDigest},transport:transport(tool.provider),...(status==="PROVEN"?{}:{error:result.settlement.reason})};
  }}
}
