import {z} from "zod";
import {CognitiveCellPrivacySchema} from "./cognitive-runtime.js";

export const ApplicationModelProviderKindSchema=z.enum(["EXTERNAL_API","LOCAL_RUNTIME","QUALIFIED_CIEAV"]);
export type ApplicationModelProviderKind=z.infer<typeof ApplicationModelProviderKindSchema>;

export const ApplicationModelPurposeSchema=z.enum(["ROUTE","CLASSIFY","REASON","EXPLAIN","EXTRACT","CRITIQUE","DRAFT","PLAN"]);
export type ApplicationModelPurpose=z.infer<typeof ApplicationModelPurposeSchema>;

export const ApplicationContextKindSchema=z.enum(["USER_INPUT","FACT","RECORD","POLICY","PERMISSION","HISTORY","TOOL_RESULT","PROOF"]);
export type ApplicationContextKind=z.infer<typeof ApplicationContextKindSchema>;

export const ApplicationContextDatumSchema=z.object({
  kind:ApplicationContextKindSchema,
  sourceRef:z.string().min(1).max(1000),
  summary:z.string().min(1).max(8000),
  digest:z.string().regex(/^[0-9a-f]{64}$/).optional(),
  privacy:CognitiveCellPrivacySchema,
  verified:z.boolean().default(false),
}).strict();
export type ApplicationContextDatum=z.infer<typeof ApplicationContextDatumSchema>;

export const ApplicationToolDescriptorSchema=z.object({
  id:z.string().min(1).max(200),
  operations:z.array(z.string().min(1).max(200)).min(1).max(200),
  readOnly:z.boolean().default(false),
  consequenceClass:z.string().min(1).max(200).optional(),
  authority:z.literal(false).default(false),
  mayMintExecutionAuthority:z.literal(false).default(false),
}).strict();
export type ApplicationToolDescriptor=z.infer<typeof ApplicationToolDescriptorSchema>;

export const ApplicationModelProviderDescriptorSchema=z.object({
  version:z.literal("CIEAV_APPLICATION_MODEL_PROVIDER_V1"),
  id:z.string().min(1).max(200),
  kind:ApplicationModelProviderKindSchema,
  models:z.array(z.string().min(1).max(300)).min(1).max(200),
  local:z.boolean().default(false),
  privacyBoundary:CognitiveCellPrivacySchema,
  capabilities:z.array(z.string().min(1).max(200)).max(500).default([]),
  authority:z.literal(false).default(false),
  mayMintExecutionAuthority:z.literal(false).default(false),
}).strict();
export type ApplicationModelProviderDescriptor=z.infer<typeof ApplicationModelProviderDescriptorSchema>;

export const ApplicationModelProviderHealthSchema=z.object({
  ok:z.boolean(),
  providerId:z.string().min(1).max(200),
  checkedAt:z.string().datetime(),
  detail:z.string().max(1500).optional(),
  authority:z.literal(false).default(false),
}).strict();
export type ApplicationModelProviderHealth=z.infer<typeof ApplicationModelProviderHealthSchema>;

export const ApplicationModelInvocationRequestSchema=z.object({
  requestId:z.string().min(8).max(200),
  providerId:z.string().min(1).max(200),
  modelId:z.string().min(1).max(300),
  purpose:ApplicationModelPurposeSchema,
  objective:z.string().min(1).max(8000),
  context:z.array(ApplicationContextDatumSchema).max(500).default([]),
  tools:z.array(ApplicationToolDescriptorSchema).max(500).default([]),
  maxOutputTokens:z.number().int().positive().max(200000).default(4096),
  maxLatencyMs:z.number().int().positive().max(600000).default(30000),
  maxCostUsd:z.number().nonnegative().max(1000000).optional(),
  authority:z.literal(false).default(false),
  mayMintExecutionAuthority:z.literal(false).default(false),
}).strict();
export type ApplicationModelInvocationRequest=z.infer<typeof ApplicationModelInvocationRequestSchema>;

export const ApplicationToolProposalSchema=z.object({
  toolId:z.string().min(1).max(200),
  operation:z.string().min(1).max(200),
  target:z.string().max(2000).optional(),
  normalizedArgumentsDigest:z.string().regex(/^[0-9a-f]{64}$/),
  summary:z.string().min(1).max(2000),
  confidence:z.number().min(0).max(1),
  authority:z.literal(false).default(false),
  mayMintExecutionAuthority:z.literal(false).default(false),
}).strict();
export type ApplicationToolProposal=z.infer<typeof ApplicationToolProposalSchema>;

export const ApplicationModelUsageSchema=z.object({
  inputTokens:z.number().int().nonnegative().optional(),
  outputTokens:z.number().int().nonnegative().optional(),
  costUsd:z.number().nonnegative().optional(),
  latencyMs:z.number().int().nonnegative().optional(),
}).strict();
export type ApplicationModelUsage=z.infer<typeof ApplicationModelUsageSchema>;

export const ApplicationModelInvocationResultSchema=z.object({
  requestId:z.string().min(8).max(200),
  providerId:z.string().min(1).max(200),
  modelId:z.string().min(1).max(300),
  text:z.string().max(50000).optional(),
  structured:z.record(z.string(),z.unknown()).optional(),
  toolProposals:z.array(ApplicationToolProposalSchema).max(100).default([]),
  evidenceRefs:z.array(z.string().max(1000)).max(500).default([]),
  usage:ApplicationModelUsageSchema.default({}),
  authority:z.literal(false).default(false),
  mayMintExecutionAuthority:z.literal(false).default(false),
}).strict();
export type ApplicationModelInvocationResult=z.infer<typeof ApplicationModelInvocationResultSchema>;

export const ApplicationAgentRequestSchema=z.object({
  requestId:z.string().min(8).max(200),
  domain:z.string().min(1).max(200),
  objective:z.string().min(1).max(8000),
  providerId:z.string().min(1).max(200),
  modelId:z.string().min(1).max(300),
  purpose:ApplicationModelPurposeSchema.default("REASON"),
  context:z.array(ApplicationContextDatumSchema).max(500).default([]),
  tools:z.array(ApplicationToolDescriptorSchema).max(500).default([]),
  requireHumanApprovalForEffects:z.boolean().default(true),
  maxLatencyMs:z.number().int().positive().max(600000).default(30000),
  maxCostUsd:z.number().nonnegative().max(1000000).optional(),
  authority:z.literal(false).default(false),
  mayMintExecutionAuthority:z.literal(false).default(false),
}).strict();
export type ApplicationAgentRequest=z.infer<typeof ApplicationAgentRequestSchema>;

export const ApplicationAgentDecisionSchema=z.object({
  requestId:z.string().min(8).max(200),
  domain:z.string().min(1).max(200),
  kind:z.enum(["ANSWER","PROPOSAL","NEEDS_CONTEXT","REJECTED"]),
  text:z.string().max(50000).optional(),
  toolProposals:z.array(ApplicationToolProposalSchema).max(100).default([]),
  evidenceRefs:z.array(z.string().max(1000)).max(500).default([]),
  requiresApproval:z.boolean(),
  modelProviderId:z.string().min(1).max(200),
  modelId:z.string().min(1).max(300),
  authority:z.literal(false).default(false),
  mayMintExecutionAuthority:z.literal(false).default(false),
  executionAuthorityIssued:z.literal(false).default(false),
}).strict();
export type ApplicationAgentDecision=z.infer<typeof ApplicationAgentDecisionSchema>;
