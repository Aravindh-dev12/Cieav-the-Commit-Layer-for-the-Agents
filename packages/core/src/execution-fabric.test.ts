import crypto from "node:crypto";
import {describe,expect,it} from "vitest";
import type {ExecutionProposal,FederatedTool,FormalPermissionGraph,PermissionGraphEdge} from "@cieav/contracts/execution-fabric";
import {assertTrustedToolAuthorizationBinding,evaluateFormalAuthorization,permissionGraphDigest,trustedToolAuthorizationBinding,verifyPermissionGraph} from "./execution-fabric.js";

const intentId="33333333-3333-4333-8333-333333333333",deviceId="dev_test_12345678";
const edge=(overrides:Partial<PermissionGraphEdge>={}):PermissionGraphEdge=>({
  id:crypto.randomUUID(),effect:"ALLOW",subjectIds:["agent-1"],intentIds:[intentId],toolIds:["gmail.send"],operations:["send"],targetPrefixes:["mailto:customer@"],maxRisk:"HIGH",evidenceRefs:["intent:root","policy:customer-contact"],reason:"Root Intent permits governed customer email.",...overrides
});
const graph=(edges:PermissionGraphEdge[]):FormalPermissionGraph=>{const unsigned={id:crypto.randomUUID(),version:1 as const,scopeDeviceId:deviceId,rootIntentId:intentId,defaultDecision:"DENY" as const,edges,createdAt:"2026-08-19T00:00:00.000Z",updatedAt:"2026-08-19T00:00:00.000Z"};return{...unsigned,digest:permissionGraphDigest(unsigned)}};
const proposal=(overrides:Partial<ExecutionProposal>={}):ExecutionProposal=>({
  id:crypto.randomUUID(),version:1,taskId:"11111111-1111-4111-8111-111111111111",intentId,scopeDeviceId:deviceId,subjectId:"agent-1",
  identityAttestationId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",credentialLeaseId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",toolId:"gmail.send",protocol:"MCP",operation:"send",target:"mailto:customer@example.com",risk:"HIGH",
  normalizedArgumentsDigest:"1".repeat(64),semanticEffect:{kind:"COMMUNICATE",target:"customer@example.com",objectRef:"message-1",attributes:{channel:"email"}},
  realityWitness:{version:1,observedAt:"2026-08-19T00:00:00.000Z",facts:[{key:"message-1",valueDigest:"2".repeat(64),source:"provider",observedAt:"2026-08-19T00:00:00.000Z"}],digest:"3".repeat(64)},
  expectedPostStateDigest:"4".repeat(64),proofObligationDigest:"5".repeat(64),attenuationWitnessIds:[],createdAt:"2026-08-19T00:00:00.000Z",...overrides
});
const tool: FederatedTool={
  id:"gmail.send",displayName:"Gmail Send",protocol:"MCP",operation:"send",downstreamRef:"mcp://gmail/send",credentialMode:"CIEAV_INJECTED",risk:"HIGH",consequenceCapable:true,proofSources:["provider-readback"],enabled:true,
  consequenceContract:{version:"CIEAV_TRUSTED_TOOL_CONSEQUENCE_CONTRACT_V1",effectKinds:["COMMUNICATE"],targetBinding:"ROUTE_TARGET",targetPrefixes:["mailto:customer@"],requiredAttributeKeys:["channel"],duplicateSemantics:"RECONCILE_BEFORE_RETRY",canonicalResolverId:"cieav.mail.address.v1",canonicalResolverVersion:"1",authority:false}
};

describe("CIEAV formal execution authorization",()=>{
  it("denies by default when no permission edge matches",()=>{expect(evaluateFormalAuthorization(graph([]),proposal()).decision).toBe("BLOCK")});
  it("requires exact tool operation target and risk scope",()=>{const g=graph([edge()]);expect(evaluateFormalAuthorization(g,proposal()).decision).toBe("ALLOW");expect(evaluateFormalAuthorization(g,proposal({toolId:"stripe.refund"})).decision).toBe("BLOCK");expect(evaluateFormalAuthorization(g,proposal({operation:"delete"})).decision).toBe("BLOCK");expect(evaluateFormalAuthorization(g,proposal({target:"mailto:stranger@example.net"})).decision).toBe("BLOCK");expect(evaluateFormalAuthorization(graph([edge({maxRisk:"MEDIUM"})]),proposal()).decision).toBe("BLOCK")});
  it("makes DENY dominate ASK and ALLOW",()=>{const g=graph([edge(),edge({effect:"ASK",reason:"Human checkpoint required."}),edge({effect:"DENY",reason:"Enterprise deny overrides delegation."})]);const d=evaluateFormalAuthorization(g,proposal());expect(d.decision).toBe("BLOCK");expect(d.reasons).toEqual(["Enterprise deny overrides delegation."])});
  it("returns ASK when no matching deny exists",()=>{const d=evaluateFormalAuthorization(graph([edge(),edge({effect:"ASK",reason:"Escalate this consequence."})]),proposal());expect(d.decision).toBe("ASK")});
  it("fails closed when the permission graph is tampered",()=>{const g=graph([edge()]);const tampered={...g,edges:[...g.edges,edge({toolIds:["stripe.refund"]})]};expect(verifyPermissionGraph(tampered)).toBe(false);expect(evaluateFormalAuthorization(tampered,proposal()).decision).toBe("BLOCK")});
  it("fails closed on device or root-intent substitution",()=>{const g=graph([edge()]);expect(evaluateFormalAuthorization(g,proposal({scopeDeviceId:"dev_other_12345678"})).decision).toBe("BLOCK");expect(evaluateFormalAuthorization(g,proposal({intentId:"66666666-6666-4666-8666-666666666666"})).decision).toBe("BLOCK")});
});

describe("CIEAV trusted tool authorization binding",()=>{
  it("detects persisted binding-field tampering even when the stored digest is left unchanged",()=>{
    const p=proposal(),binding=trustedToolAuthorizationBinding(tool,p,{requireContract:true});
    const tampered={...binding,canonicalResolverVersion:"2"};
    expect(()=>assertTrustedToolAuthorizationBinding(tool,p,tampered,{requireContract:true})).toThrow("trusted_tool_authorization_binding_integrity_mismatch");
  });
  it("detects real contract drift after a previously valid binding was persisted",()=>{
    const p=proposal(),binding=trustedToolAuthorizationBinding(tool,p,{requireContract:true});
    const drifted={...tool,consequenceContract:{...tool.consequenceContract!,canonicalResolverVersion:"2"}};
    expect(()=>assertTrustedToolAuthorizationBinding(drifted,p,binding,{requireContract:true})).toThrow("trusted_tool_consequence_contract_drift");
  });
});
