import {ProviderRoutingReceiptSchema,type ActionContext,type ActionManifest,type ProviderRouteAttempt,type ProviderRoutingReceipt,type RiskLevel} from "@cieav/contracts";
import {consensus,sensitive} from "./consensus.js";
import {analyzeWithOpenAI} from "./openai.js";
import type {AIProfile} from "./types.js";
import {ProviderCallError,analyzeWithExternalProvider,providerFailureAllowsFallback,type ProviderFailureKind,type ProviderManifestResult} from "./provider-adapters.js";
import {providerEligible,providerModelQualified,type AIModelRole,type AIProviderId,type AIProviderRegistryConfig,type AIProviderRuntimeConfig} from "./provider-registry.js";

const riskRank:Record<RiskLevel,number>={LOW:0,MEDIUM:1,HIGH:2,CRITICAL:3};
export interface ProviderRouterResult {manifest:ActionManifest;meta:ProviderRoutingReceipt}
export interface ProviderRouterOptions {profile:AIProfile}

function openAIFailureKind(errors:string[]):ProviderFailureKind{const text=errors.join(" ");if(/\b401\b|invalid[_ -]?api[_ -]?key|unauthor/i.test(text))return"authentication";if(/\b(policy|safety|blocked|content[_ -]?filter|refus(?:e|al)|moderation)\b/i.test(text))return"policy";if(/timeout|\b429\b|\b5\d\d\b|ECONN|network|fetch failed/i.test(text))return"unavailable";return"invalid_response"}
function attemptMeta(provider:AIProviderRuntimeConfig,role:AIModelRole,qualified:boolean,started:number,ok:boolean,error?:ProviderCallError):ProviderRouteAttempt{return{providerId:provider.id,modelId:provider.models[role],role,qualified,ok,fallbackEligible:Boolean(error&&providerFailureAllowsFallback(error)),latencyMs:Date.now()-started,...(error?{failureKind:error.kind,error:error.message.slice(0,300)}:{}),authority:false}}
function receipt(ctx:ActionContext,registry:AIProviderRegistryConfig,input:{selectedProviderId?:AIProviderId;selectedModelId?:string;crossProviderVerifierId?:AIProviderId;attempts:ProviderRouteAttempt[];fallbackUsed:boolean;degraded:boolean}){return ProviderRoutingReceiptSchema.parse({version:"CIEAV_PROVIDER_ROUTING_RECEIPT_V1",requestId:ctx.requestId,...input,qualificationRequired:registry.requireQualifiedModels,createdAt:new Date().toISOString(),authority:false,executionAuthorityIssued:false,mayMintExecutionAuthority:false})}

async function callProvider(ctx:ActionContext,base:ActionManifest,provider:AIProviderRuntimeConfig,role:"primary"|"verifier",profile:AIProfile):Promise<ProviderManifestResult>{
  if(provider.id!=="openai")return analyzeWithExternalProvider(ctx,base,provider,role);
  const result=await analyzeWithOpenAI(ctx,base,{apiKey:provider.apiKey!,baseUrl:provider.baseUrl,profile,fastModel:provider.models.fast,primaryModel:role==="verifier"?provider.models.verifier:provider.models.primary,verifierModel:provider.models.verifier,timeoutMs:provider.timeoutMs});
  const successful=result.meta.stages.filter(x=>x.ok);if(!successful.length){const errors=result.meta.stages.map(x=>x.error??"").filter(Boolean),kind=openAIFailureKind(errors);throw new ProviderCallError(kind,`OpenAI analysis unavailable: ${errors.join(" | ").slice(0,400)}`)}
  return{manifest:result.manifest,meta:{provider:"openai",model:role==="verifier"?provider.models.verifier:provider.models.primary,host:new URL(provider.baseUrl).host.toLowerCase(),...(successful.find(x=>x.requestId)?.requestId?{requestId:successful.find(x=>x.requestId)!.requestId}:{}),latencyMs:result.meta.totalLatencyMs,authority:false}};
}
function highRisk(base:ActionManifest){return riskRank[base.risk]>=riskRank.HIGH||base.dataCategories.some(x=>sensitive.has(x))||base.reversibility==="IRREVERSIBLE"||base.reversibility==="UNKNOWN"}
export function hasEligibleAIProvider(registry:AIProviderRegistryConfig,role:AIModelRole="primary"){return registry.order.some(id=>{const p=registry.providers.get(id);return Boolean(p&&providerEligible(registry,p,role))})}

export async function analyzeWithProviderRouter(ctx:ActionContext,base:ActionManifest,registry:AIProviderRegistryConfig,options:ProviderRouterOptions):Promise<ProviderRouterResult>{
  const attempts:ProviderRouteAttempt[]=[],eligible=registry.order.map(id=>registry.providers.get(id)).filter((p):p is AIProviderRuntimeConfig=>Boolean(p&&providerEligible(registry,p,"primary")));let selected:ProviderManifestResult|undefined,selectedProvider:AIProviderRuntimeConfig|undefined,fallbackUsed=false,degraded=false;
  for(let index=0;index<eligible.length;index++){const provider=eligible[index]!,started=Date.now(),qualified=providerModelQualified(registry,provider,"primary");try{selected=await callProvider(ctx,base,provider,"primary",options.profile);selectedProvider=provider;attempts.push(attemptMeta(provider,"primary",qualified,started,true));fallbackUsed=index>0;break}catch(error){const normalized=error instanceof ProviderCallError?error:new ProviderCallError("invalid_response",error instanceof Error?error.message:String(error));attempts.push(attemptMeta(provider,"primary",qualified,started,false,normalized));degraded=true;if(!providerFailureAllowsFallback(normalized))break}}
  if(!selected||!selectedProvider)return{manifest:base,meta:receipt(ctx,registry,{attempts,fallbackUsed,degraded:true})};
  let manifest=selected.manifest,crossProviderVerifierId:AIProviderId|undefined;
  if(registry.crossProviderVerify&&highRisk(base)){const verifier=registry.order.map(id=>registry.providers.get(id)).find((p):p is AIProviderRuntimeConfig=>Boolean(p&&p.id!==selectedProvider!.id&&providerEligible(registry,p,"verifier")));if(verifier){const started=Date.now(),qualified=providerModelQualified(registry,verifier,"verifier");try{const checked=await callProvider(ctx,base,verifier,"verifier",options.profile);attempts.push(attemptMeta(verifier,"verifier",qualified,started,true));manifest=consensus(manifest,[checked.manifest],[`${verifier.id}:${checked.meta.model}`],false,[]).manifest;crossProviderVerifierId=verifier.id}catch(error){const normalized=error instanceof ProviderCallError?error:new ProviderCallError("invalid_response",error instanceof Error?error.message:String(error));attempts.push(attemptMeta(verifier,"verifier",qualified,started,false,normalized));degraded=true}}else degraded=true}
  return{manifest,meta:receipt(ctx,registry,{selectedProviderId:selectedProvider.id,selectedModelId:selected.meta.model,...(crossProviderVerifierId?{crossProviderVerifierId}:{}),attempts,fallbackUsed,degraded})};
}
