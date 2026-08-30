import {z} from "zod";

const DigestSchema=z.string().regex(/^[0-9a-f]{64}$/);
const RefSchema=z.string().min(1).max(2000);

export const ContinuityDimensionSchema=z.enum(["INTELLIGENCE","CONTEXT","TOOL","WORKFLOW","AUTHORITY","CONSEQUENCE","REALITY"]);
export type ContinuityDimension=z.infer<typeof ContinuityDimensionSchema>;

export const ContinuityStateSchema=z.enum(["PRESERVED","REQUIRES_REINTERPRETATION","REQUIRES_REAUTHORIZATION","REQUIRES_RECONCILIATION","BROKEN","UNKNOWN"]);
export type ContinuityState=z.infer<typeof ContinuityStateSchema>;

export const ModelExecutionProvenanceSchema=z.object({
  version:z.literal("CIEAV_MODEL_EXECUTION_PROVENANCE_V1"),
  provider:z.string().min(1).max(240),
  requestedModel:z.string().min(1).max(240),
  servingModel:z.string().min(1).max(240),
  servingModelSnapshot:z.string().min(1).max(240).optional(),
  fallbackOccurred:z.boolean(),
  fallbackReason:z.string().min(1).max(500).optional(),
  harnessId:z.string().min(1).max(240),
  harnessVersion:z.string().min(1).max(120),
  contextDigest:DigestSchema,
  toolSetDigest:DigestSchema,
  startedAt:z.string().datetime(),
  completedAt:z.string().datetime().optional(),
  provenanceDigest:DigestSchema,
  authority:z.literal(false),
  mayMintExecutionAuthority:z.literal(false)
}).strict();
export type ModelExecutionProvenance=z.infer<typeof ModelExecutionProvenanceSchema>;

export const ToolCapabilityEpochSchema=z.object({
  version:z.literal("CIEAV_TOOL_CAPABILITY_EPOCH_V1"),
  sessionRef:RefSchema,
  epoch:z.number().int().nonnegative(),
  previousToolSetDigest:DigestSchema.optional(),
  currentToolSetDigest:DigestSchema,
  addedToolRefs:z.array(RefSchema).max(1000).default([]),
  removedToolRefs:z.array(RefSchema).max(1000).default([]),
  authorityImpact:z.enum(["NONE","REQUIRES_REEVALUATION","INVALIDATES_EXISTING_AUTHORITY"]),
  createdAt:z.string().datetime(),
  epochDigest:DigestSchema,
  authority:z.literal(false)
}).strict();
export type ToolCapabilityEpoch=z.infer<typeof ToolCapabilityEpochSchema>;

export const ContinuityWitnessSchema=z.object({
  version:z.literal("CIEAV_CONTINUITY_WITNESS_V1"),
  dimension:ContinuityDimensionSchema,
  previousRef:RefSchema,
  currentRef:RefSchema,
  state:ContinuityStateSchema,
  basisDigest:DigestSchema,
  evidenceRefs:z.array(RefSchema).max(500).default([]),
  affectedConsequenceRefs:z.array(RefSchema).max(500).default([]),
  createdAt:z.string().datetime(),
  witnessDigest:DigestSchema,
  authority:z.literal(false),
  mayMintExecutionAuthority:z.literal(false)
}).strict();
export type ContinuityWitness=z.infer<typeof ContinuityWitnessSchema>;

export const AgentRuntimeProposalSchema=z.object({
  version:z.literal("CIEAV_AGENT_RUNTIME_PROPOSAL_V1"),
  id:z.string().uuid(),
  runtime:z.object({id:z.string().min(1).max(240),version:z.string().min(1).max(120),instanceRef:RefSchema,artifactDigest:DigestSchema.optional()}).strict(),
  modelProvenance:ModelExecutionProvenanceSchema.optional(),
  workflow:z.object({workflowId:z.string().min(1).max(500),workflowVersion:z.string().max(240).optional(),graphDigest:DigestSchema,nodeRef:RefSchema.optional()}).strict().optional(),
  taskRef:RefSchema,
  intentRef:RefSchema,
  subjectRef:RefSchema,
  requestedTool:z.object({toolId:z.string().min(1).max(240),protocol:z.string().min(1).max(80),operation:z.string().min(1).max(240),target:z.string().max(2000).optional(),argumentsDigest:DigestSchema}).strict(),
  predictedEffectDigests:z.array(DigestSchema).max(100).default([]),
  evidenceRefs:z.array(RefSchema).max(500).default([]),
  createdAt:z.string().datetime(),
  proposalDigest:DigestSchema,
  authority:z.literal(false),
  mayMintExecutionAuthority:z.literal(false)
}).strict();
export type AgentRuntimeProposal=z.infer<typeof AgentRuntimeProposalSchema>;

export const AgentRuntimeDecisionSchema=z.object({
  version:z.literal("CIEAV_AGENT_RUNTIME_DECISION_V1"),
  proposalRef:z.string().uuid(),
  consequenceBundleRef:RefSchema.optional(),
  canonicalRealityRefs:z.array(RefSchema).max(500).default([]),
  relationRefs:z.array(RefSchema).max(1000).default([]),
  continuityState:ContinuityStateSchema.optional(),
  proofabilityState:z.enum(["NOT_EVALUATED","AVAILABLE","UNAVAILABLE","DEGRADED","UNKNOWN"]).default("NOT_EVALUATED"),
  decision:z.enum(["ALLOW_FOR_AUTHORIZATION","ASK","BLOCK","WAIT","RECONCILE","REINTERPRET"]),
  reasonCodes:z.array(z.string().min(1).max(240)).min(1).max(100),
  createdAt:z.string().datetime(),
  decisionDigest:DigestSchema,
  executionAuthorityIssued:z.literal(false),
  authority:z.literal(false),
  mayMintExecutionAuthority:z.literal(false)
}).strict();
export type AgentRuntimeDecision=z.infer<typeof AgentRuntimeDecisionSchema>;
