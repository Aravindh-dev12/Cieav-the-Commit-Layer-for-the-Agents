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

export const LearningDatasetManifestSchema=z.object({
  version:z.literal("CIEAV_LEARNING_DATASET_MANIFEST_V1"),datasetId:z.string().min(8).max(200),datasetDigest:DigestSchema,purpose:z.enum(["OUTCOME_POLICY","RECOVERY","CALIBRATION"]),entries:z.array(LearningDatasetEntrySchema).min(1).max(1_000_000),eligibleMethods:z.array(LearningMethodSchema).max(20),createdAt:z.string().datetime(),
  authority:z.literal(false).default(false),productionAuthority:z.literal(false).default(false),mayMintExecutionAuthority:z.literal(false).default(false),mayPromoteModel:z.literal(false).default(false)
}).strict();
export type LearningDatasetManifest=z.infer<typeof LearningDatasetManifestSchema>;

export const LearningDatasetVaultStateSchema=z.object({version:z.literal("CIEAV_LEARNING_DATASET_VAULT_V1"),datasets:z.array(LearningDatasetManifestSchema).max(100_000),updatedAt:z.string().datetime(),authority:z.literal(false).default(false),productionAuthority:z.literal(false).default(false),mayMintExecutionAuthority:z.literal(false).default(false)}).strict();
export type LearningDatasetVaultState=z.infer<typeof LearningDatasetVaultStateSchema>;

export const CieavLearningJobSchema=z.object({
  version:z.literal("CIEAV_LEARNING_JOB_V1"),jobId:z.string().min(8).max(200),providerId:z.string().min(1).max(200),method:LearningMethodSchema,datasetId:z.string().min(8).max(200),datasetDigest:DigestSchema,baseModel:z.string().min(1).max(500).optional(),outputScope:z.string().min(1).max(500),qualificationProfile:z.string().min(1).max(300),state:z.enum(["QUEUED","RUNNING","SUCCEEDED_UNQUALIFIED","FAILED","CANCELLED"]),createdAt:z.string().datetime(),startedAt:z.string().datetime().optional(),completedAt:z.string().datetime().optional(),candidateArtifacts:z.array(z.object({kind:z.enum(["CHECKPOINT","ADAPTER","REWARD_MODEL","REPORT"]),uri:z.string().min(1).max(2000),digest:z.string().min(16).max(256)}).strict()).max(100).default([]),metrics:z.record(z.string(),z.number()).default({}),error:z.string().max(1500).optional(),
  candidateQualified:z.literal(false).default(false),promotionExecuted:z.literal(false).default(false),authority:z.literal(false).default(false),productionAuthority:z.literal(false).default(false),mayMintExecutionAuthority:z.literal(false).default(false),mayPromoteModel:z.literal(false).default(false)
}).strict().superRefine((job,ctx)=>{
  if(job.state==="RUNNING"&&!job.startedAt)ctx.addIssue({code:z.ZodIssueCode.custom,path:["startedAt"],message:"running_learning_job_requires_started_at"});
  if(["SUCCEEDED_UNQUALIFIED","FAILED","CANCELLED"].includes(job.state)&&!job.completedAt)ctx.addIssue({code:z.ZodIssueCode.custom,path:["completedAt"],message:"terminal_learning_job_requires_completed_at"});
  if(job.state!=="SUCCEEDED_UNQUALIFIED"&&job.candidateArtifacts.length)ctx.addIssue({code:z.ZodIssueCode.custom,path:["candidateArtifacts"],message:"only_succeeded_unqualified_job_may_reference_candidates"});
});
export type CieavLearningJob=z.infer<typeof CieavLearningJobSchema>;

export const CieavLearningJobQueueStateSchema=z.object({version:z.literal("CIEAV_LEARNING_JOB_QUEUE_V1"),jobs:z.array(CieavLearningJobSchema).max(100_000),updatedAt:z.string().datetime(),authority:z.literal(false).default(false),productionAuthority:z.literal(false).default(false),mayMintExecutionAuthority:z.literal(false).default(false),mayPromoteModel:z.literal(false).default(false)}).strict();
export type CieavLearningJobQueueState=z.infer<typeof CieavLearningJobQueueStateSchema>;
