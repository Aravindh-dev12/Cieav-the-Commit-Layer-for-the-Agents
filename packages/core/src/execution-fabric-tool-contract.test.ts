import crypto from "node:crypto";
import {describe,expect,it} from "vitest";
import type {ExecutionProposal,FederatedTool} from "@cieav/contracts/execution-fabric";
import {assertTrustedToolConsequenceContract} from "./execution-fabric.js";

const h=(c:string)=>c.repeat(64);
function proposal(overrides:Partial<ExecutionProposal>={}):ExecutionProposal{return{
  id:crypto.randomUUID(),version:1,taskId:crypto.randomUUID(),intentId:crypto.randomUUID(),scopeDeviceId:"device-0001",subjectId:"agent-1",
  identityAttestationId:crypto.randomUUID(),credentialLeaseId:crypto.randomUUID(),toolId:"gmail.send",protocol:"MCP",operation:"send",target:"mailto:customer@example.com",risk:"HIGH",
  normalizedArgumentsDigest:h("a"),semanticEffect:{kind:"COMMUNICATE",target:"mailto:customer@example.com",attributes:{channel:"email",template:"approved-v4"}},
  realityWitness:{version:1,observedAt:new Date().toISOString(),facts:[{key:"message",valueDigest:h("b"),source:"provider-readback",observedAt:new Date().toISOString()}],digest:h("c")},
  expectedPostStateDigest:h("d"),proofObligationDigest:h("e"),attenuationWitnessIds:[],createdAt:new Date().toISOString(),...overrides
}}
function tool(overrides:Partial<FederatedTool>={}):FederatedTool{return{
  id:"gmail.send",displayName:"Gmail Send",protocol:"MCP",operation:"send",downstreamRef:"mcp://gmail/send",credentialMode:"CIEAV_INJECTED",risk:"HIGH",consequenceCapable:true,proofSources:["provider-readback"],enabled:true,
  consequenceContract:{version:"CIEAV_TRUSTED_TOOL_CONSEQUENCE_CONTRACT_V1",effectKinds:["COMMUNICATE"],targetBinding:"ROUTE_AND_SEMANTIC_TARGET",targetPrefixes:["mailto:"],requiredAttributeKeys:["channel"],duplicateSemantics:"RECONCILE_BEFORE_RETRY",canonicalResolverId:"cieav.gmail.mailto.v1",canonicalResolverVersion:"1",authority:false},
  ...overrides
}}

describe("trusted tool consequence contract",()=>{
  it("binds a valid effect to the registered zero-authority tool contract",()=>{const result=assertTrustedToolConsequenceContract(tool(),proposal(),{requireContract:true});expect(result.productionQualified).toBe(true);expect(result.canonicalTarget).toBe("mailto:customer@example.com");expect(result.contractDigest).toMatch(/^[0-9a-f]{64}$/);expect(result.authority).toBe(false);expect(result.mayMintExecutionAuthority).toBe(false)});
  it("rejects an undeclared consequence kind",()=>{expect(()=>assertTrustedToolConsequenceContract(tool(),proposal({semanticEffect:{kind:"DELETE",target:"mailto:customer@example.com",attributes:{channel:"email"}}}),{requireContract:true})).toThrow("trusted_tool_consequence_effect_kind_mismatch")});
  it("rejects route and semantic target disagreement",()=>{expect(()=>assertTrustedToolConsequenceContract(tool(),proposal({semanticEffect:{kind:"COMMUNICATE",target:"mailto:attacker@example.net",attributes:{channel:"email"}}}),{requireContract:true})).toThrow("trusted_tool_target_binding_mismatch")});
  it("rejects targets outside the trusted canonical prefix",()=>{const constrained=tool({consequenceContract:{...tool().consequenceContract!,targetBinding:"SEMANTIC_TARGET",targetPrefixes:["acct:"]}});expect(()=>assertTrustedToolConsequenceContract(constrained,proposal(),{requireContract:true})).toThrow("trusted_tool_target_outside_contract")});
  it("rejects missing trusted semantic attributes",()=>{expect(()=>assertTrustedToolConsequenceContract(tool(),proposal({semanticEffect:{kind:"COMMUNICATE",target:"mailto:customer@example.com",attributes:{}}}),{requireContract:true})).toThrow("trusted_tool_semantic_attribute_required:channel")});
  it("marks legacy effectful tools unqualified and can fail closed when production requires a contract",()=>{const legacy=tool({consequenceContract:undefined});expect(assertTrustedToolConsequenceContract(legacy,proposal()).productionQualified).toBe(false);expect(()=>assertTrustedToolConsequenceContract(legacy,proposal(),{requireContract:true})).toThrow("trusted_tool_consequence_contract_required")});
  it("allows a non-consequence tool only for READ semantics",()=>{const readTool: FederatedTool={...tool({consequenceCapable:false,consequenceContract:undefined}),id:"lookup",operation:"get"},readProposal=proposal({toolId:"lookup",operation:"get",semanticEffect:{kind:"READ",target:"mailto:customer@example.com",attributes:{}}});expect(assertTrustedToolConsequenceContract(readTool,readProposal,{requireContract:true}).productionQualified).toBe(true);expect(()=>assertTrustedToolConsequenceContract(readTool,{...readProposal,semanticEffect:{kind:"UPDATE",target:"mailto:customer@example.com",attributes:{}}},{requireContract:true})).toThrow("non_consequence_tool_effect_mismatch")});
});
