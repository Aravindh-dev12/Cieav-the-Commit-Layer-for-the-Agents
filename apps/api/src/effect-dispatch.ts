import type {CommitCapability,Commitment,EffectObservation,EffectProposal,EffectReceipt,EffectSettlement,ToolCatalog,ToolDescriptor} from "@cieav/contracts";
import {assertCommitCapabilityBinding,assertEffectToolBinding,settleEffect,sha256Digest} from "@cieav/core";
import {CieavEffectDispatchStore} from "./effect-dispatch-store.js";

export interface EffectExecutionResult {ok:boolean;definitiveFailure?:boolean;result?:unknown;errorClass?:string;error?:string}
export interface EffectExecutionAdapter {execute(input:{proposal:EffectProposal;tool:ToolDescriptor}):Promise<EffectExecutionResult>}
export interface EffectObserver {observe(input:{proposal:EffectProposal;tool:ToolDescriptor;receipt:EffectReceipt;commitment:Commitment}):Promise<EffectObservation[]>}
export type EffectAdapterRegistry=Partial<Record<ToolDescriptor["provider"],EffectExecutionAdapter>>;

export class CieavEffectDispatcher{
  constructor(private readonly store:CieavEffectDispatchStore,private readonly adapters:EffectAdapterRegistry,private readonly observers:readonly EffectObserver[]=[]){ }

  async recoverOnStartup(){return this.store.recoverReserved()}

  async dispatch(input:{proposal:EffectProposal;capability:CommitCapability;commitment:Commitment;catalog:ToolCatalog}):Promise<{receipt:EffectReceipt;settlement:EffectSettlement;observations:EffectObservation[]}>{
    const {proposal,capability,commitment,catalog}=input,tool=catalog.tools.find(t=>t.id===proposal.toolId);
    if(!tool)throw new Error("effect_tool_not_in_catalog");
    if(catalog.executionAuthority!==false)throw new Error("invalid tool catalog authority flag");
    assertEffectToolBinding(proposal,tool,catalog.catalogDigest);
    assertCommitCapabilityBinding(capability,proposal,commitment);
    let receipt=await this.store.reserve(capability,proposal);
    const adapter=this.adapters[tool.provider];
    if(!adapter){receipt=await this.store.complete(proposal.requestId,{status:"UNKNOWN",errorClass:"adapter_unavailable",error:`No effect adapter is registered for provider ${tool.provider}.`});return this.settle(commitment,proposal,tool,receipt)}
    let result:EffectExecutionResult;
    try{result=await adapter.execute({proposal,tool})}catch(error){result={ok:false,definitiveFailure:false,errorClass:"adapter_exception",error:error instanceof Error?error.message:String(error)}}
    if(result.ok)receipt=await this.store.complete(proposal.requestId,{status:"CLAIMED_COMPLETE",...(result.result!==undefined?{resultDigest:sha256Digest(result.result)}:{})});
    else receipt=await this.store.complete(proposal.requestId,{status:result.definitiveFailure?"FAILED":"UNKNOWN",...(result.result!==undefined?{resultDigest:sha256Digest(result.result)}:{}),...(result.errorClass?{errorClass:result.errorClass}:{}),...(result.error?{error:result.error.slice(0,1000)}:{})});
    return this.settle(commitment,proposal,tool,receipt);
  }

  private async settle(commitment:Commitment,proposal:EffectProposal,tool:ToolDescriptor,receipt:EffectReceipt){
    const observations:EffectObservation[]=[];
    if(receipt.status==="CLAIMED_COMPLETE"||receipt.status==="FAILED")for(const observer of this.observers){try{const found=await observer.observe({proposal,tool,receipt,commitment});for(const item of found)if(item.requestId===proposal.requestId&&item.commitmentId===commitment.id)observations.push(item)}catch{/* observer failure leaves proof missing => UNKNOWN */}}
    const settlement=settleEffect(commitment,receipt,observations);
    return{receipt,settlement,observations};
  }
}
