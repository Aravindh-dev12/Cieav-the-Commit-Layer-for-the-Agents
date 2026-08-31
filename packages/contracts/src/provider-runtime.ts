import {z} from "zod";
import {ConsequenceOutcomeSchema,LearningProviderDescriptorSchema,ProofProviderDescriptorSchema} from "./consequence-intelligence.js";

export const ProviderHealthSchema=z.object({ok:z.boolean(),providerId:z.string().min(1).max(200),checkedAt:z.string().datetime(),detail:z.string().max(1000).optional(),authority:z.literal(false).default(false)});
export type ProviderHealth=z.infer<typeof ProviderHealthSchema>;

export const AIModelRoleSchema=z.enum(["fast","primary","verifier","research"]);
export type AIModelRole=z.infer<typeof AIModelRoleSchema>;
export const AIProviderKindSchema=z.enum(["OPENAI","KIMI","ANTHROPIC","GEMINI","XAI","LOCAL_OPENAI_COMPATIBLE","CUSTOM"]);
export type AIProviderKind=z.infer<typeof AIProviderKindSchema>;
export const AIModelProviderDescriptorSchema=z.object({id:z.string().min(1).max(200),kind:AIProviderKindSchema,host:z.string().min(1).max(500),enabled:z.boolean(),models:z.object({fast:z.string().max(500),primary:z.string().max(500),verifier:z.string().max(500),research:z.string().max(500)}),capabilities:z.array(z.string().max(100)).max(100).default([]),authority:z.literal(false).default(false),mayMintExecutionAuthority:z.literal(false).default(false)});
export type AIModelProviderDescriptor=z.infer<typeof AIModelProviderDescriptorSchema>;

export const QualifiedModelSchema=z.object({providerId:z.string().min(1).max(200),host:z.string().min(1).max(500),modelId:z.string().min(1).max(500),modelVersion:z.string().max(500).optional(),roles:z.array(AIModelRoleSchema).min(1).max(4),capabilities:z.array(z.string().max(100)).max(100).default([]),qualificationReceiptDigest:z.string().regex(/^[a-fA-F0-9]{64}$/),qualifiedAt:z.string().datetime(),recheckAt:z.string().datetime().optional(),authority:z.literal(false).default(false),mayMintExecutionAuthority:z.literal(false).default(false)});
export type QualifiedModel=z.infer<typeof QualifiedModelSchema>;
export const QualifiedModelRegistrySchema=z.object({version:z.literal("CIEAV_QUALIFIED_MODELS_V1"),models:z.array(QualifiedModelSchema).max(10000).default([]),authority:z.literal(false).default(false),mayMintExecutionAuthority:z.literal(false).default(false)});
export type QualifiedModelRegistry=z.infer<typeof QualifiedModelRegistrySchema>;

export const ProviderModelDiscoverySchema=z.object({providerId:z.string().min(1).max(200),host:z.string().min(1).max(500),models:z.array(z.string().min(1).max(500)).max(10000),checkedAt:z.string().datetime(),latencyMs:z.number().int().nonnegative().max(300000),requestId:z.string().max(500).optional(),authority:z.literal(false).default(false)});
export type ProviderModelDiscovery=z.infer<typeof ProviderModelDiscoverySchema>;
export const ProviderRouteAttemptSchema=z.object({providerId:z.string().min(1).max(200),modelId:z.string().min(1).max(500),role:AIModelRoleSchema,qualified:z.boolean(),ok:z.boolean(),fallbackEligible:z.boolean(),latencyMs:z.number().int().nonnegative().max(300000),failureKind:z.enum(["unavailable","policy","authentication","configuration","invalid_response"]).optional(),error:z.string().max(500).optional(),authority:z.literal(false).default(false)});
export type ProviderRouteAttempt=z.infer<typeof ProviderRouteAttemptSchema>;
export const ProviderAnalysisStageSchema=z.object({stage:z.enum(["gate","primary","verifier","verifier-fallback"]),model:z.string().min(1).max(500),ok:z.boolean(),latencyMs:z.number().int().nonnegative().max(300000),requestId:z.string().max(500).optional(),error:z.string().max(500).optional()});
export type ProviderAnalysisStage=z.infer<typeof ProviderAnalysisStageSchema>;
export const ProviderRoutingReceiptSchema=z.object({version:z.literal("CIEAV_PROVIDER_ROUTING_RECEIPT_V1"),requestId:z.string().min(8).max(200),selectedProviderId:z.string().max(200).optional(),selectedModelId:z.string().max(500).optional(),crossProviderVerifierId:z.string().max(200).optional(),attempts:z.array(ProviderRouteAttemptSchema).max(50),fallbackUsed:z.boolean(),degraded:z.boolean(),qualificationRequired:z.boolean(),profile:z.enum(["economy","balanced","maximum"]).optional(),stages:z.array(ProviderAnalysisStageSchema).max(20).optional(),verifierUsed:z.boolean().optional(),disagreement:z.number().nonnegative().max(100).optional(),promptInjectionSuspected:z.boolean().optional(),cached:z.boolean().optional(),totalLatencyMs:z.number().int().nonnegative().max(300000).optional(),createdAt:z.string().datetime(),authority:z.literal(false).default(false),executionAuthorityIssued:z.literal(false).default(false),mayMintExecutionAuthority:z.literal(false).default(false)});
export type ProviderRoutingReceipt=z.infer<typeof ProviderRoutingReceiptSchema>;

