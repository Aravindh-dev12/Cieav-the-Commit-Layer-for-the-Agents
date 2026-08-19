import {z} from "zod";
import {CommitmentPrincipalSchema} from "./commitment.js";

export const AgentTaskStateSchema=z.enum([
  "CREATED","QUEUED","PLANNING","WAITING_FOR_AUTHORITY","RUNNING","OBSERVING","WAITING","COMPLETED","FAILED","CANCELLED","RECOVERY_REQUIRED"
]);
export type AgentTaskState=z.infer<typeof AgentTaskStateSchema>;

export const AgentTaskEventTypeSchema=z.enum([
  "TASK_CREATED","STATE_CHANGED","COMMITMENT_REQUIRED","AUTHORITY_BOUND","REALITY_COMMIT_BOUND","REALITY_COMMIT_CONSUMED","EFFECT_QUARANTINED","QUARANTINE_RESOLVED","DRIFT_RECORDED","RETRY_SCHEDULED","DEADLINE_EXCEEDED","CANCELLED","RECOVERY_REQUIRED","OPEN_LOOP_DETECTED","PROOF_BOUND","SETTLED"
]);
export type AgentTaskEventType=z.infer<typeof AgentTaskEventTypeSchema>;

const AgentTaskMetadataValueSchema=z.union([z.string().max(2000),z.number(),z.boolean(),z.null()]);
const DigestSchema=z.string().regex(/^[0-9a-f]{64}$/);

export const AgentTaskSchema=z.object({
  id:z.string().uuid(),
  version:z.literal(1),
  scopeDeviceId:z.string().min(8).max(200),
  intentId:z.string().uuid(),
  sessionId:z.string().uuid().optional(),
  owner:CommitmentPrincipalSchema,
  actor:CommitmentPrincipalSchema,
  goal:z.string().min(1).max(4000),
  state:AgentTaskStateSchema,
  createdAt:z.string().datetime(),
  updatedAt:z.string().datetime(),
  deadlineAt:z.string().datetime().optional(),
  nextRunAt:z.string().datetime().optional(),
  retryCount:z.number().int().min(0).max(100),
  maxRetries:z.number().int().min(0).max(20),
  commitmentRequired:z.boolean(),
  commitmentId:z.string().uuid().optional(),
  authoritySatisfiedAt:z.string().datetime().optional(),
  realityBoundCommitId:z.string().uuid().optional(),
  realityCommitConsumedAt:z.string().datetime().optional(),
  effectKey:DigestSchema.optional(),
  effectQuarantined:z.boolean().default(false),
  proofCaseId:z.string().uuid().optional(),
  settlement:z.enum(["PROVEN","DISPROVEN","UNKNOWN"]).optional(),
  settledAt:z.string().datetime().optional(),
  openLoop:z.boolean(),
  lastError:z.string().max(2000).optional(),
  metadata:z.record(AgentTaskMetadataValueSchema).default({})
}).superRefine((task,ctx)=>{
  if(task.authoritySatisfiedAt&&!task.commitmentId)ctx.addIssue({code:z.ZodIssueCode.custom,path:["commitmentId"],message:"authoritySatisfiedAt requires commitmentId"});
  if(!task.commitmentRequired&&(task.commitmentId||task.authoritySatisfiedAt||task.realityBoundCommitId||task.realityCommitConsumedAt))ctx.addIssue({code:z.ZodIssueCode.custom,path:["commitmentRequired"],message:"commitment binding requires commitmentRequired=true"});
  if(task.realityCommitConsumedAt&&!task.realityBoundCommitId)ctx.addIssue({code:z.ZodIssueCode.custom,path:["realityBoundCommitId"],message:"consumed reality commit requires realityBoundCommitId"});
  if(task.realityBoundCommitId&&!task.effectKey)ctx.addIssue({code:z.ZodIssueCode.custom,path:["effectKey"],message:"realityBoundCommitId requires semantic effectKey"});
  if(task.effectQuarantined&&!task.effectKey)ctx.addIssue({code:z.ZodIssueCode.custom,path:["effectKey"],message:"quarantined task requires semantic effectKey"});
  if(task.settledAt&&!task.settlement)ctx.addIssue({code:z.ZodIssueCode.custom,path:["settlement"],message:"settledAt requires settlement"});
  if(task.state==="COMPLETED"&&task.settlement!=="PROVEN")ctx.addIssue({code:z.ZodIssueCode.custom,path:["settlement"],message:"COMPLETED requires PROVEN settlement"});
});
export type AgentTask=z.infer<typeof AgentTaskSchema>;

export const AgentTaskCreateSchema=z.object({
  scopeDeviceId:z.string().min(8).max(200),
  intentId:z.string().uuid(),
  sessionId:z.string().uuid().optional(),
  owner:CommitmentPrincipalSchema,
  actor:CommitmentPrincipalSchema,
  goal:z.string().min(1).max(4000),
  deadlineAt:z.string().datetime().optional(),
  maxRetries:z.number().int().min(0).max(20).default(2),
  metadata:z.record(AgentTaskMetadataValueSchema).default({})
}).strict();
export type AgentTaskCreate=z.infer<typeof AgentTaskCreateSchema>;

export const AgentTaskEventSchema=z.object({
  id:z.string().uuid(),
  taskId:z.string().uuid(),
  sequence:z.number().int().min(1),
  type:AgentTaskEventTypeSchema,
  at:z.string().datetime(),
  fromState:AgentTaskStateSchema.optional(),
  toState:AgentTaskStateSchema.optional(),
  reason:z.string().min(1).max(2000),
  commitmentId:z.string().uuid().optional(),
  data:z.record(AgentTaskMetadataValueSchema).default({})
});
export type AgentTaskEvent=z.infer<typeof AgentTaskEventSchema>;

export const AgentOpenLoopSchema=z.object({
  taskId:z.string().uuid(),
  state:AgentTaskStateSchema,
  detectedAt:z.string().datetime(),
  reasons:z.array(z.enum(["WAITING_FOR_AUTHORITY","WAITING_EXTERNAL","OBSERVATION_PENDING","RECOVERY_REQUIRED","EFFECT_QUARANTINED","DEADLINE_EXCEEDED","STALE_ACTIVE_TASK"])).min(1).max(10)
});
export type AgentOpenLoop=z.infer<typeof AgentOpenLoopSchema>;
