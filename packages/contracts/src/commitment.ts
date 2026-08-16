import {z} from "zod";

const CommitmentRiskLevelSchema=z.enum(["LOW","MEDIUM","HIGH","CRITICAL"]);
const CommitmentReversibilitySchema=z.enum(["REVERSIBLE","DELAYABLE","COMPENSABLE","IRREVERSIBLE","UNKNOWN"]);

export const PrincipalKindSchema=z.enum(["HUMAN","AGENT","SERVICE","ORGANIZATION","DEVICE"]);
export type PrincipalKind=z.infer<typeof PrincipalKindSchema>;

export const CommitmentPrincipalSchema=z.object({
  id:z.string().min(1).max(300),
  kind:PrincipalKindSchema,
  displayName:z.string().min(1).max(300).optional(),
  provider:z.string().min(1).max(160).optional()
});
export type CommitmentPrincipal=z.infer<typeof CommitmentPrincipalSchema>;

export const CommitmentStateSchema=z.enum([
  "PROPOSED","AUTHORIZED","DISPATCHED","CLAIMED_COMPLETE","OBSERVING","PROVEN","DISPROVEN","UNKNOWN","RECOVERING","CANCELLED"
]);
export type CommitmentState=z.infer<typeof CommitmentStateSchema>;

export const ConsequenceKindSchema=z.enum([
  "READ","COMMUNICATE","CREATE","UPDATE","DELETE","PUBLISH","SHARE","GRANT_ACCESS","REVOKE_ACCESS","TRANSFER_VALUE","PURCHASE","LEGAL_COMMITMENT","DEPLOY","EXECUTE_CODE","OTHER"
]);
export type ConsequenceKind=z.infer<typeof ConsequenceKindSchema>;

export const ConsequenceNodeSchema=z.object({
  id:z.string().min(1).max(160),
  kind:ConsequenceKindSchema,
  summary:z.string().min(1).max(1000),
  target:z.string().min(1).max(500).optional(),
  affectedEntities:z.array(z.string().min(1).max(300)).max(50).default([]),
  dataCategories:z.array(z.string().min(1).max(120)).max(30).default([]),
  risk:CommitmentRiskLevelSchema,
  reversibility:CommitmentReversibilitySchema,
  external:z.boolean().default(false),
  monetaryAmount:z.object({currency:z.string().regex(/^[A-Z]{3}$/),value:z.number().nonnegative()}).optional(),
  dependsOn:z.array(z.string().min(1).max(160)).max(50).default([])
});
export type ConsequenceNode=z.infer<typeof ConsequenceNodeSchema>;

export const ConsequenceGraphSchema=z.object({
  version:z.literal(1),
  nodes:z.array(ConsequenceNodeSchema).min(1).max(200)
});
export type ConsequenceGraph=z.infer<typeof ConsequenceGraphSchema>;

export const ProofSignalKindSchema=z.enum([
  "DOM_STATE","NETWORK","NAVIGATION","PAGE_MESSAGE","ELEMENT_STATE","API_READBACK","PAYMENT","EMAIL","CALENDAR","FILESYSTEM","DATABASE","TELEMETRY","EXTERNAL_RECEIPT","TOOL_RESULT","HUMAN_ATTESTATION","OTHER"
]);
export type ProofSignalKind=z.infer<typeof ProofSignalKindSchema>;

export const ProofRequirementSchema=z.object({
  id:z.string().min(1).max(160),
  kind:ProofSignalKindSchema,
  description:z.string().min(1).max(1200),
  source:z.string().min(1).max(300).optional(),
  required:z.boolean().default(true),
  minimumConfidence:z.number().min(0).max(1).default(.8),
  independentOfActor:z.boolean().default(true)
});
export type ProofRequirement=z.infer<typeof ProofRequirementSchema>;

export const ProofObligationSchema=z.object({
  version:z.literal(1),
  requirements:z.array(ProofRequirementSchema).min(1).max(50),
  forbiddenShortcuts:z.array(z.string().min(1).max(500)).max(30).default([]),
  expiresAt:z.string().datetime().optional()
});
export type ProofObligation=z.infer<typeof ProofObligationSchema>;

export const RecoveryPolicySchema=z.object({
  kind:z.enum(["NONE","UNDO","COMPENSATE","ESCALATE","RETRY"]),
  requiresAuthorization:z.boolean().default(true),
  instructions:z.array(z.string().min(1).max(1000)).max(30).default([])
});
export type RecoveryPolicy=z.infer<typeof RecoveryPolicySchema>;

export const CommitmentSchema=z.object({
  id:z.string().uuid(),
  version:z.literal(1),
  intentId:z.string().uuid().optional(),
  owner:CommitmentPrincipalSchema,
  actor:CommitmentPrincipalSchema,
  authoritySource:z.string().min(1).max(500),
  summary:z.string().min(1).max(1000),
  desiredState:z.string().min(1).max(3000),
  createdAt:z.string().datetime(),
  expectedBy:z.string().datetime().optional(),
  state:CommitmentStateSchema,
  risk:CommitmentRiskLevelSchema,
  consequenceGraph:ConsequenceGraphSchema,
  proofObligation:ProofObligationSchema,
  recovery:RecoveryPolicySchema,
  metadata:z.record(z.union([z.string().max(2000),z.number(),z.boolean(),z.null()])).default({})
});
export type Commitment=z.infer<typeof CommitmentSchema>;

export const CommitmentEvidenceSchema=z.object({
  requirementId:z.string().min(1).max(160),
  kind:ProofSignalKindSchema,
  signal:z.enum(["SUPPORTS","CONTRADICTS","NEUTRAL"]),
  summary:z.string().min(1).max(1200),
  source:z.string().min(1).max(300),
  confidence:z.number().min(0).max(1),
  observedAt:z.string().datetime(),
  actorIndependent:z.boolean(),
  digest:z.string().max(256).optional()
});
export type CommitmentEvidence=z.infer<typeof CommitmentEvidenceSchema>;

export const CommitmentSettlementSchema=z.object({
  commitmentId:z.string().uuid(),
  status:z.enum(["PROVEN","DISPROVEN","UNKNOWN"]),
  settledAt:z.string().datetime(),
  evidence:z.array(CommitmentEvidenceSchema).max(200),
  satisfiedRequirementIds:z.array(z.string().min(1).max(160)).max(50),
  missingRequirementIds:z.array(z.string().min(1).max(160)).max(50),
  contradictedRequirementIds:z.array(z.string().min(1).max(160)).max(50),
  reason:z.string().min(1).max(2000)
});
export type CommitmentSettlement=z.infer<typeof CommitmentSettlementSchema>;

export const CommitCapabilitySchema=z.object({
  id:z.string().uuid(),
  commitmentId:z.string().uuid(),
  principal:CommitmentPrincipalSchema,
  consequenceGraphDigest:z.string().regex(/^[0-9a-f]{64}$/),
  proposalDigest:z.string().regex(/^[0-9a-f]{64}$/),
  proofObligationDigest:z.string().regex(/^[0-9a-f]{64}$/),
  allowedActionType:z.string().min(1).max(200),
  allowedTarget:z.string().min(1).max(1000).optional(),
  maxRisk:CommitmentRiskLevelSchema,
  issuedAt:z.string().datetime(),
  expiresAt:z.string().datetime(),
  singleUse:z.literal(true),
  nonce:z.string().min(24).max(256)
});
export type CommitCapability=z.infer<typeof CommitCapabilitySchema>;