export const ProofObservationRequestSchema=z.object({requestId:z.string().min(8).max(200),providerId:z.string().min(1).max(200),operation:z.string().min(1).max(300),phase:z.enum(["PRE_STATE","POST_STATE","RECONCILIATION"]),targetRef:z.string().min(1).max(1000),expectedState:z.array(z.string().max(1500)).max(100).default([]),correlationRefs:z.array(z.string().max(500)).max(100).default([]),timeoutMs:z.number().int().positive().max(300_000).default(15_000),authority:z.literal(false).default(false)});
export type ProofObservationRequest=z.infer<typeof ProofObservationRequestSchema>;
export const ProofObservationSchema=z.object({kind:z.string().min(1).max(100),source:z.string().min(1).max(500),observedAt:z.string().datetime(),summary:z.string().min(1).max(1500),digest:z.string().min(16).max(256).optional(),confidence:z.number().min(0).max(1)});
export type ProofObservation=z.infer<typeof ProofObservationSchema>;
export const ProofProviderResultSchema=z.object({provider:ProofProviderDescriptorSchema,requestId:z.string().min(8).max(200),observations:z.array(ProofObservationSchema).max(500).default([]),proposedOutcome:ConsequenceOutcomeSchema.optional(),conclusive:z.boolean().default(false),error:z.string().max(1500).optional(),authority:z.literal(false).default(false),mayMintExecutionAuthority:z.literal(false).default(false)});
export type ProofProviderResult=z.infer<typeof ProofProviderResultSchema>;

export const LearningArtifactRefSchema=z.object({kind:z.enum(["DATASET","CHECKPOINT","ADAPTER","REWARD_MODEL","REPORT","TRAJECTORY_SET"]),uri:z.string().min(1).max(2000),digest:z.string().min(16).max(256)});
export type LearningArtifactRef=z.infer<typeof LearningArtifactRefSchema>;
export const LearningJobRequestSchema=z.object({jobId:z.string().min(8).max(200),providerId:z.string().min(1).max(200),method:z.enum(["SFT","DPO","KTO","GRPO","RLVR","OFFLINE_RL","DISTILLATION","REWARD_MODEL","PROCESS_REWARD"]),dataset:LearningArtifactRefSchema,baseModel:z.string().min(1).max(500).optional(),outputScope:z.string().min(1).max(500),qualificationProfile:z.string().min(1).max(300),candidateMustRemainUnqualified:z.literal(true).default(true),authority:z.literal(false).default(false),productionAuthority:z.literal(false).default(false)});
export type LearningJobRequest=z.infer<typeof LearningJobRequestSchema>;
export const LearningJobResultSchema=z.object({provider:LearningProviderDescriptorSchema,jobId:z.string().min(8).max(200),status:z.enum(["SUCCEEDED_UNQUALIFIED","FAILED","CANCELLED"]),artifacts:z.array(LearningArtifactRefSchema).max(100).default([]),metrics:z.record(z.string(),z.number()).default({}),candidateQualified:z.literal(false).default(false),promotionExecuted:z.literal(false).default(false),authority:z.literal(false).default(false),productionAuthority:z.literal(false).default(false),error:z.string().max(1500).optional()});
export type LearningJobResult=z.infer<typeof LearningJobResultSchema>;
