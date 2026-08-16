import {z} from "zod";
import {CommitCapabilitySchema,CommitmentEvidenceSchema} from "./commitment.js";
import {ToolProviderSchema} from "./tool-broker.js";

const JsonScalarSchema=z.union([z.string().max(8000),z.number(),z.boolean(),z.null()]);
const JsonValueSchema:z.ZodType<unknown>=z.lazy(()=>z.union([JsonScalarSchema,z.array(JsonValueSchema).max(500),z.record(z.string(),JsonValueSchema)]));

export const EffectProposalSchema=z.object({
  version:z.literal(1),
  requestId:z.string().uuid(),
  taskId:z.string().uuid().optional(),
  stepId:z.string().min(1).max(160).optional(),
  commitmentId:z.string().uuid(),
  toolId:z.string().min(1).max(300),
  provider:ToolProviderSchema,
  sourceId:z.string().min(1).max(300),
  sourceOperation:z.string().min(1).max(300),
  actionType:z.string().min(1).max(200),
  target:z.string().min(1).max(1000).optional(),
  input:JsonValueSchema,
  inputDigest:z.string().regex(/^[0-9a-f]{64}$/),
  catalogDigest:z.string().regex(/^[0-9a-f]{64}$/),
  consequenceGraphDigest:z.string().regex(/^[0-9a-f]{64}$/),
  proofObligationDigest:z.string().regex(/^[0-9a-f]{64}$/),
  createdAt:z.string().datetime()
}).strict();
export type EffectProposal=z.infer<typeof EffectProposalSchema>;

export const EffectDispatchAuthorizationSchema=z.object({
  capability:CommitCapabilitySchema,
  proposalDigest:z.string().regex(/^[0-9a-f]{64}$/),
  verifiedAt:z.string().datetime()
}).strict();
export type EffectDispatchAuthorization=z.infer<typeof EffectDispatchAuthorizationSchema>;

export const EffectReceiptStatusSchema=z.enum(["RESERVED","CLAIMED_COMPLETE","FAILED","UNKNOWN"]);
export type EffectReceiptStatus=z.infer<typeof EffectReceiptStatusSchema>;

export const EffectReceiptSchema=z.object({
  id:z.string().uuid(),
  requestId:z.string().uuid(),
  commitmentId:z.string().uuid(),
  capabilityId:z.string().uuid(),
  toolId:z.string().min(1).max(300),
  provider:ToolProviderSchema,
  sourceId:z.string().min(1).max(300),
  sourceOperation:z.string().min(1).max(300),
  proposalDigest:z.string().regex(/^[0-9a-f]{64}$/),
  inputDigest:z.string().regex(/^[0-9a-f]{64}$/),
  status:EffectReceiptStatusSchema,
  reservedAt:z.string().datetime(),
  completedAt:z.string().datetime().optional(),
  resultDigest:z.string().regex(/^[0-9a-f]{64}$/).optional(),
  errorClass:z.string().min(1).max(160).optional(),
  error:z.string().max(1000).optional(),
  authorityConsumed:z.literal(true),
  executionAuthority:z.literal(false)
}).strict();
export type EffectReceipt=z.infer<typeof EffectReceiptSchema>;

export const EffectObservationSchema=z.object({
  requestId:z.string().uuid(),
  commitmentId:z.string().uuid(),
  requirementId:z.string().min(1).max(160),
  kind:z.enum(["DOM_STATE","NETWORK","NAVIGATION","PAGE_MESSAGE","ELEMENT_STATE","API_READBACK","PAYMENT","EMAIL","CALENDAR","FILESYSTEM","DATABASE","TELEMETRY","EXTERNAL_RECEIPT","TOOL_RESULT","HUMAN_ATTESTATION","OTHER"]),
  signal:z.enum(["SUPPORTS","CONTRADICTS","NEUTRAL"]),
  summary:z.string().min(1).max(1200),
  source:z.string().min(1).max(300),
  confidence:z.number().min(0).max(1),
  observedAt:z.string().datetime(),
  actorIndependent:z.boolean(),
  digest:z.string().max(256).optional()
}).strict();
export type EffectObservation=z.infer<typeof EffectObservationSchema>;

export const EffectSettlementSchema=z.object({
  requestId:z.string().uuid(),
  commitmentId:z.string().uuid(),
  status:z.enum(["PROVEN","DISPROVEN","UNKNOWN"]),
  settledAt:z.string().datetime(),
  effectReceiptId:z.string().uuid(),
  evidence:z.array(CommitmentEvidenceSchema).max(200),
  reason:z.string().min(1).max(2000)
}).strict();
export type EffectSettlement=z.infer<typeof EffectSettlementSchema>;
