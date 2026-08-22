import {describe,expect,it} from "vitest";
import type {FrameworkConsequenceRequest,FrameworkToolCall} from "@cieav/contracts";
import {consequenceFromFrameworkCall,sameConsequenceDecisionContext} from "./consequence-abi.js";

const digest="a".repeat(64),before="b".repeat(64),at="2026-08-22T17:00:00.000Z";
const call=(framework:"MCP"|"A2A",id:string):FrameworkToolCall=>({id,version:1,framework,frameworkRunId:`run-${framework.toLowerCase()}`,agentId:"agent-coder",toolName:"git.apply_patch",operation:"git.apply_patch",target:"repo:cieav",normalizedArgumentsDigest:digest,semanticEffect:{kind:"UPDATE",target:"repo:cieav",attributes:{}},retryOrdinal:0,occurredAt:at});
const req=(framework:"MCP"|"A2A",id:string):FrameworkConsequenceRequest=>({call:call(framework,id),adapterManifestId:`adapter-${framework.toLowerCase()}`,principal:{kind:"AGENT",id:"agent-coder"},objective:"repair repository",resource:"repo:cieav",expectedEffects:["repository files change"],authorityRequired:["repo.write"],safetyConstraints:["do not merge"],proofObligations:["git diff matches intended patch"],duplicateSemantics:"RECONCILE_BEFORE_RETRY",reversibility:"COMPENSABLE",uncertaintyPolicy:"STOP_AND_RECONCILE",continuationConditions:["branch remains unchanged"],recoveryContract:["revert patch if proof fails"],risk:"MEDIUM",worldBeforeDigest:before,authority:false});

describe("Consequence ABI",()=>{
  it("normalizes MCP calls without issuing authority",()=>{const result=consequenceFromFrameworkCall(req("MCP","call-mcp-123"));expect(result.descriptor).toMatchObject({version:"CIEAV_CONSEQUENCE_ABI_V1",operation:"git.apply_patch",normalizedArgumentsDigest:digest,authority:false,mayMintExecutionAuthority:false});expect(result.executionAuthorityIssued).toBe(false)});
  it("normalizes A2A calls into the same decision context",()=>{const mcp=consequenceFromFrameworkCall(req("MCP","call-mcp-123")),a2a=consequenceFromFrameworkCall(req("A2A","call-a2a-123"));expect(mcp.descriptor.source.kind).toBe("MCP");expect(a2a.descriptor.source.kind).toBe("A2A");expect(sameConsequenceDecisionContext(mcp.descriptor,a2a.descriptor)).toBe(true)});
  it("rejects an agent principal that does not match the framework call",()=>{const input=req("MCP","call-mcp-123");input.principal={kind:"AGENT",id:"different-agent"};expect(()=>consequenceFromFrameworkCall(input)).toThrow(/principal_agent_mismatch/)});
  it("preserves duplicate, uncertainty, proof and recovery semantics",()=>{const result=consequenceFromFrameworkCall(req("MCP","call-mcp-123")).descriptor;expect(result).toMatchObject({duplicateSemantics:"RECONCILE_BEFORE_RETRY",uncertaintyPolicy:"STOP_AND_RECONCILE",proofObligations:["git diff matches intended patch"],recoveryContract:["revert patch if proof fails"]})});
});
