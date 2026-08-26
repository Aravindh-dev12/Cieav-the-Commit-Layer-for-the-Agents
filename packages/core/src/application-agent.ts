import {
  ApplicationAgentDecisionSchema,
  ApplicationAgentRequestSchema,
  ApplicationModelInvocationRequestSchema,
  ApplicationModelInvocationResultSchema,
  ApplicationModelProviderDescriptorSchema,
  ApplicationModelProviderHealthSchema,
  type ApplicationAgentDecision,
  type ApplicationAgentRequest,
  type ApplicationModelInvocationRequest,
  type ApplicationModelInvocationResult,
  type ApplicationModelProviderDescriptor,
  type ApplicationModelProviderHealth,
} from "@cieav/contracts";

export interface ApplicationModelProvider{
  readonly descriptor:ApplicationModelProviderDescriptor;
  health():Promise<ApplicationModelProviderHealth>;
  invoke(request:ApplicationModelInvocationRequest):Promise<ApplicationModelInvocationResult>;
}

const privacyRank={LOCAL_ONLY:0,REDACTED_REMOTE_ALLOWED:1,REMOTE_ALLOWED:2} as const;

function assertProviderIdentity(expected:string,actual:string){
  if(expected!==actual)throw new Error(`application_model_provider_identity_mismatch:${expected}:${actual}`);
}

function assertPrivacyAllowed(provider:ApplicationModelProviderDescriptor,request:ApplicationAgentRequest){
  const maxContextPrivacy=request.context.reduce((rank,item)=>Math.max(rank,privacyRank[item.privacy]),0);
  if(provider.local)return;
  if(provider.privacyBoundary==="LOCAL_ONLY")throw new Error("remote_application_model_provider_declared_local_only_boundary");
  if(maxContextPrivacy>privacyRank[provider.privacyBoundary])throw new Error(`application_model_privacy_boundary_exceeded:${provider.id}`);
  if(request.context.some(item=>item.privacy==="LOCAL_ONLY"))throw new Error(`application_model_local_only_context_rejected:${provider.id}`);
}

export class ApplicationModelProviderRegistry{
  private readonly providers=new Map<string,ApplicationModelProvider>();

  register(provider:ApplicationModelProvider){
    const descriptor=ApplicationModelProviderDescriptorSchema.parse(provider.descriptor);
    if(descriptor.authority!==false||descriptor.mayMintExecutionAuthority!==false)throw new Error("application_model_provider_must_have_zero_authority");
    if(this.providers.has(descriptor.id))throw new Error(`duplicate_application_model_provider:${descriptor.id}`);
    this.providers.set(descriptor.id,provider);
  }

  get(id:string){return this.providers.get(id)??null}
  list(){return[...this.providers.values()].map(provider=>ApplicationModelProviderDescriptorSchema.parse(provider.descriptor)).sort((a,b)=>a.id.localeCompare(b.id))}

  async health(){
    const results:ApplicationModelProviderHealth[]=[];
    for(const provider of this.providers.values()){
      const health=ApplicationModelProviderHealthSchema.parse(await provider.health());
      assertProviderIdentity(provider.descriptor.id,health.providerId);
      if(health.authority!==false)throw new Error("application_model_provider_health_claimed_authority");
      results.push(health);
    }
    return results.sort((a,b)=>a.providerId.localeCompare(b.providerId));
  }

  async invoke(request:ApplicationModelInvocationRequest){
    const input=ApplicationModelInvocationRequestSchema.parse(request),provider=this.providers.get(input.providerId);
    if(!provider)throw new Error(`application_model_provider_not_found:${input.providerId}`);
    if(!provider.descriptor.models.includes(input.modelId))throw new Error(`application_model_not_supported:${input.providerId}:${input.modelId}`);
    const result=ApplicationModelInvocationResultSchema.parse(await provider.invoke(input));
    assertProviderIdentity(provider.descriptor.id,result.providerId);
    if(result.requestId!==input.requestId)throw new Error("application_model_request_identity_mismatch");
    if(result.modelId!==input.modelId)throw new Error("application_model_result_model_mismatch");
    if(result.authority!==false||result.mayMintExecutionAuthority!==false)throw new Error("application_model_result_claimed_authority");
    return result;
  }
}

export class CieavApplicationAgentRuntime{
  constructor(readonly providers:ApplicationModelProviderRegistry=new ApplicationModelProviderRegistry()){}

  async run(raw:ApplicationAgentRequest):Promise<ApplicationAgentDecision>{
    const request=ApplicationAgentRequestSchema.parse(raw),provider=this.providers.get(request.providerId);
    if(!provider)throw new Error(`application_model_provider_not_found:${request.providerId}`);
    assertPrivacyAllowed(provider.descriptor,request);
    const allowed=new Map(request.tools.map(tool=>[tool.id,new Set(tool.operations)]));
    const modelRequest=ApplicationModelInvocationRequestSchema.parse({
      requestId:request.requestId,
      providerId:request.providerId,
      modelId:request.modelId,
      purpose:request.purpose,
      objective:request.objective,
      context:request.context,
      tools:request.tools,
      maxLatencyMs:request.maxLatencyMs,
      ...(request.maxCostUsd===undefined?{}:{maxCostUsd:request.maxCostUsd}),
      authority:false,
      mayMintExecutionAuthority:false,
    });
    const result=await this.providers.invoke(modelRequest);
    for(const proposal of result.toolProposals){
      const operations=allowed.get(proposal.toolId);
      if(!operations||!operations.has(proposal.operation))throw new Error(`application_model_proposed_unavailable_tool:${proposal.toolId}:${proposal.operation}`);
      if(proposal.authority!==false||proposal.mayMintExecutionAuthority!==false)throw new Error("application_tool_proposal_claimed_authority");
    }
    const hasEffects=result.toolProposals.some(proposal=>{
      const tool=request.tools.find(item=>item.id===proposal.toolId);
      return Boolean(tool&&!tool.readOnly);
    });
    const requiresApproval=hasEffects&&request.requireHumanApprovalForEffects;
    const kind=result.toolProposals.length?"PROPOSAL":result.text||result.structured?"ANSWER":"NEEDS_CONTEXT";
    return ApplicationAgentDecisionSchema.parse({
      requestId:request.requestId,
      domain:request.domain,
      kind,
      ...(result.text===undefined?{}:{text:result.text}),
      toolProposals:result.toolProposals,
      evidenceRefs:result.evidenceRefs,
      requiresApproval,
      modelProviderId:result.providerId,
      modelId:result.modelId,
      authority:false,
      mayMintExecutionAuthority:false,
      executionAuthorityIssued:false,
    });
  }
}

export const APPLICATION_AGENT_AUTHORITY=false as const;
export const APPLICATION_AGENT_MAY_MINT_EXECUTION_AUTHORITY=false as const;
