import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach,describe,expect,it,vi} from "vitest";
import {loadAIProviderRegistry,providerEligible,providerModelQualified,providerRegistrySnapshot} from "./provider-registry.js";

afterEach(()=>{vi.unstubAllEnvs()});

describe("CIEAV AI provider registry",()=>{
  it("rejects non-loopback plaintext provider endpoints",()=>{vi.stubEnv("KIMI_BASE_URL","http://example.com/v1");expect(()=>loadAIProviderRegistry()).toThrow(/requires HTTPS/)});

  it("fails closed when an enabled provider requires exact qualification but the registry is missing",()=>{vi.stubEnv("OPENAI_API_KEY","test-key");vi.stubEnv("CIEAV_AI_REQUIRE_QUALIFIED_MODELS","1");vi.stubEnv("CIEAV_AI_QUALIFIED_MODELS_FILE",path.join(os.tmpdir(),`missing-${Date.now()}.json`));expect(()=>loadAIProviderRegistry()).toThrow(/qualified model registry required but missing/)});

  it("allows production to run deterministically with no AI provider enabled",()=>{vi.stubEnv("NODE_ENV","production");const registry=loadAIProviderRegistry();expect(registry.requireQualifiedModels).toBe(true);expect([...registry.providers.values()].some(p=>p.enabled)).toBe(false)});

  it("binds canonical qualification to provider host model and role with zero authority",()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),"cieav-model-registry-")),file=path.join(dir,"qualified-models.json");
    fs.writeFileSync(file,JSON.stringify({version:"CIEAV_QUALIFIED_MODELS_V1",authority:false,mayMintExecutionAuthority:false,models:[{providerId:"openai",host:"api.openai.com",modelId:"gpt-5.6",roles:["primary","research"],capabilities:["reasoning","tools"],qualificationReceiptDigest:"a".repeat(64),qualifiedAt:"2026-08-27T00:00:00.000Z",recheckAt:"2099-01-01T00:00:00.000Z",authority:false,mayMintExecutionAuthority:false}]}));
    vi.stubEnv("OPENAI_API_KEY","test-key");vi.stubEnv("CIEAV_AI_REQUIRE_QUALIFIED_MODELS","1");vi.stubEnv("CIEAV_AI_QUALIFIED_MODELS_FILE",file);
    const registry=loadAIProviderRegistry(),provider=registry.providers.get("openai")!;expect(providerModelQualified(registry,provider,"primary")).toBe(true);expect(providerModelQualified(registry,provider,"verifier")).toBe(false);expect(providerEligible(registry,provider,"primary")).toBe(true);expect(providerEligible(registry,provider,"verifier")).toBe(false);const snapshot=providerRegistrySnapshot(registry);expect(snapshot.authority).toBe(false);expect(snapshot.qualifiedModelCount).toBe(1);fs.rmSync(dir,{recursive:true,force:true});
  });

  it("never treats an API key as qualification",()=>{vi.stubEnv("OPENAI_API_KEY","test-key");const registry=loadAIProviderRegistry(),provider=registry.providers.get("openai")!;expect(provider.enabled).toBe(true);expect(providerModelQualified(registry,provider,"primary")).toBe(false);expect(provider.authority).toBe(false)});
});
