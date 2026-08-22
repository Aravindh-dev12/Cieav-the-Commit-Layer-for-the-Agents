import {describe,expect,it} from "vitest";
import type {LearningProvider,ProofProvider} from "./provider-runtime.js";
import {LearningProviderRegistry,ProofProviderRegistry} from "./provider-runtime.js";

const now="2026-08-22T11:00:00.000Z";

describe("ProofProviderRegistry",()=>{
  it("routes observations through a zero-authority provider",async()=>{
    const provider:ProofProvider={
      descriptor:{id:"proof.test",version:"1",evidenceKinds:["API"],canObservePreState:true,canObservePostState:true,canSettleOutcome:false,authority:false},
      health:async()=>({ok:true,providerId:"proof.test",checkedAt:now,authority:false}),
      observe:async request=>({provider:{id:"proof.test",version:"1",evidenceKinds:["API"],canObservePreState:true,canObservePostState:true,canSettleOutcome:false,authority:false},requestId:request.requestId,observations:[{kind:"API",source:"test",observedAt:now,summary:"Observed target state",confidence:1}],proposedOutcome:"SUCCESS",conclusive:false,authority:false,mayMintExecutionAuthority:false}),
    };
    const registry=new ProofProviderRegistry();registry.register(provider);
    const result=await registry.observe({requestId:"request-12345678",providerId:"proof.test",operation:"deploy.release",phase:"POST_STATE",targetRef:"deployment:42",expectedState:["healthy"],correlationRefs:[],timeoutMs:1000,authority:false});
    expect(result.proposedOutcome).toBe("SUCCESS");
    expect(result.authority).toBe(false);
    expect(result.mayMintExecutionAuthority).toBe(false);
  });

  it("fails closed on provider identity mismatch",async()=>{
    const provider:ProofProvider={descriptor:{id:"proof.expected",version:"1",evidenceKinds:["API"],canObservePreState:true,canObservePostState:true,canSettleOutcome:false,authority:false},health:async()=>({ok:true,providerId:"proof.other",checkedAt:now,authority:false}),observe:async request=>({provider:{id:"proof.expected",version:"1",evidenceKinds:["API"],canObservePreState:true,canObservePostState:true,canSettleOutcome:false,authority:false},requestId:request.requestId,observations:[],conclusive:false,authority:false,mayMintExecutionAuthority:false})};
    const registry=new ProofProviderRegistry();registry.register(provider);
    await expect(registry.health()).rejects.toThrow(/provider_identity_mismatch/);
  });
});

describe("LearningProviderRegistry",()=>{
  it("keeps successful training artifacts unqualified",async()=>{
    const provider:LearningProvider={
      descriptor:{id:"learning.test",version:"1",methods:["SFT","GRPO"],local:true,authority:false,productionAuthority:false},
      health:async()=>({ok:true,providerId:"learning.test",checkedAt:now,authority:false}),
      run:async request=>({provider:{id:"learning.test",version:"1",methods:["SFT","GRPO"],local:true,authority:false,productionAuthority:false},jobId:request.jobId,status:"SUCCEEDED_UNQUALIFIED",artifacts:[{kind:"ADAPTER",uri:"file://candidate",digest:"a".repeat(64)}],metrics:{loss:.2},candidateQualified:false,promotionExecuted:false,authority:false,productionAuthority:false}),
    };
    const registry=new LearningProviderRegistry();registry.register(provider);
    const result=await registry.run({jobId:"learning-job-123",providerId:"learning.test",method:"SFT",dataset:{kind:"DATASET",uri:"file://dataset",digest:"b".repeat(64)},baseModel:"cieav-core",outputScope:"candidate",qualificationProfile:"held-out-v1",candidateMustRemainUnqualified:true,authority:false,productionAuthority:false});
    expect(result.status).toBe("SUCCEEDED_UNQUALIFIED");
    expect(result.candidateQualified).toBe(false);
    expect(result.promotionExecuted).toBe(false);
    expect(result.productionAuthority).toBe(false);
  });

  it("rejects unsupported learning methods before provider execution",async()=>{
    let called=false;
    const provider:LearningProvider={descriptor:{id:"learning.sft",version:"1",methods:["SFT"],local:true,authority:false,productionAuthority:false},health:async()=>({ok:true,providerId:"learning.sft",checkedAt:now,authority:false}),run:async request=>{called=true;return{provider:{id:"learning.sft",version:"1",methods:["SFT"],local:true,authority:false,productionAuthority:false},jobId:request.jobId,status:"FAILED",artifacts:[],metrics:{},candidateQualified:false,promotionExecuted:false,authority:false,productionAuthority:false}}};
    const registry=new LearningProviderRegistry();registry.register(provider);
    await expect(registry.run({jobId:"learning-job-456",providerId:"learning.sft",method:"GRPO",dataset:{kind:"DATASET",uri:"file://dataset",digest:"c".repeat(64)},outputScope:"candidate",qualificationProfile:"held-out-v1",candidateMustRemainUnqualified:true,authority:false,productionAuthority:false})).rejects.toThrow(/learning_method_not_supported/);
    expect(called).toBe(false);
  });
});
