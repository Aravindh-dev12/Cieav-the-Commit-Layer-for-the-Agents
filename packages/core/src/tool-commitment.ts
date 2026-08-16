import crypto from "node:crypto";
import type {AgentPlanStep,AgentTask,Commitment,RiskLevel,ToolConsequence,ToolDescriptor} from "@cieav/contracts";

const rank:Record<RiskLevel,number>={LOW:0,MEDIUM:1,HIGH:2,CRITICAL:3};
const riskFor=(c:ToolConsequence):RiskLevel=>c==="READ"?"LOW":c==="CREATE"||c==="UPDATE"||c==="COMMUNICATE"||c==="EXECUTE_CODE"?"MEDIUM":c==="DELETE"||c==="PUBLISH"||c==="SHARE"||c==="DEPLOY"||c==="GRANT_ACCESS"||c==="REVOKE_ACCESS"?"HIGH":"CRITICAL";
const aggregateRisk=(tool:ToolDescriptor):RiskLevel=>tool.consequences.reduce<RiskLevel>((a,c)=>rank[riskFor(c)]>rank[a]?riskFor(c):a,tool.externalEffect?"MEDIUM":"LOW");

export function buildToolCommitment(task:AgentTask,step:AgentPlanStep,tool:ToolDescriptor,now=new Date()):Commitment{
  if(step.kind!=="TOOL"||typeof step.metadata.toolId!=="string"||step.metadata.toolId!==tool.id)throw new Error("tool commitment requires an exact TOOL step binding");
  const consequence=tool.consequences[0]??"OTHER",requirements:Commitment["proofObligation"]["requirements"]=[];
  if(tool.provider==="EFFECT_NODE"&&String(tool.metadata.capabilityKind??"")==="FILESYSTEM")requirements.push({id:"filesystem-readback",kind:"FILESYSTEM",description:"Independently read back the affected filesystem path after execution.",required:true,minimumConfidence:.9,independentOfActor:true});
  else if(tool.provider==="EFFECT_NODE"&&String(tool.metadata.capabilityKind??"")==="PROCESS")requirements.push({id:"process-result",kind:"TOOL_RESULT",description:"Observe the exact bounded process exit result recorded by CIEAV.",required:true,minimumConfidence:1,independentOfActor:true});
  else requirements.push({id:"external-readback",kind:"API_READBACK",description:"Independently read back the externally affected resource after execution.",required:true,minimumConfidence:.9,independentOfActor:true});
  const risk=aggregateRisk(tool),reversibility=consequence==="READ"?"REVERSIBLE" as const:"UNKNOWN" as const;
  return{id:crypto.randomUUID(),version:1,owner:task.owner,actor:task.actor,authoritySource:"CIEAV_LOCAL_GATEWAY",summary:step.summary,desiredState:`The effect requested by agent task ${task.id} step ${step.id} is independently observed as completed.`,createdAt:now.toISOString(),...(task.deadlineAt?{expectedBy:task.deadlineAt}:{}),state:"PROPOSED",risk,consequenceGraph:{version:1,nodes:[{id:"tool-effect",kind:consequence,summary:step.summary,...(step.target?{target:step.target}:{}),affectedEntities:step.target?[step.target]:[],dataCategories:[],risk,reversibility,external:tool.externalEffect,dependsOn:[]}]},proofObligation:{version:1,requirements,forbiddenShortcuts:["Model self-report cannot prove completion.","Dispatch acknowledgement cannot prove desired reality.","A consumed capability cannot be replayed for recovery."]},recovery:{kind:tool.readOnly?"NONE":"ESCALATE",requiresAuthorization:true,instructions:tool.readOnly?[]:["Re-observe reality before proposing retry, undo, or compensation."]},metadata:{taskId:task.id,stepId:step.id,toolId:tool.id,provider:tool.provider,sourceId:tool.sourceId,sourceOperation:tool.sourceOperation}}
}
