import {describe,expect,it} from "vitest";
import type {ExecutionProposal,FederatedTool} from "@cieav/contracts";
import {compileExecutionConsequenceBundle,verifyConsequenceBundleDigest,CONSEQUENCE_BUNDLE_COMPILER_DIGEST} from "./consequence-bundle.js";
import {materializeExecutionProposal} from "./consequence-algebra.js";
import {trustedToolAuthorizationBinding} from "./execution-fabric.js";

const proposal:ExecutionProposal={
  id:"11111111-1111-4111-8111-111111111111",
  version:1,
  taskId:"22222222-2222-4222-8222-222222222222",
  intentId:"33333333-3333-4333-8333-333333333333",
  scopeDeviceId:"dev_bundle_12345678",
  subjectId:"agent-1",
  identityAttestationId:"44444444-4444-4444-8444-444444444444",
  credentialLeaseId:"55555555-5555-4555-8555-555555555555",
  toolId:"bank.transfer",
  protocol:"HTTP",
  operation:"transfer",
  target:"bank://beneficiary/vendor-42",
  risk:"CRITICAL",
  normalizedArgumentsDigest:"1".repeat(64),
  semanticEffect:{kind:"TRANSFER_VALUE",target:"bank://beneficiary/vendor-42",objectRef:"invoice-42",amount:{value:9000,currency:"USD"},attributes:{beneficiary:"vendor-42",invoice:"42"}},
  realityWitness:{version:1,observedAt:"2026-08-30T00:00:00.000Z",facts:[{key:"invoice-42.status",valueDigest:"2".repeat(64),source:"ledger-readback",observedAt:"2026-08-30T00:00:00.000Z"}],digest:"3".repeat(64)},
  expectedPostStateDigest:"4".repeat(64),
  proofObligationDigest:"5".repeat(64),
  attenuationWitnessIds:[],
  createdAt:"2026-08-30T00:00:01.000Z"
};

const tool:FederatedTool={
  id:"bank.transfer",displayName:"Bank Transfer",protocol:"HTTP",operation:"transfer",downstreamRef:"https://bank.example/transfers",credentialMode:"CIEAV_INJECTED",risk:"CRITICAL",consequenceCapable:true,proofSources:["ledger-readback"],enabled:true,
  consequenceContract:{version:"CIEAV_TRUSTED_TOOL_CONSEQUENCE_CONTRACT_V1",effectKinds:["TRANSFER_VALUE"],targetBinding:"ROUTE_AND_SEMANTIC_TARGET",targetPrefixes:["bank://beneficiary/"],requiredAttributeKeys:["beneficiary","invoice"],duplicateSemantics:"RECONCILE_BEFORE_RETRY",canonicalResolverId:"cieav.bank.beneficiary.v1",canonicalResolverVersion:"1",authority:false}
};

describe("CIEAV ConsequenceBundleV1 compiler",()=>{
  it("deterministically compiles a qualified execution proposal into a zero-authority bundle",()=>{
    const binding=trustedToolAuthorizationBinding(tool,proposal,{requireContract:true}),materialization=materializeExecutionProposal(proposal);
    const a=compileExecutionConsequenceBundle(proposal,binding,materialization),b=compileExecutionConsequenceBundle(proposal,binding,materialization);
    expect(a).toEqual(b);
    expect(a.bundleDigest).toBe(b.bundleDigest);
    expect(a.compilerDigest).toBe(CONSEQUENCE_BUNDLE_COMPILER_DIGEST);
    expect(a.authority).toBe(false);
    expect(a.mayMintExecutionAuthority).toBe(false);
    expect(a.primaryEffects).toHaveLength(1);
    expect(a.primaryEffects[0]?.authority).toBe(false);
    expect(a.trustedToolBindingDigest).toBe(binding.bindingDigest);
    expect(verifyConsequenceBundleDigest(a)).toBe(true);
  });

  it("carries cumulative money deltas and proof-unavailable UNKNOWN semantics into the bundle",()=>{
    const binding=trustedToolAuthorizationBinding(tool,proposal,{requireContract:true}),bundle=compileExecutionConsequenceBundle(proposal,binding,materializeExecutionProposal(proposal));
    expect(bundle.budgetDeltas).toEqual([{dimension:"money:USD",delta:9000,unit:"USD",scopeRef:`intent:${proposal.intentId}`,authority:false}]);
    expect(bundle.proofRequirements[0]).toMatchObject({effectIds:[`${proposal.id}:primary`],onUnavailable:"UNKNOWN",independentOfActor:true,authority:false});
    expect(bundle.authorityUses.map(x=>x.authorityRef)).toEqual([`intent:${proposal.intentId}`,`tool:${proposal.toolId}`]);
  });

  it("rejects a materialization or binding that belongs to another execution",()=>{
    const binding=trustedToolAuthorizationBinding(tool,proposal,{requireContract:true}),materialization=materializeExecutionProposal(proposal);
    expect(()=>compileExecutionConsequenceBundle({...proposal,operation:"other"},binding,materialization)).toThrow("consequence_bundle_trusted_tool_binding_mismatch");
    expect(()=>compileExecutionConsequenceBundle(proposal,binding,{...materialization,id:"66666666-6666-4666-8666-666666666666"})).toThrow("consequence_bundle_materialization_identity_mismatch");
  });
});
