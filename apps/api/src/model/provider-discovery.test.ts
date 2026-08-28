import {afterEach,describe,expect,it,vi} from "vitest";
import {discoverProviderModels} from "./provider-discovery.js";
import type {AIProviderRuntimeConfig} from "./provider-registry.js";

afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks()});
const provider=(id:AIProviderRuntimeConfig["id"],baseUrl:string):AIProviderRuntimeConfig=>({id,enabled:true,baseUrl,apiKey:"test",models:{fast:"m1",primary:"m1",verifier:"m2",research:"m1"},timeoutMs:2000,authority:false});

describe("provider model discovery",()=>{
  it("discovers OpenAI-compatible model IDs as canonical zero-authority evidence",async()=>{vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({data:[{id:"m2"},{id:"m1"}]}),{status:200,headers:{"x-request-id":"req-1"}})));const result=await discoverProviderModels(provider("xai","https://api.x.ai/v1"));expect(result.providerId).toBe("xai");expect(result.models).toEqual(["m1","m2"]);expect(result.authority).toBe(false);expect(result.requestId).toBe("req-1");expect(Number.isNaN(Date.parse(result.checkedAt))).toBe(false)});
  it("normalizes Gemini model names",async()=>{vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({models:[{name:"models/gemini-a"},{name:"models/gemini-b"}]}),{status:200})));const result=await discoverProviderModels(provider("gemini","https://generativelanguage.googleapis.com/v1beta"));expect(result.providerId).toBe("gemini");expect(result.models).toEqual(["gemini-a","gemini-b"]);expect(result.authority).toBe(false)});
  it("fails when a provider returns an empty catalog",async()=>{vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({data:[]}),{status:200})));await expect(discoverProviderModels(provider("openai","https://api.openai.com/v1"))).rejects.toThrow(/empty_catalog/)});
});
