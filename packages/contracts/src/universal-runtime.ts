import {z} from "zod";
import {AuthorizedOutcomeTrajectorySchema,ConsequenceOutcomeSchema,EpistemicClaimSchema} from "./consequence-intelligence.js";
import {CognitiveCellDescriptorSchema,GlobalWorkspaceSchema,WorkspaceContributionSchema} from "./cognitive-runtime.js";

export const ConsequenceGraphPersistedEdgeSchema=z.object({
  transitionKey:z.string().min(1).max(4096),
  operation:z.string().min(1).max(300),
  exactArgumentsDigest:z.string().min(16).max(256),
  observations:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  success:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  failure:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  unknown:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  proven:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  authorityGrade:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  realityBound:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  worldBeforeDigests:z.array(z.string().min(16).max(256)).max(10000).default([]),
  worldAfterDigests:z.array(z.string().min(16).max(256)).max(10000).default([]),
  authority:z.literal(false).default(false),
  mayMintExecutionAuthority:z.literal(false).default(false),
}).superRefine((edge,ctx)=>{
  if(edge.success+edge.failure+edge.unknown!==edge.observations)ctx.addIssue({code:z.ZodIssueCode.custom,message:"outcome_counts_must_equal_observations"});
  if(edge.proven>edge.observations)ctx.addIssue({code:z.ZodIssueCode.custom,message:"proven_count_exceeds_observations"});
  if(edge.authorityGrade>edge.observations)ctx.addIssue({code:z.ZodIssueCode.custom,message:"authority_grade_count_exceeds_observations"});
  if(edge.realityBound>edge.observations)ctx.addIssue({code:z.ZodIssueCode.custom,message:"reality_bound_count_exceeds_observations"});
});
export type ConsequenceGraphPersistedEdge=z.infer<typeof ConsequenceGraphPersistedEdgeSchema>;

export const ConsequenceGraphTrajectoryLedgerEntrySchema=z.object({
  trajectoryId:z.string().min(8).max(200),
  trajectoryDigest:z.string().regex(/^[0-9a-f]{64}$/),
  transitionKey:z.string().min(1).max(4096),
}).strict();
export type ConsequenceGraphTrajectoryLedgerEntry=z.infer<typeof ConsequenceGraphTrajectoryLedgerEntrySchema>;

export const ConsequenceGraphPersistedStateSchema=z.object({
  version:z.literal("CIEAV_CONSEQUENCE_GRAPH_STATE_V1"),
  edges:z.array(ConsequenceGraphPersistedEdgeSchema).max(100000),
  /**
   * Durable at-most-once ledger. Entries are never silently evicted: when the
   * fixed-capacity JSON state is full, ingestion fails closed until an explicit
   * storage migration/archival procedure is performed.
   */
  ingestedTrajectories:z.array(ConsequenceGraphTrajectoryLedgerEntrySchema).max(100000).default([]),
  authority:z.literal(false).default(false),
  mayMintExecutionAuthority:z.literal(false).default(false),
});
export type ConsequenceGraphPersistedState=z.infer<typeof ConsequenceGraphPersistedStateSchema>;

export const PersistedWorkspaceSchema=z.object({
  workspace:GlobalWorkspaceSchema,
  contributions:z.array(WorkspaceContributionSchema).max(10000),
});
export type PersistedWorkspace=z.infer<typeof PersistedWorkspaceSchema>;

export const UniversalIntelligencePersistedStateSchema=z.object({
  version:z.literal("CIEAV_UNIVERSAL_INTELLIGENCE_STATE_V1"),
  updatedAt:z.string().datetime(),
  cells:z.array(CognitiveCellDescriptorSchema).max(10000),
  claims:z.array(EpistemicClaimSchema).max(100000),
  workspaces:z.array(PersistedWorkspaceSchema).max(10000),
  consequenceGraph:ConsequenceGraphPersistedStateSchema,
  authority:z.literal(false).default(false),
  mayMintExecutionAuthority:z.literal(false).default(false),
});
export type UniversalIntelligencePersistedState=z.infer<typeof UniversalIntelligencePersistedStateSchema>;

export const IntelligencePlanRequestSchema=z.object({
  privacy:z.enum(["LOCAL_ONLY","REDACTED_REMOTE_ALLOWED","REMOTE_ALLOWED"]),
  now:z.string().datetime(),
  staleAfterMs:z.number().int().positive().max(86_400_000).optional(),
  currentRealityDigest:z.string().min(16).max(256).optional(),
  authorityEnvelopeRef:z.string().max(300).optional(),
  uncertainty:z.number().min(0).max(1).default(1),
  proofObligations:z.array(z.string().max(1000)).max(100).default([]),
  recoveryRequirements:z.array(z.string().max(1000)).max(100).default([]),
  budget:z.object({
    maxLatencyMs:z.number().int().positive().max(3_600_000).optional(),
    maxCostUsd:z.number().nonnegative().max(1_000_000).optional(),
    maxModelCalls:z.number().int().positive().max(1000).optional(),
  }).default({}),
  authority:z.literal(false).default(false),
  mayMintExecutionAuthority:z.literal(false).default(false),
});
export type IntelligencePlanRequest=z.infer<typeof IntelligencePlanRequestSchema>;

/** @deprecated External callers must use ticket-derived trusted ingestion. */
export const IntelligenceExperienceRequestSchema=z.object({
  trajectory:AuthorizedOutcomeTrajectorySchema,
  authority:z.literal(false).default(false),
  productionAuthority:z.literal(false).default(false),
});
export type IntelligenceExperienceRequest=z.infer<typeof IntelligenceExperienceRequestSchema>;

export const IntelligenceClaimEvidenceRequestSchema=z.object({
  kind:z.enum(["SUPPORT","CONTRADICT"]),
  evidence:z.object({
    kind:z.string().min(1).max(80),
    source:z.string().min(1).max(300),
    observedAt:z.string().datetime(),
    summary:z.string().min(1).max(1000),
    digest:z.string().min(16).max(256).optional(),
  }),
  authority:z.literal(false).default(false),
});

export const IntelligenceInvalidateRequestSchema=z.object({
  condition:z.string().min(1).max(500),
  observedAt:z.string().datetime(),
  authority:z.literal(false).default(false),
});

export const IntelligenceOutcomeSummarySchema=z.object({
  outcome:ConsequenceOutcomeSchema,
  authority:z.literal(false),
  mayMintExecutionAuthority:z.literal(false),
});
