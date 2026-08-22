import type {
  LearningJobRequest,
  LearningJobResult,
  LearningProviderDescriptor,
  ProofObservationRequest,
  ProofProviderDescriptor,
  ProofProviderResult,
  ProviderHealth,
} from "@cieav/contracts";

export interface ProofProvider{
  readonly descriptor:ProofProviderDescriptor;
  health():Promise<ProviderHealth>;
  observe(request:ProofObservationRequest):Promise<ProofProviderResult>;
}

export interface LearningProvider{
  readonly descriptor:LearningProviderDescriptor;
  health():Promise<ProviderHealth>;
  run(request:LearningJobRequest):Promise<LearningJobResult>;
}

function sameProvider(expected:string,actual:string){
  if(expected!==actual)throw new Error(`provider_identity_mismatch:${expected}:${actual}`);
}

export class ProofProviderRegistry{
  private readonly providers=new Map<string,ProofProvider>();

  register(provider:ProofProvider){
    const descriptor=provider.descriptor;
    if(descriptor.authority!==false)throw new Error("proof_provider_must_have_zero_authority");
    if(this.providers.has(descriptor.id))throw new Error(`duplicate_proof_provider:${descriptor.id}`);
    this.providers.set(descriptor.id,provider);
  }

  get(id:string){return this.providers.get(id)??null}
  list(){return[...this.providers.values()].map(provider=>provider.descriptor).sort((a,b)=>a.id.localeCompare(b.id))}

  async health(){
    const results:ProviderHealth[]=[];
    for(const provider of this.providers.values()){
      const result=await provider.health();
      sameProvider(provider.descriptor.id,result.providerId);
      if(result.authority!==false)throw new Error("proof_provider_health_claimed_authority");
      results.push(result);
    }
    return results.sort((a,b)=>a.providerId.localeCompare(b.providerId));
  }

  async observe(request:ProofObservationRequest):Promise<ProofProviderResult>{
    const provider=this.providers.get(request.providerId);
    if(!provider)throw new Error(`proof_provider_not_found:${request.providerId}`);
    if(request.authority!==false)throw new Error("proof_request_must_have_zero_authority");
    const result=await provider.observe(request);
    sameProvider(provider.descriptor.id,result.provider.id);
    if(result.authority!==false||result.mayMintExecutionAuthority!==false)throw new Error("proof_provider_result_claimed_authority");
    return result;
  }
}

export class LearningProviderRegistry{
  private readonly providers=new Map<string,LearningProvider>();

  register(provider:LearningProvider){
    const descriptor=provider.descriptor;
    if(descriptor.authority!==false||descriptor.productionAuthority!==false)throw new Error("learning_provider_must_have_zero_authority");
    if(this.providers.has(descriptor.id))throw new Error(`duplicate_learning_provider:${descriptor.id}`);
    this.providers.set(descriptor.id,provider);
  }

  get(id:string){return this.providers.get(id)??null}
  list(){return[...this.providers.values()].map(provider=>provider.descriptor).sort((a,b)=>a.id.localeCompare(b.id))}

  async health(){
    const results:ProviderHealth[]=[];
    for(const provider of this.providers.values()){
      const result=await provider.health();
      sameProvider(provider.descriptor.id,result.providerId);
      if(result.authority!==false)throw new Error("learning_provider_health_claimed_authority");
      results.push(result);
    }
    return results.sort((a,b)=>a.providerId.localeCompare(b.providerId));
  }

  async run(request:LearningJobRequest):Promise<LearningJobResult>{
    const provider=this.providers.get(request.providerId);
    if(!provider)throw new Error(`learning_provider_not_found:${request.providerId}`);
    if(request.authority!==false||request.productionAuthority!==false||request.candidateMustRemainUnqualified!==true)throw new Error("learning_request_authority_invariant_violation");
    if(!provider.descriptor.methods.includes(request.method))throw new Error(`learning_method_not_supported:${request.method}`);
    const result=await provider.run(request);
    sameProvider(provider.descriptor.id,result.provider.id);
    if(result.authority!==false||result.productionAuthority!==false||result.candidateQualified!==false||result.promotionExecuted!==false)throw new Error("learning_provider_result_authority_invariant_violation");
    return result;
  }
}
