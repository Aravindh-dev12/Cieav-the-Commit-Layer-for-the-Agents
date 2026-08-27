import type {ActionContext,ActionManifest} from "@cieav/contracts";
import {afterEach,describe,expect,it,vi} from "vitest";
import {loadAIProviderRegistry} from "./provider-registry.js";
import {analyzeWithProviderRouter} from "./provider-router.js";

const ctx:ActionContext={requestId:"req-provider-1234",url:"https://example.test/pay",origin:"https://example.test",element:{tag:"button",text:"Pay now"},pageText:"Pay the invoice",timestamp:"2026-08-27T00:00:00.000Z",clientVersion:"test"};
const base:ActionManifest={requestId:ctx.requestId,actionType:"purchase",summary:"Pay invoice",actor:"You",recipients:[],dataCategories:["FINANCIAL"],effects:["Creates a financial charge"],reversibility:"IRREVERSIBLE",undo:{kind:"NONE"},risk:"HIGH",confidence:.9,modelUsed:false,warnings:[],evidence:["deterministic baseline"],policyVersion:"test"};
const modelManifest={...base,summary:"Provider classified invoice payment",confidence:.82,modelUsed:true,evidence:["provider evidence"]};

afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks()});
function configure(){vi.stubEnv("KIMI_API_KEY","kimi-key");vi.stubEnv("XAI_API_KEY","xai-key");vi.stubEnv("CIEAV_AI_PROVIDER_ORDER","kimi,xai");vi.stubEnv("CIEAV_KIMI_PRIMARY_MODEL","kimi-k3");vi.stubEnv("CIEAV_XAI_PRIMARY_MODEL","grok-4.6");const registry=loadAIProviderRegistry();registry.crossProviderVerify=false;return registry}
function okEnvelope(){return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(modelManifest)}}]}),{status:200,headers:{"content-type":"application/json","x-request-id":"provider-request"}})}

describe("CIEAV multi-provider router",()=>{
  it("falls back only after provider availability retries are exhausted",async()=>{
    const registry=configure();let calls=0;vi.stubGlobal("fetch",vi.fn(async()=>{calls++;return calls<=2?new Response("temporary outage",{status:503}):okEnvelope()}));
    const result=await analyzeWithProviderRouter(ctx,base,registry,{profile:"balanced"});
    expect(calls).toBe(3);expect(result.meta.selectedProvider).toBe("xai");expect(result.meta.fallbackUsed).toBe(true);expect(result.meta.attempts[0]?.failureKind).toBe("unavailable");expect(result.meta.authority).toBe(false);expect(result.meta.executionAuthorityIssued).toBe(false);expect(result.manifest.risk).toBe("HIGH");
  });

  it("does not vendor-shop around a safety or policy refusal",async()=>{
    const registry=configure();const fetchMock=vi.fn(async()=>new Response("request blocked by safety policy",{status:400}));vi.stubGlobal("fetch",fetchMock);
    const result=await analyzeWithProviderRouter(ctx,base,registry,{profile:"balanced"});
    expect(fetchMock).toHaveBeenCalledTimes(1);expect(result.meta.selectedProvider).toBeUndefined();expect(result.meta.attempts).toHaveLength(1);expect(result.meta.attempts[0]?.failureKind).toBe("policy");expect(result.meta.attempts[0]?.fallbackEligible).toBe(false);expect(result.manifest).toEqual(base);
  });

  it("does not vendor-shop around authentication failure",async()=>{
    const registry=configure();const fetchMock=vi.fn(async()=>new Response("invalid api key",{status:401}));vi.stubGlobal("fetch",fetchMock);
    const result=await analyzeWithProviderRouter(ctx,base,registry,{profile:"balanced"});
    expect(fetchMock).toHaveBeenCalledTimes(1);expect(result.meta.attempts[0]?.failureKind).toBe("authentication");expect(result.meta.attempts[0]?.fallbackEligible).toBe(false);expect(result.meta.authority).toBe(false);
  });
});
