import crypto from "node:crypto";
import {
  FrameworkAdapterManifestSchema,FrameworkBindingSchema,FrameworkInteropAssessmentSchema,FrameworkToolCallSchema,
  type FrameworkAdapterManifest,type FrameworkBinding,type FrameworkInteropAssessment,type FrameworkToolCall
} from "@cieav/contracts/framework-interop";
import {digest} from "./execution-fabric.js";

export function frameworkCallDigest(call:FrameworkToolCall){
  return digest(FrameworkToolCallSchema.parse(call));
}

export function assessFrameworkAdapter(raw:FrameworkAdapterManifest,at=new Date().toISOString()):FrameworkInteropAssessment{
  const manifest=FrameworkAdapterManifestSchema.parse(raw),reasons:string[]=[],requirements:string[]=[];
  if(manifest.telemetryOnly)reasons.push("Telemetry-only integrations cannot enforce consequence routing.");
  if(manifest.consequenceCoverage!=="COMPLETE")reasons.push(`Consequence coverage is ${manifest.consequenceCoverage}; mandatory routing requires COMPLETE coverage.`);
  if(manifest.directExecutionPossible)reasons.push("Framework can still execute a consequential tool directly outside CIEAV.");
  if(manifest.agentCanSeeCredentials)reasons.push("Agent-visible downstream credentials create a bypass path.");
  if(manifest.hostedToolsCanBypass)reasons.push("Hosted/provider-managed tools can execute outside the CIEAV router.");
  if(!manifest.canReplaceToolExecution)reasons.push("Adapter cannot replace native tool execution with the CIEAV trusted route.");
  if(!manifest.failClosedOnAdapterError)reasons.push("Adapter errors do not fail closed.");
  if(manifest.mode!=="MANDATORY_PROXY")reasons.push(`Adapter mode ${manifest.mode} does not claim mandatory proxying.`);
  if(manifest.supportsResumeReplay)requirements.push("Framework call IDs and semantic-effect IDs must remain stable across resume/replay; pre-interrupt side effects must not execute outside CIEAV.");
  if(manifest.supportsParallelCalls)requirements.push("Each parallel tool call requires an independent CIEAV binding, budget check, mandate and one-use ticket.");
  if(manifest.supportsDelegation)requirements.push("Delegated agents must receive attenuated authority; child authority may never exceed the parent envelope.");
  requirements.push("Framework completion/result messages are observations only; CIEAV Proof Mesh independently settles the real-world consequence.");
  requirements.push("Consequential credentials must stay behind CIEAV or a downstream provider exchange that is equivalently scoped and non-exportable to the model.");
  const mandatoryEligible=reasons.length===0;
  const base={version:1 as const,manifestId:manifest.id,framework:manifest.framework,requestedMode:manifest.mode,mandatoryEligible,reasons,requirements,assessedAt:at};
  return FrameworkInteropAssessmentSchema.parse({...base,digest:digest(base)});
}

export function createFrameworkBinding(input:{call:FrameworkToolCall;agentTaskId:string;intentId:string;effectKey:string;adapterManifestId:string;mode:FrameworkAdapterManifest["mode"];boundAt?:string}):FrameworkBinding{
  const call=FrameworkToolCallSchema.parse(input.call),boundAt=input.boundAt??new Date().toISOString(),callDigest=frameworkCallDigest(call);
  const base={version:1 as const,frameworkCallId:call.id,frameworkCallDigest:callDigest,framework:call.framework,agentTaskId:input.agentTaskId,intentId:input.intentId,effectKey:input.effectKey,adapterManifestId:input.adapterManifestId,mode:input.mode,boundAt,status:"BOUND" as const};
  return FrameworkBindingSchema.parse({...base,id:crypto.randomUUID(),bindingDigest:digest(base)});
}

export function routeFrameworkBinding(binding:FrameworkBinding,input:{executionTicketId:string;operationMandateId?:string}):FrameworkBinding{
  if(binding.status!=="BOUND")throw new Error("framework_binding_not_routable");
  if(binding.mode==="MANDATORY_PROXY"&&!input.operationMandateId)throw new Error("mandatory_framework_binding_requires_operation_mandate");
  return FrameworkBindingSchema.parse({...binding,status:"ROUTED",executionTicketId:input.executionTicketId,...(input.operationMandateId?{operationMandateId:input.operationMandateId}:{})});
}

export function settleFrameworkBinding(binding:FrameworkBinding,settlement:"PROVEN"|"DISPROVEN"|"UNKNOWN"):FrameworkBinding{
  if(binding.status!=="ROUTED")throw new Error("framework_binding_not_settleable");
  return FrameworkBindingSchema.parse({...binding,status:"SETTLED",settlement});
}

