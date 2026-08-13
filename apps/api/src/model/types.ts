import type { ActionManifest } from "@cieav/contracts";
export type AIProfile = "economy"|"balanced"|"maximum";
export type AIStage = "gate"|"primary"|"verifier"|"verifier-fallback";
export interface OpenAIAnalysisOptions {apiKey:string;baseUrl:string;profile:AIProfile;fastModel:string;primaryModel:string;verifierModel:string;timeoutMs:number}
export interface AIStageMeta {stage:AIStage;model:string;ok:boolean;latencyMs:number;requestId?:string;error?:string}
export interface AIAnalysisMeta {profile:AIProfile;stages:AIStageMeta[];verifierUsed:boolean;disagreement:number;promptInjectionSuspected:boolean;cached:boolean;totalLatencyMs:number}
export interface AIAnalysisResult {manifest:ActionManifest;meta:AIAnalysisMeta}
export interface GateResult {actionType:string;risk:"LOW"|"MEDIUM"|"HIGH"|"CRITICAL";reversibility:"REVERSIBLE"|"DELAYABLE"|"COMPENSABLE"|"IRREVERSIBLE"|"UNKNOWN";confidence:number;needsDeepReview:boolean;promptInjectionSuspected:boolean;reasons:string[]}
