import {z} from "zod";

export const AgentStepKindSchema=z.enum(["MODEL","MCP_GOVERNANCE","A2A_GOVERNANCE","WAIT","OBSERVE"]);
export type AgentStepKind=z.infer<typeof AgentStepKindSchema>;

export const AgentStepStateSchema=z.enum(["PENDING","WAITING_FOR_AUTHORITY","READY","DISPATCHED","OBSERVING","COMPLETED","FAILED","UNKNOWN","CANCELLED"]);
export type AgentStepState=z.infer<typeof AgentStepStateSchema>;

const RuntimeValueSchema=z.union([z.string().max(4000),z.number(),z.boolean(),z.null()]);

export const AgentPlanStepSchema=z.object({
  id:z.string().min(1).max(160),
  sequence:z.number().int().min(1).max(200),
  kind:AgentStepKindSchema,
  summary:z.string().min(1).max(1200),
  actionType:z.string().min(1).max(200).optional(),
  target:z.string().min(1).max(1000).optional(),
  consequential:z.boolean(),
  state:AgentStepStateSchema.default("PENDING"),
  commitmentId:z.string().uuid().optional(),
  attemptCount:z.number().int().min(0).max(100).default(0),
  lastAttemptAt:z.string().datetime().optional(),
  nextAttemptAt:z.string().datetime().optional(),
  lastError:z.string().max(2000).optional(),
  metadata:z.record(RuntimeValueSchema).default({})
});
export type AgentPlanStep=z.infer<typeof AgentPlanStepSchema>;

export const AgentRuntimePlanSchema=z.object({
  version:z.literal(1),
  taskId:z.string().uuid(),
  plannedAt:z.string().datetime(),
  planner:z.object({provider:z.string().min(1).max(160),model:z.string().min(1).max(300),protocolVersion:z.string().min(1).max(160),executionAuthority:z.literal(false),privacyReduced:z.literal(true)}),
  steps:z.array(AgentPlanStepSchema).min(1).max(200),
  planDigest:z.string().regex(/^[0-9a-f]{64}$/)
});
export type AgentRuntimePlan=z.infer<typeof AgentRuntimePlanSchema>;

export const AgentDispatchReceiptSchema=z.object({
  id:z.string().uuid(),
  taskId:z.string().uuid(),
  stepId:z.string().min(1).max(160),
  kind:AgentStepKindSchema,
  dispatchedAt:z.string().datetime(),
  completedAt:z.string().datetime(),
  ok:z.boolean(),
  transport:z.enum(["LOCAL","MCP","A2A","MODEL"]),
  executionAuthority:z.literal(false),
  commitmentId:z.string().uuid().optional(),
  resultDigest:z.string().regex(/^[0-9a-f]{64}$/).optional(),
  error:z.string().max(2000).optional()
});
export type AgentDispatchReceipt=z.infer<typeof AgentDispatchReceiptSchema>;