export function frameworkAdapterPresets():FrameworkAdapterManifest[]{
  const common={version:1 as const,adapterVersion:"cieav-interop-v1",runtimeVersion:undefined,consequenceCoverage:"PARTIAL" as const,directExecutionPossible:true,agentCanSeeCredentials:false,hostedToolsCanBypass:false,canReplaceToolExecution:true,supportsParallelCalls:true,supportsResumeReplay:false,supportsDelegation:false,externalCompletionIsProof:false,telemetryOnly:false,failClosedOnAdapterError:true,evidenceRefs:[],notes:[]};
  return [
    {...common,id:"cieav.mcp.proxy",framework:"MCP",mode:"GOVERNED_PROXY",hookSurfaces:["MCP_PROXY"],supportsDelegation:true,notes:["Use CIEAV as the downstream MCP proxy; ordinary MCP server registration alone is not mandatory interposition."]},
    {...common,id:"cieav.a2a.gateway",framework:"A2A",mode:"GOVERNED_PROXY",hookSurfaces:["A2A_GATEWAY"],supportsDelegation:true,notes:["Bind A2A task/context IDs to CIEAV tasks; remote task completion is not proof of consequence."]},
    {...common,id:"cieav.langgraph.middleware",framework:"LANGGRAPH",mode:"GOVERNED_PROXY",hookSurfaces:["WRAP_TOOL","INTERRUPT_RESUME","TASK_STATE"],supportsResumeReplay:true,notes:["LangGraph node replay requires stable CIEAV effect identity and no direct pre-interrupt side effects."]},
    {...common,id:"cieav.langchain.middleware",framework:"LANGCHAIN",mode:"GOVERNED_PROXY",hookSurfaces:["WRAP_TOOL","BEFORE_TOOL","AFTER_TOOL"],notes:["Middleware is a proposal/interception surface; consequence execution should still terminate in the CIEAV trusted router."]},
    {...common,id:"cieav.agno.tool-hook",framework:"AGNO",mode:"GOVERNED_PROXY",hookSurfaces:["BEFORE_TOOL","AFTER_TOOL","CALLBACK"],supportsDelegation:true,notes:["Tool hooks can gate agent/team calls but must delegate actual consequential execution to CIEAV."]},
    {...common,id:"cieav.openai-agents.guardrail",framework:"OPENAI_AGENTS",mode:"GOVERNED_PROXY",hookSurfaces:["BEFORE_TOOL","AFTER_TOOL"],hostedToolsCanBypass:true,notes:["Hosted tools need separate coverage; function-tool guardrails alone do not establish universal interception."]},
    {...common,id:"cieav.autogen.workbench",framework:"AUTOGEN",mode:"GOVERNED_PROXY",hookSurfaces:["WORKBENCH_CALL"],supportsDelegation:true,notes:["Wrap Workbench.call_tool and remove alternate direct consequence paths for mandatory mode."]},
    {...common,id:"cieav.crewai.hooks",framework:"CREWAI",mode:"GOVERNED_PROXY",hookSurfaces:["BEFORE_TOOL","AFTER_TOOL"],supportsDelegation:true},
    {...common,id:"cieav.semantic-kernel.filter",framework:"SEMANTIC_KERNEL",mode:"GOVERNED_PROXY",hookSurfaces:["FUNCTION_FILTER"],supportsDelegation:true},
    {...common,id:"cieav.llamaindex.tool-proxy",framework:"LLAMAINDEX",mode:"GOVERNED_PROXY",hookSurfaces:["TOOLSET_PROXY"],supportsDelegation:true},
    {...common,id:"cieav.pydantic-ai.deferred",framework:"PYDANTIC_AI",mode:"GOVERNED_PROXY",hookSurfaces:["DEFERRED_TOOL","TOOLSET_PROXY"],notes:["Deferred approval is workflow state, not an authorization boundary; execute approved calls only through CIEAV."]},
    {...common,id:"cieav.google-adk.callback",framework:"GOOGLE_ADK",mode:"GOVERNED_PROXY",hookSurfaces:["BEFORE_TOOL","AFTER_TOOL","CALLBACK"],supportsDelegation:true},
    {...common,id:"cieav.claude-agent-sdk.pretool",framework:"CLAUDE_AGENT_SDK",mode:"GOVERNED_PROXY",hookSurfaces:["PRE_TOOL_USE"],notes:["PreToolUse can veto/modify calls; keep credentials and real side effects behind CIEAV."]},
    {...common,id:"cieav.dspy.tools",framework:"DSPY",mode:"GOVERNED_PROXY",hookSurfaces:["MANUAL_DISPATCH"],notes:["Supply CIEAV-backed tools to ReAct rather than raw consequence-capable functions."]},
    {...common,id:"cieav.langfuse.otel",framework:"LANGFUSE",mode:"OBSERVE",hookSurfaces:["OTEL_TRACE"],consequenceCoverage:"NONE",directExecutionPossible:false,canReplaceToolExecution:false,telemetryOnly:true,notes:["Observability only. Trace export is not execution authority or proof."]},
    {...common,id:"cieav.temporal.activity-boundary",framework:"TEMPORAL",mode:"GOVERNED_PROXY",hookSurfaces:["TASK_STATE","MANUAL_DISPATCH"],supportsResumeReplay:true,notes:["Activities that create side effects must use stable CIEAV effect identity to survive retries safely."]},
    {...common,id:"cieav.n8n.tool-boundary",framework:"N8N",mode:"GOVERNED_PROXY",hookSurfaces:["MANUAL_DISPATCH","CALLBACK"],notes:["Workflow nodes that can write externally must be replaced with CIEAV-governed connectors for mandatory mode."]}
  ].map(x=>FrameworkAdapterManifestSchema.parse(x));
}
