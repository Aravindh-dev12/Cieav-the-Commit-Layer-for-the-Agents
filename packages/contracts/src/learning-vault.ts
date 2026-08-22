import {z} from "zod";
import {ConsequenceOutcomeSchema} from "./consequence-intelligence.js";

const DigestSchema=z.string().regex(/^[0-9a-f]{64}$/);
export const LearningMethodSchema=z.enum(["SFT","DPO","KTO","GRPO","RLVR","OFFLINE_RL","DISTILLATION","REWARD_MODEL","PROCESS_REWARD"]);
export type LearningMethod=z.infer<typeof LearningMethodSchema>;

export const LearningDatasetEntrySchema=z.object({
  trajectoryId:z.string().min(8).max(200),trajectoryDigest:DigestSchema,operation:z.string().min(1).max(300),exactArgumentsDigest:z.string().min(16).max(256),outcome:ConsequenceOutcomeSchema,
  authorityGrade:z.boolean(),realityBound:z.boolean(),eligibleAgenticRl:z.boolean(),evidenceDigest:DigestSchema,redactionProfile:z.string().min(1).max(300),consentScope:z.string().min(1).max(300).optional(),
  sourceSink:z.enum(["MODEL_DATASET","RECOVERY_DATASET","CALIBRATION_DATASET"])
}).strict();
export type LearningDatasetEntry=z.infer<typeof LearningDatasetEntrySchema>;

/**
 * A manifest can exist before training material is safe to expose. Materialized
 * artifacts must be separately content-addressed and state which methods their
 * actual schema supports; CIEAV never infers SFT/DPO targets from outcome logs.
 */
export const LearningDatasetMaterializationSchema=z.object({
  kind:z.enum(["REDACTED_TRAJECTORY_JSONL","PREFERENCE_PAIRS_JSONL","SFT_MESSAGES_JSONL","RL_ENVIRONMENT_SET","REWARD_EXAMPLES_JSONL"]),
  uri:z.string().min(1).max(2000),
  digest:DigestSchema,
  sourceManifestDigest:DigestSchema,
  redactionProfile:z.string().min(1).max(300),
  schemaVersion:z.string().min(1).max(100),
  supportedMethods:z.array(LearningMethodSchema).min(1).max(20),
  createdAt:z.string().datetime()
}).strict();
export type LearningDatasetMaterialization=z.infer<typeof LearningDatasetMaterializationSchema>;

export const LearningDatasetManifestSchema=z.object({
  version:z.literal("CIEAV_LEARNING_DATASET_MANIFEST_V1"),datasetId:z.string().min(8).max(200),datasetDigest:DigestSchema,purpose:z.enum(["OUTCOME_POLICY","RECOVERY","CALIBRATION"]),entries:z.array(LearningDatasetEntrySchema).min(1).max(1_000_000),eligibleMethods:z.array(LearningMethodSchema).max(20),materialization:LearningDatasetMaterializationSchema.optional(),createdAt:z.string().datetime(),
  authority:z.literal(false).default(false),productionAuthority:z.literal(false).default(false),mayMintExecutionAuthority:z.literal(false).default(false),mayPromoteModel:z.literal(false).default(false)
}).strict().superRefine((dataset,ctx)=>{
  if(!dataset.materialization&&dataset.eligibleMethods.length)ctx.addIssue({code:z.ZodIssueCode.custom,path:["eligibleMethods"],message:"training_methods_require_materialized_dataset"});
  if(dataset.materialization){
    if(dataset.materialization.sourceManifestDigest!==dataset.datasetDigest)ctx.addIssue({code:z.ZodIssueCode.custom,path:["materialization","sourceManifestDigest"],message:"materialization_manifest_digest_mismatch"});
    const allowed=new Set(dataset.materialization.supportedMethods);for(const method of dataset.eligibleMethods)if(!allowed.has(method))ctx.addIssue({code:z.ZodIssueCode.custom,path:["eligibleMethods"],message:`materialization_does_not_support_method:${method}`});
  }
});
export type LearningDatasetManifest=z.infer<typeof LearningDatasetManifestSchema>;

export const LearningDatasetVaultStateSchema=z.object({version:z.literal("CIEAV_LEARNING_DATASET_VAULT_V1"),datasets:z.array(LearningDatasetManifestSchema).max(100_000),updatedAt:z.string().datetime(),authority:z.literal(false).default(false),productionAuthority:z.literal(false).default(false),mayMintExecutionAuthority:z.literal(false).default(false)}).strict();
export type LearningDatasetVaultState=z.infer<typeof LearningDatasetVaultStateSchema>;

export const CieavLearningJobSchema=z.object({
  version:z.literal("CIEAV_LEARNING_JOB_V1"),jobId:z.string().min(8).max(200),providerId:z.string().min(1).max(200),method:LearningMethodSchema,datasetId:z.string().min(8).max(200),datasetDigest:DigestSchema,materializationDigest:DigestSchema,baseModel:z.string().min(1).max(500).optional(),outputScope:z.string().min(1).max(500),qualificationProfile:z.string().min(1).max(300),state:z.enum(["QUEUED","RUNNING","SUCCEEDED_UNQUALIFIED","FAILED","CANCELLED"]),createdAt:z.string().datetime(),startedAt:z.string().datetime().optional(),completedAt:z.string().datetime().optional(),candidateArtifacts:z.array(z.object({kind:z.enum(["CHECKPOINT","ADAPTER","REWARD_MODEL","REPORT"]),uri:z.string().min(1).max(2000),digest:z.string().min(16).max(256)}).strict()).max(100).default([]),metrics:z.record(z.string(),z.number()).default({}),error:z.string().max(1500).optional(),
  candidateQualified:z.literal(false).default(false),promotionExecuted:z.literal(false).default(false),authority:z.literal(false).default(false),productionAuthority:z.literal(false).default(false),mayMintExecutionAuthority:z.literal(false).default(false),mayPromoteModel:z.literal(false).default(false)
}).strict().superRefine((job,ctx)=>{
  if(job.state==="RUNNING"&&!job.startedAt)ctx.addIssue({code:z.ZodIssueCode.custom,path:["startedAt"],message:"running_learning_job_requires_started_at"});
  if(["SUCCEEDED_UNQUALIFIED","FAILED","CANCELLED"].includes(job.state)&&!job.completedAt)ctx.addIssue({code:z.ZodIssueCode.custom,path:["completedAt"],message:"terminal_learning_job_requires_completed_at"});
  if(job.state!=="SUCCEEDED_UNQUALIFIED"&&job.candidateArtifacts.length)ctx.addIssue({code:z.ZodIssueCode.custom,path:["candidateArtifacts"],message:"only_succeeded_unqualified_job_may_reference_candidates"});
});
export type CieavLearningJob=z.infer<typeof CieavLearningJobSchema>;

export const CieavLearningJobQueueStateSchema=z.object({version:z.literal("CIEAV_LEARNING_JOB_QUEUE_V1"),jobs:z.array(CieavLearningJobSchema).max(100_000),updatedAt:z.string().datetime(),authority:z.literal(false).default(false),productionAuthority:z.literal(false).default(false),mayMintExecutionAuthority:z.literal(false).default(false),mayPromoteModel:z.literal(false).default(false)}).strict();
export type CieavLearningJobQueueState=z.infer<typeof CieavLearningJobQueueStateSchema>;
