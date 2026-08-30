import {z} from "zod";
import {ConsequenceSettlementSchema} from "./consequence-settlement.js";

const DigestSchema=z.string().regex(/^[0-9a-f]{64}$/);
const RefSchema=z.string().min(1).max(2000);

export const CausalDependencyKindSchema=z.enum([
  "EVIDENCE",
  "AUTHORITY",
  "TOOL",
  "POLICY",
  "PREDECESSOR",
  "PROOF_PROVIDER",
  "RESOLVER",
  "SEMANTIC_COMPILER",
  "ADAPTER_RUNTIME",
  "MODEL_CONTEXT",
  "OTHER"
]);
export type CausalDependencyKind=z.infer<typeof CausalDependencyKindSchema>;

export const CausalProvenanceLinkSchema=z.object({
  id:z.string().uuid(),
  version:z.literal("CIEAV_CAUSAL_PROVENANCE_LINK_V1"),
  sourceRef:RefSchema,
  consequenceRef:z.string().uuid(),
  kind:CausalDependencyKindSchema,
  upstreamConsequenceRefs:z.array(z.string().uuid()).max(1000).default([]),
  evidenceRefs:z.array(RefSchema).max(1000).default([]),
  basisDigest:DigestSchema,
  createdAt:z.string().datetime(),
  authority:z.literal(false).default(false),
  mayMintExecutionAuthority:z.literal(false).default(false)
}).strict();
export type CausalProvenanceLink=z.infer<typeof CausalProvenanceLinkSchema>;

export const CausalRecallReasonSchema=z.enum([
  "EVIDENCE_INVALIDATED",
  "AUTHORITY_REVOKED",
  "TOOL_COMPROMISED",
  "POLICY_INVALIDATED",
  "PREDECESSOR_INVALIDATED",
  "PROOF_PROVIDER_COMPROMISED",
  "RESOLVER_COMPROMISED",
  "SEMANTIC_COMPILER_COMPROMISED",
  "ADAPTER_RUNTIME_COMPROMISED",
  "MODEL_CONTEXT_INVALIDATED",
  "OTHER"
]);
export type CausalRecallReason=z.infer<typeof CausalRecallReasonSchema>;

export const CausalRecallEventSchema=z.object({
  id:z.string().uuid(),
  version:z.literal("CIEAV_CAUSAL_RECALL_EVENT_V1"),
  reasonClass:CausalRecallReasonSchema,
  invalidatedRefs:z.array(RefSchema).min(1).max(1000),
  reason:z.string().min(1).max(2000),
  discoveredAt:z.string().datetime(),
  evidenceRefs:z.array(RefSchema).min(1).max(1000),
  eventDigest:DigestSchema,
  authority:z.literal(false).default(false),
  mayMintExecutionAuthority:z.literal(false).default(false)
}).strict();
export type CausalRecallEvent=z.infer<typeof CausalRecallEventSchema>;

export const ConsequenceRecoveryCapabilitySchema=z.object({
  consequenceRef:z.string().uuid(),
  disposition:z.enum(["RECONCILE","COMPENSATE","SAFE_STATE","MANUAL","IRREVERSIBLE"]),
  proposedEffectRefs:z.array(RefSchema).max(1000).default([]),
  evidenceRefs:z.array(RefSchema).max(1000).default([]),
  authority:z.literal(false).default(false)
}).strict();
export type ConsequenceRecoveryCapability=z.infer<typeof ConsequenceRecoveryCapabilitySchema>;

export const ProposedRecoveryProgramSchema=z.object({
  id:z.string().uuid(),
  version:z.literal("CIEAV_PROPOSED_RECOVERY_PROGRAM_V1"),
  recallEventRef:z.string().uuid(),
  sourceConsequenceRef:z.string().uuid(),
  disposition:z.enum(["RECONCILE","COMPENSATE","SAFE_STATE","MANUAL"]),
  prerequisiteConsequenceRefs:z.array(z.string().uuid()).max(1000).default([]),
  proposedEffectRefs:z.array(RefSchema).max(1000).default([]),
  reason:z.string().min(1).max(2000),
  requiresFreshAuthority:z.literal(true),
  authority:z.literal(false).default(false),
  mayMintExecutionAuthority:z.literal(false).default(false)
}).strict();
export type ProposedRecoveryProgram=z.infer<typeof ProposedRecoveryProgramSchema>;

export const ConsequenceRecoveryClosureSchema=z.object({
  id:z.string().uuid(),
  version:z.literal("CIEAV_CONSEQUENCE_RECOVERY_CLOSURE_V1"),
  recallEventRef:z.string().uuid(),
  directlyAffectedConsequenceRefs:z.array(z.string().uuid()).max(100000).default([]),
  transitivelyAffectedConsequenceRefs:z.array(z.string().uuid()).max(100000).default([]),
  futureConsequencesToBlock:z.array(z.string().uuid()).max(100000).default([]),
  recoverableConsequenceRefs:z.array(z.string().uuid()).max(100000).default([]),
  compensableConsequenceRefs:z.array(z.string().uuid()).max(100000).default([]),
  irreversibleConsequenceRefs:z.array(z.string().uuid()).max(100000).default([]),
  settlementSnapshots:z.array(ConsequenceSettlementSchema).max(100000).default([]),
  proposedRecoveryPrograms:z.array(ProposedRecoveryProgramSchema).max(100000).default([]),
  sourceDigest:DigestSchema,
  closureDigest:DigestSchema,
  computedAt:z.string().datetime(),
  authority:z.literal(false).default(false),
  mayMintExecutionAuthority:z.literal(false).default(false)
}).strict();
export type ConsequenceRecoveryClosure=z.infer<typeof ConsequenceRecoveryClosureSchema>;
