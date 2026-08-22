import {ConsequenceAbiResultSchema,ConsequenceDescriptorSchema,FrameworkConsequenceRequestSchema,type AgentFramework,type ConsequenceAbiResult,type ConsequenceSourceKind,type FrameworkConsequenceRequest} from "@cieav/contracts";

function sourceKind(framework:AgentFramework):ConsequenceSourceKind{if(framework==="MCP")return"MCP";if(framework==="A2A")return"A2A";return"CUSTOM"}
const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value as Record<string,unknown>).sort().map(key=>`${JSON.stringify(key)}:${canonical((value as Record<string,unknown>)[key])}`).join(",")}}`:JSON.stringify(value);

/** Normalize an already-canonical framework call into the universal consequence ABI. */
export function consequenceFromFrameworkCall(raw:FrameworkConsequenceRequest):ConsequenceAbiResult{
  const input=FrameworkConsequenceRequestSchema.parse(raw),call=input.call;
  if(input.principal.kind==="AGENT"&&input.principal.id!==call.agentId)throw new Error("consequence_principal_agent_mismatch");
  const descriptor=ConsequenceDescriptorSchema.parse({
    version:"CIEAV_CONSEQUENCE_ABI_V1",descriptorId:`${call.framework}:${call.frameworkRunId}:${call.id}`,
    source:{kind:sourceKind(call.framework),framework:call.framework,runId:call.frameworkRunId,callId:call.id,adapterManifestId:input.adapterManifestId},
    principal:input.principal,agentRef:call.agentId,...(input.modelRef?{modelRef:input.modelRef}:{}),objective:input.objective,resource:input.resource,...(input.worldBeforeDigest?{worldBeforeDigest:input.worldBeforeDigest}:{}),operation:call.operation,normalizedArgumentsDigest:call.normalizedArgumentsDigest,semanticEffect:call.semanticEffect,
    expectedEffects:input.expectedEffects,authorityRequired:input.authorityRequired,safetyConstraints:input.safetyConstraints,proofObligations:input.proofObligations,duplicateSemantics:input.duplicateSemantics,reversibility:input.reversibility,uncertaintyPolicy:input.uncertaintyPolicy,continuationConditions:input.continuationConditions,recoveryContract:input.recoveryContract,risk:input.risk,createdAt:call.occurredAt,authority:false,mayMintExecutionAuthority:false,
  });
  return ConsequenceAbiResultSchema.parse({descriptor,executionAuthorityIssued:false,authority:false,mayMintExecutionAuthority:false});
}

export function sameConsequenceDecisionContext(a:Pick<ReturnType<typeof consequenceFromFrameworkCall>["descriptor"],"operation"|"normalizedArgumentsDigest"|"worldBeforeDigest"|"resource"|"semanticEffect">,b:Pick<ReturnType<typeof consequenceFromFrameworkCall>["descriptor"],"operation"|"normalizedArgumentsDigest"|"worldBeforeDigest"|"resource"|"semanticEffect">){return a.operation===b.operation&&a.normalizedArgumentsDigest===b.normalizedArgumentsDigest&&(a.worldBeforeDigest??null)===(b.worldBeforeDigest??null)&&a.resource===b.resource&&canonical(a.semanticEffect)===canonical(b.semanticEffect)}

export const CONSEQUENCE_ABI_AUTHORITY=false as const;
export const CONSEQUENCE_ABI_MAY_MINT_EXECUTION_AUTHORITY=false as const;
