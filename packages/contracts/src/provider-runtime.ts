import {z} from "zod";
import {ConsequenceOutcomeSchema,LearningProviderDescriptorSchema,ProofProviderDescriptorSchema} from "./consequence-intelligence.js";

export const ProviderHealthSchema=z.object({
  ok:z.boolean(),
  providerId:z.string().min(1).max(200),
  checkedAt:z.string().datetime(),
  detail:z.string().max(1000).optional(),
  authority:z.literal(false).default(false),
});
export type ProviderHealth=z.infer<typeof ProviderHealthSchema>;

export const ProofObservationRequestSchema=z.object({
  requestId:z.string().min(8).max(200),
  providerId:z.string().min(1).max(200),
  operation:z.string().min(1).max(300),
  phase:z.enum(["PRE_STATE","POST_STATE","RECONCILIATION"]),
  targetRef:z.string().min(1).max(1000),
  expectedState:z.array(z.string().max(1500)).max(100).default([]),
  correlationRefs:z.array(z.string().max(500)).max(100).default([]),
  timeoutMs:z.number().int().positive().max(300_000).default(15_000),
  authority:z.literal(false).default(false),
});
export type ProofObservationRequest=z.infer<typeof ProofObservationRequestSchema>;

export const ProofObservationSchema=z.object({
  kind:z.string().min(1).max(100),
  source:z.string().min(1).max(500),
  observedAt:z.string().datetime(),
  summary:z.string().min(1).max(1500),
  digest:z.string().min(16).max(256).optional(),
  confidence:z.number().min(0).max(1),
});
export type ProofObservation=z.infer<typeof ProofObservationSchema>;

export const ProofProviderResultSchema=z.object({
  provider:ProofProviderDescriptorSchema,
  requestId:z.string().min(8).max(200),
  observations:z.array(ProofObservationSchema).max(500).default([]),
  proposedOutcome:ConsequenceOutcomeSchema.optional(),
  conclusive:z.boolean().default(false),
  error:z.string().max(1500).optional(),
  authority:z.literal(false).default(false),
  mayMintExecutionAuthority:z.literal(false).default(false),
});
export type ProofProviderResult=z.infer<typeof ProofProviderResultSchema>;

export const LearningArtifactRefSchema=z.object({
  kind:z.enum(["DATASET","CHECKPOINT","ADAPTER","REWARD_MODEL","REPORT","TRAJECTORY_SET"]),
  uri:z.string().min(1).max(2000),
  digest:z.string().min(16).max(256),
});
export type LearningArtifactRef=z.infer<typeof LearningArtifactRefSchema>;

export const LearningJobRequestSchema=z.object({
  jobId:z.string().min(8).max(200),
  providerId:z.string().min(1).max(200),
  method:z.enum(["SFT","DPO","KTO","GRPO","RLVR","OFFLINE_RL","DISTILLATION","REWARD_MODEL","PROCESS_REWARD"]),
  dataset:LearningArtifactRefSchema,
  baseModel:z.string().min(1).max(500).optional(),
  outputScope:z.string().min(1).max(500),
  qualificationProfile:z.string().min(1).max(300),
  candidateMustRemainUnqualified:z.literal(true).default(true),
  authority:z.literal(false).default(false),
  productionAuthority:z.literal(false).default(false),
});
export type LearningJobRequest=z.infer<typeof LearningJobRequestSchema>;

export const LearningJobResultSchema=z.object({
  provider:LearningProviderDescriptorSchema,
  jobId:z.string().min(8).max(200),
  status:z.enum(["SUCCEEDED_UNQUALIFIED","FAILED","CANCELLED"]),
  artifacts:z.array(LearningArtifactRefSchema).max(100).default([]),
  metrics:z.record(z.string(),z.number()).default({}),
  candidateQualified:z.literal(false).default(false),
  promotionExecuted:z.literal(false).default(false),
  authority:z.literal(false).default(false),
  productionAuthority:z.literal(false).default(false),
  error:z.string().max(1500).optional(),
});
export type LearningJobResult=z.infer<typeof LearningJobResultSchema>;
