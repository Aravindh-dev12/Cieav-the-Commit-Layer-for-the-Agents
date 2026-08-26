import {describe,expect,it} from "vitest";
import type {ApplicationModelProvider} from "./application-agent.js";
import {ApplicationModelProviderRegistry,CieavApplicationAgentRuntime} from "./application-agent.js";

function provider(overrides:Partial<ApplicationModelProvider>={}):ApplicationModelProvider{
  return{
    descriptor:{version:"CIEAV_APPLICATION_MODEL_PROVIDER_V1",id:"remote",kind:"EXTERNAL_API",models:["reasoner"],local:false,privacyBoundary:"REDACTED_REMOTE_ALLOWED",capabilities:["reasoning"],authority:false,mayMintExecutionAuthority:false},
    async health(){return{ok:true,providerId:"remote",checkedAt:new Date().toISOString(),authority:false}},
    async invoke(request){return{requestId:request.requestId,providerId:"remote",modelId:request.modelId,text:"proposed",toolProposals:[{toolId:"ledger",operation:"draft",normalizedArgumentsDigest:"a".repeat(64),summary:"Draft a journal entry",confidence:.9,authority:false,mayMintExecutionAuthority:false}],evidenceRefs:["ledger:period:2026-08"],usage:{},authority:false,mayMintExecutionAuthority:false}},
    ...overrides,
  };
}

describe("application agent runtime",()=>{
  it("turns effectful model output into a non-authoritative approval proposal",async()=>{
    const registry=new ApplicationModelProviderRegistry();registry.register(provider());
    const runtime=new CieavApplicationAgentRuntime(registry);
    const decision=await runtime.run({requestId:"req-12345678",domain:"accounting",objective:"Prepare the accrual",providerId:"remote",modelId:"reasoner",context:[{kind:"FACT",sourceRef:"ledger:period:2026-08",summary:"Insurance prepaid balance is 18000",privacy:"REDACTED_REMOTE_ALLOWED",verified:true}],tools:[{id:"ledger",operations:["draft"],readOnly:false,authority:false,mayMintExecutionAuthority:false}],requireHumanApprovalForEffects:true,authority:false,mayMintExecutionAuthority:false});
    expect(decision.kind).toBe("PROPOSAL");expect(decision.requiresApproval).toBe(true);expect(decision.authority).toBe(false);expect(decision.mayMintExecutionAuthority).toBe(false);expect(decision.executionAuthorityIssued).toBe(false);
  });

  it("rejects LOCAL_ONLY context for a remote provider",async()=>{
    const registry=new ApplicationModelProviderRegistry();registry.register(provider());const runtime=new CieavApplicationAgentRuntime(registry);
    await expect(runtime.run({requestId:"req-12345678",domain:"private",objective:"Analyze local secret",providerId:"remote",modelId:"reasoner",context:[{kind:"FACT",sourceRef:"local:1",summary:"secret",privacy:"LOCAL_ONLY",verified:true}],tools:[],authority:false,mayMintExecutionAuthority:false})).rejects.toThrow("application_model_local_only_context_rejected");
  });

  it("rejects tool proposals outside the declared tool surface",async()=>{
    const registry=new ApplicationModelProviderRegistry();registry.register(provider({async invoke(request){return{requestId:request.requestId,providerId:"remote",modelId:request.modelId,toolProposals:[{toolId:"ledger",operation:"post",normalizedArgumentsDigest:"b".repeat(64),summary:"Post entry",confidence:.9,authority:false,mayMintExecutionAuthority:false}],evidenceRefs:[],usage:{},authority:false,mayMintExecutionAuthority:false}}}));const runtime=new CieavApplicationAgentRuntime(registry);
    await expect(runtime.run({requestId:"req-12345678",domain:"accounting",objective:"Prepare entry",providerId:"remote",modelId:"reasoner",context:[],tools:[{id:"ledger",operations:["draft"],readOnly:false,authority:false,mayMintExecutionAuthority:false}],authority:false,mayMintExecutionAuthority:false})).rejects.toThrow("application_model_proposed_unavailable_tool");
  });
});
