import type {ActionContext,ActionManifest,RiskLevel} from "@cieav/contracts";
import {consensus,sensitive} from "./consensus.js";
import {analyzeWithOpenAI} from "./openai.js";
import type {AIProfile} from "./types.js";
import {ProviderCallError,analyzeWithExternalProvider,providerFailureAllowsFallback,type ProviderFailureKind,type ProviderManifestResult} from "./provider-adapters.js";
import {providerEligible,providerModelQualified,type AIModelRole,type AIProviderId,type AIProviderRegistryConfig,type AIProviderRuntimeConfig} from "./provider-registry.js";

const riskRank:Record<RiskLevel,number>={LOW:0,MEDIUM:1,HIGH:2,CRITICAL:3};
export interface ProviderAttemptMeta {provider:AIProviderId;model:string;role:AIModelRole;qualified:boolean;ok:boolean;fallbackEligible:boolean;latencyMs:number;failureKind?:ProviderFailureKind;error?:string;authority:false}
export interface ProviderRouterMeta {version:"CIEAV_PROVIDER_ROUTER_V1";selectedProvider?:AIProviderId;selectedModel?:string;crossProviderVerifier?:AIProviderId;attempts:ProviderAttemptMeta[];fallbackUsed:boolean;degraded:boolean;qualificationRequired:boolean;authority:false;executionAuthorityIssued:false}
export interface ProviderRouterResult {manifest:ActionManifest;meta:ProviderRouterMeta}
export interface ProviderRouterOptions {profile:AIProfile}

function openAIFailureKind(errors:string[]):ProviderFailureKind{const text=errors.join(" ");if(/\b401\b|invalid[_ -]?api[_ -]?key|unauthor/i.test(text))return"authentication";if(/\b(policy|safety|blocked|content[_ -]?filter|refus(?:e|al)|moderation)\b/i.test(text))return"policy";if(/timeout|\b429\b|\b5\d\d\b|ECONN|network|fetch failed/i.test(text))return"unavailable";return"invalid_response"}
function attemptMeta(provider:AIProviderRuntimeConfig,role:AIModelRole,qualified:boolean,started:number,ok:boolean,error?:ProviderCallError):ProviderAttemptMeta{return{provider:provider.id,model:provider.models[role],role,qualified,ok,fallbackEligible:Boolean(error&&providerFailureAllowsFallback(error)),latencyMs:Date.now()-started,...(error?{failureKind:error.kind,error:error.message.slice(0,300)}:{}),authority:false}}

async function callProvider(ctx:ActionContext,base:ActionManifest,registry:AIProviderRegistryConfig,provider:AIProviderRuntimeConfig,role:"primary"|"verifier",profile:AIProfile):Promise<ProviderManifestResult>{
  if(provider.id!=="openai")return analyzeWithExternalProvider(ctx,base,provider,role);
  const result=await analyzeWithOpenAI(ctx,base,{apiKey:provider.apiKey!,baseUrl:provider.baseUrl,profile,fastModel:provider.models.fast,primaryModel:role==="verifier"?provider.models.verifier:provider.models.primary,verifierModel:provider.models.verifier,timeoutMs:provider.timeoutMs});
  const successful=result.meta.stages.filter(x=>x.ok);if(!successful.length){const errors=result.meta.stages.map(x=>x.error??"").filter(Boolean),kind=openAIFailureKind(errors);throw new ProviderCallError(kind,`OpenAI analysis unavailable: ${errors.join(" | ").slice(0,400)}`)}
  return{manifest:result.manifest,meta:{provider:"openai",model:role==="verifier"?provider.models.verifier:provider.models.primary,host:new URL(provider.baseUrl).host.toLowerCase(),requestId:successful.find(x=>x.requestId)?.requestId,latencyMs:result.meta.totalLatencyMs,authority:false}};
}

function highRisk(base:ActionManifest){return riskRank[base.risk]>=riskRank.HIGH||base.dataCategories.some(x=>sensitive.has(x))||base.reversibility==="IRREVERSIBLE"||base.reversibility==="UNKNOWN"}
export function hasEligibleAIProvider(registry:AIProviderRegistryConfig,role:AIModelRole="primary"){return registry.order.some(id=>{const p=registry.providers.get(id);return Boolean(p&&providerEligible(registry,p,role))})}

export async function analyzeWithProviderRouter(ctx:ActionContext,base:ActionManifest,registry:AIProviderRegistryConfig,options:ProviderRouterOptions):Promise<ProviderRouterResult>{
  const attempts:ProviderAttemptMeta[]=[],eligible=registry.order.map(id=>registry.providers.get(id)).filter((p):p is AIProviderRuntimeConfig=>Boolean(p&&providerEligible(registry,p,"primary")));
  let selected:ProviderManifestResult|undefined,selectedProvider:AIProviderRuntimeConfig|undefined,fallbackUsed=false,degraded=false;
  for(let index=0;index<eligible.length;index++){
    const provider=eligible[index]!,started=Date.now(),qualified=providerModelQualified(registry,provider,"primary");
    try{selected=await callProvider(ctx,base,registry,provider,"primary",options.profile);selectedProvider=provider;attempts.push(attemptMeta(provider,"primary",qualified,started,true));fallbackUsed=index>0;break}catch(error){const normalized=error instanceof ProviderCallError?error:new ProviderCallError("invalid_response",error instanceof Error?error.message:String(error));attempts.push(attemptMeta(provider,"primary",qualified,started,false,normalized));degraded=true;if(!providerFailureAllowsFallback(normalized))break}
  }
  if(!selected||!selectedProvider)return{manifest:base,meta:{version:"CIEAV_PROVIDER_ROUTER_V1",attempts,fallbackUsed,degraded:true,qualificationRequired:registry.requireQualifiedModels,authority:false,executionAuthorityIssued:false}};
  let manifest=selected.manifest,crossProviderVerifier:AIProviderId|undefined;
  if(registry.crossProviderVerify&&highRisk(base)){
    const verifier=registry.order.map(id=>registry.providers.get(id)).find((p):p is AIProviderRuntimeConfig=>Boolean(p&&p.id!==selectedProvider!.id&&providerEligible(registry,p,"verifier")));
    if(verifier){const started=Date.now(),qualified=providerModelQualified(registry,verifier,"verifier");try{const checked=await callProvider(ctx,base,registry,verifier,"verifier",options.profile);attempts.push(attemptMeta(verifier,"verifier",qualified,started,true));manifest=consensus(manifest,[checked.manifest],[`${verifier.id}:${checked.meta.model}`],false,[]).manifest;crossProviderVerifier=verifier.id}catch(error){const normalized=error instanceof ProviderCallError?error:new ProviderCallError("invalid_response",error instanceof Error?error.message:String(error));attempts.push(attemptMeta(verifier,"verifier",qualified,started,false,normalized));degraded=true}}else degraded=true;
  }
  return{manifest,meta:{version:"CIEAV_PROVIDER_ROUTER_V1",selectedProvider:selectedProvider.id,selectedModel:selected.meta.model,...(crossProviderVerifier?{crossProviderVerifier}:{}),attempts,fallbackUsed,degraded,qualificationRequired:registry.requireQualifiedModels,authority:false,executionAuthorityIssued:false}};
}
