import {z} from "zod";
import {ConsequenceOutcomeSchema} from "./consequence-intelligence.js";

const DigestSchema=z.string().regex(/^[0-9a-f]{64}$/);
export const IntelligenceMetabolismSinkSchema=z.enum([
  "EPISODIC_MEMORY",
  "WORLD_MODEL_OBSERVATION",
  "CONSOLIDATION_CANDIDATE",
  "SKILL_CANDIDATE",
  "MODEL_DATASET",
  "RECOVERY_DATASET",
  "CALIBRATION_DATASET",
  "RECONCILIATION_QUEUE",
  "NONE"
]);
export type IntelligenceMetabolismSink=z.infer<typeof IntelligenceMetabolismSinkSchema>;

export const IntelligenceMetabolismPolicySchema=z.object({
  minRecurringSuccessesForConsolidation:z.number().int().min(2).max(1000).default(3),
  minRecurringSuccessesForSkillCandidate:z.number().int().min(3).max(1000).default(3),
  requireConsentForModelDataset:z.boolean().default(true),
  preserveVerifiedUnknown:z.boolean().default(true),
  preserveVerifiedFailure:z.boolean().default(true)
}).strict();
export type IntelligenceMetabolismPolicy=z.infer<typeof IntelligenceMetabolismPolicySchema>;

export const IntelligenceMetabolismContextSchema=z.object({
  transitionObservations:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0),
  transitionSuccesses:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0),
  transitionFailures:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0),
  transitionUnknown:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0),
  policy:IntelligenceMetabolismPolicySchema.default({})
}).strict();
export type IntelligenceMetabolismContext=z.infer<typeof IntelligenceMetabolismContextSchema>;

export const IntelligenceMetabolismDecisionSchema=z.object({
  version:z.literal("CIEAV_INTELLIGENCE_METABOLISM_DECISION_V1"),
  trajectoryId:z.string().min(8).max(200),
  trajectoryDigest:DigestSchema,
  decidedAt:z.string().datetime(),
  outcome:ConsequenceOutcomeSchema,
  trustedEpisode:z.boolean(),
  sinks:z.array(IntelligenceMetabolismSinkSchema).min(1).max(20),
  reasons:z.array(z.string().min(1).max(500)).max(100),
  modelTrainingEligible:z.boolean(),
  skillCompilationEligible:z.boolean(),
  automaticConsolidationAllowed:z.literal(false).default(false),
  authority:z.literal(false).default(false),
  productionAuthority:z.literal(false).default(false),
  mayMintExecutionAuthority:z.literal(false).default(false),
  mayPromoteModel:z.literal(false).default(false),
  mayActivateSkill:z.literal(false).default(false)
}).strict().superRefine((value,ctx)=>{
  if(value.sinks.includes("NONE")&&value.sinks.length!==1)ctx.addIssue({code:z.ZodIssueCode.custom,path:["sinks"],message:"metabolism_none_must_be_exclusive"});
  if(value.skillCompilationEligible&&!value.sinks.includes("SKILL_CANDIDATE"))ctx.addIssue({code:z.ZodIssueCode.custom,path:["skillCompilationEligible"],message:"skill_eligibility_requires_skill_sink"});
  if(value.modelTrainingEligible&&!value.sinks.includes("MODEL_DATASET"))ctx.addIssue({code:z.ZodIssueCode.custom,path:["modelTrainingEligible"],message:"model_training_eligibility_requires_dataset_sink"});
});
export type IntelligenceMetabolismDecision=z.infer<typeof IntelligenceMetabolismDecisionSchema>;

export const IntelligenceMetabolismRecordSchema=z.object({
  version:z.literal("CIEAV_INTELLIGENCE_METABOLISM_RECORD_V1"),
  decision:IntelligenceMetabolismDecisionSchema,
  recordedAt:z.string().datetime(),
  authority:z.literal(false).default(false),
  productionAuthority:z.literal(false).default(false),
  mayMintExecutionAuthority:z.literal(false).default(false)
}).strict();
export type IntelligenceMetabolismRecord=z.infer<typeof IntelligenceMetabolismRecordSchema>;

export const IntelligenceMetabolismPersistedStateSchema=z.object({
  version:z.literal("CIEAV_INTELLIGENCE_METABOLISM_STATE_V1"),
  records:z.array(IntelligenceMetabolismRecordSchema).max(1_000_000),
  updatedAt:z.string().datetime(),
  authority:z.literal(false).default(false),
  productionAuthority:z.literal(false).default(false),
  mayMintExecutionAuthority:z.literal(false).default(false)
}).strict();
export type IntelligenceMetabolismPersistedState=z.infer<typeof IntelligenceMetabolismPersistedStateSchema>;
