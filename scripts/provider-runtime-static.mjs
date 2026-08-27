#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),read=p=>fs.readFileSync(path.join(root,p),"utf8"),fail=[];
function need(file,...tokens){const text=read(file);for(const token of tokens)if(!text.includes(token))fail.push(`${file}: missing ${token}`)}
need("packages/contracts/src/provider-runtime.ts","CIEAV_QUALIFIED_MODELS_V1","CIEAV_PROVIDER_ROUTING_RECEIPT_V1","mayMintExecutionAuthority:z.literal(false)","executionAuthorityIssued:z.literal(false)","candidateMustRemainUnqualified:z.literal(true)");
need("apps/api/src/model/provider-registry.ts","process.env.NODE_ENV===\"production\"","QualifiedModelRegistrySchema","requires HTTPS except for loopback","providerModelQualified","providerEligible");
need("apps/api/src/model/provider-router.ts","ProviderRoutingReceiptSchema","providerFailureAllowsFallback","crossProviderVerifierId","executionAuthorityIssued:false","mayMintExecutionAuthority:false");
need("apps/api/src/model/provider-adapters.ts","privacyReduceContext","ProviderReliabilityManager","policyPattern","provider refused request under safety/policy","providerFailureAllowsFallback");
need("apps/api/src/model/provider-discovery.ts","ProviderModelDiscoverySchema","checkedAt:new Date().toISOString()","authority:false");
need("apps/api/src/config.ts","loadOptionalEnvFile()","loadAIProviderRegistry");
need("apps/api/src/env-file.ts","parseEnv","CIEAV_ENV_FILE","permissions are too broad","process.env[key]===undefined");
need("apps/api/src/server.ts","analyzeWithProviderRouter","providerRegistrySnapshot","hasEligibleAIProvider");
need(".env.example","CIEAV_AI_REQUIRE_QUALIFIED_MODELS","CIEAV_AI_PROVIDER_ORDER","KIMI_API_KEY","ANTHROPIC_API_KEY","GEMINI_API_KEY","XAI_API_KEY","OPENAI_TRAINING_API_KEY","CIEAV_AI_QUALIFIED_MODELS_FILE");
need("scripts/qualify-ai-providers.mjs","--live","--require-qualified","latest-ai-provider-qualification.json","executionAuthorityIssued:false");
need("apps/api/src/model/provider-router.test.ts","does not vendor-shop around a safety or policy refusal","does not vendor-shop around authentication failure","CIEAV_PROVIDER_ROUTING_RECEIPT_V1");
need("apps/api/src/model/provider-registry.test.ts","never treats an API key as qualification","production to run deterministically with no AI provider enabled");
need("apps/api/src/model/provider-discovery.test.ts","canonical zero-authority evidence");
need("apps/api/src/env-file.test.ts","without overriding injected process secrets");
if(fail.length){console.error("CIEAV provider runtime static gate FAIL");for(const item of fail)console.error(` - ${item}`);process.exit(1)}
console.log("CIEAV provider runtime static gate PASS - canonical qualification + live discovery + availability-only fallback + cross-provider verification + circuit/concurrency controls + secure env loading + zero authority present");
