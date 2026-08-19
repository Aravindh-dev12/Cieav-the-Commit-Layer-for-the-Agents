import {describe,expect,it} from "vitest";
import {assessFrameworkAdapter,createFrameworkBinding,frameworkAdapterPresets,routeFrameworkBinding,settleFrameworkBinding} from "./framework-interop.js";

const call={id:"call-1",version:1 as const,framework:"LANGGRAPH" as const,frameworkRunId:"thread-1",agentId:"agent-1",toolName:"gmail.send",operation:"send",normalizedArgumentsDigest:"a".repeat(64),semanticEffect:{kind:"COMMUNICATE" as const,target:"customer@example.com",attributes:{}},retryOrdinal:0,occurredAt:"2026-08-19T00:00:00.000Z"};

describe("CIEAV framework adapter eligibility",()=>{
  it("refuses to call ordinary framework middleware mandatory while direct execution remains possible",()=>{const preset=frameworkAdapterPresets().find(x=>x.framework==="LANGGRAPH")!;const result=assessFrameworkAdapter({...preset,mode:"MANDATORY_PROXY"});expect(result.mandatoryEligible).toBe(false);expect(result.reasons.join(" ")).toContain("directly outside CIEAV")});
  it("allows mandatory eligibility only for complete fail-closed non-bypass proxying",()=>{const preset=frameworkAdapterPresets().find(x=>x.framework==="MCP")!;const result=assessFrameworkAdapter({...preset,mode:"MANDATORY_PROXY",consequenceCoverage:"COMPLETE",directExecutionPossible:false,agentCanSeeCredentials:false,hostedToolsCanBypass:false,canReplaceToolExecution:true,failClosedOnAdapterError:true});expect(result.mandatoryEligible).toBe(true);expect(result.requirements.join(" ")).toContain("Proof Mesh")});
  it("classifies Langfuse as observation rather than authority",()=>{const preset=frameworkAdapterPresets().find(x=>x.framework==="LANGFUSE")!;expect(preset.telemetryOnly).toBe(true);expect(assessFrameworkAdapter(preset).mandatoryEligible).toBe(false)});
});

describe("CIEAV framework call binding",()=>{
  it("requires an Operation Mandate before mandatory framework routing",()=>{const binding=createFrameworkBinding({call,agentTaskId:"11111111-1111-4111-8111-111111111111",intentId:"22222222-2222-4222-8222-222222222222",effectKey:"b".repeat(64),adapterManifestId:"cieav.langgraph.middleware",mode:"MANDATORY_PROXY",boundAt:"2026-08-19T00:00:01.000Z"});expect(()=>routeFrameworkBinding(binding,{executionTicketId:"33333333-3333-4333-8333-333333333333"})).toThrow("mandatory_framework_binding_requires_operation_mandate")});
  it("binds ticket and mandate then accepts only trusted terminal settlement",()=>{const binding=createFrameworkBinding({call,agentTaskId:"11111111-1111-4111-8111-111111111111",intentId:"22222222-2222-4222-8222-222222222222",effectKey:"b".repeat(64),adapterManifestId:"cieav.langgraph.middleware",mode:"MANDATORY_PROXY",boundAt:"2026-08-19T00:00:01.000Z"});const routed=routeFrameworkBinding(binding,{executionTicketId:"33333333-3333-4333-8333-333333333333",operationMandateId:"44444444-4444-4444-8444-444444444444"});expect(routed.status).toBe("ROUTED");expect(settleFrameworkBinding(routed,"UNKNOWN").settlement).toBe("UNKNOWN")});
});
