import { z } from "zod";

export const CieavPrincipalKindSchema = z.enum(["HUMAN","AGENT","SERVICE","ORGANIZATION","DEVICE"]);
export type CieavPrincipalKind = z.infer<typeof CieavPrincipalKindSchema>;

export const CieavPrincipalSchema = z.object({
  id: z.string().min(1).max(240),
  kind: CieavPrincipalKindSchema,
  displayName: z.string().min(1).max(240).optional(),
  provider: z.string().min(1).max(160).optional()
}).strict();
export type CieavPrincipal = z.infer<typeof CieavPrincipalSchema>;

export const CieavRiskValueSchema = z.enum(["LOW","MEDIUM","HIGH","CRITICAL"]);
export const CieavReversibilityValueSchema = z.enum(["REVERSIBLE","DELAYABLE","COMPENSABLE","IRREVERSIBLE","UNKNOWN"]);
export const CieavDataCategoryValueSchema = z.enum(["NONE","ACCOUNT","CONTACT","LOCATION","IDENTITY","FINANCIAL","HEALTH","CREDENTIAL","BIOMETRIC","FILE","MESSAGE","WORK","OTHER"]);

export const MoneySchema = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/),
  value: z.number().finite().nonnegative()
}).strict();
export type Money = z.infer<typeof MoneySchema>;

export const IntentConstraintsSchema = z.object({
  allowedActionTypes: z.array(z.string().min(1).max(160)).max(100).default([]),
  deniedActionTypes: z.array(z.string().min(1).max(160)).max(100).default([]),
  allowedTargets: z.array(z.string().min(1).max(500)).max(100).default([]),
  deniedTargets: z.array(z.string().min(1).max(500)).max(100).default([]),
  maxRisk: CieavRiskValueSchema.default("HIGH"),
  humanApprovalAtOrAbove: CieavRiskValueSchema.optional(),
  allowedDataCategories: z.array(CieavDataCategoryValueSchema).max(20).default(["NONE"]),
  allowExternalRecipients: z.boolean().default(false),
  maxAmount: MoneySchema.optional(),
  maxDelegationDepth: z.number().int().min(0).max(16).default(0),
  requireIndependentVerification: z.boolean().default(true)
}).strict();
export type IntentConstraints = z.infer<typeof IntentConstraintsSchema>;

export const IntentStatusSchema = z.enum(["ACTIVE","SATISFIED","CANCELLED","EXPIRED"]);
export const IntentContractSchema = z.object({
  id: z.string().uuid(),
  owner: CieavPrincipalSchema,
  goal: z.string().min(1).max(4000),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  status: IntentStatusSchema.default("ACTIVE"),
  constraints: IntentConstraintsSchema,
  completionCriteria: z.array(z.string().min(1).max(1000)).min(1).max(40),
  contextLabels: z.record(z.string().max(200)).default({})
}).strict();
export type IntentContract = z.infer<typeof IntentContractSchema>;

export const IntentCreateRequestSchema = z.object({
  owner: CieavPrincipalSchema,
  goal: z.string().min(1).max(4000),
  expiresAt: z.string().datetime().optional(),
  constraints: IntentConstraintsSchema,
  completionCriteria: z.array(z.string().min(1).max(1000)).min(1).max(40),
  contextLabels: z.record(z.string().max(200)).default({})
}).strict();
export type IntentCreateRequest = z.infer<typeof IntentCreateRequestSchema>;

export const EffectClassSchema = z.enum(["READ","COMMUNICATE","PUBLISH","FINANCIAL","DATA_TRANSFER","MUTATE","DELETE","ACCESS","IDENTITY","EXECUTE","OTHER"]);
export type EffectClass = z.infer<typeof EffectClassSchema>;

export const EffectDescriptorSchema = z.object({
  class: EffectClassSchema,
  operation: z.string().min(1).max(200),
  target: z.string().min(1).max(500).optional(),
  amount: MoneySchema.optional(),
  recipients: z.array(z.string().min(1).max(300)).max(50).default([]),
  dataCategories: z.array(CieavDataCategoryValueSchema).max(20).default(["NONE"]),
  reversibility: CieavReversibilityValueSchema,
  metadata: z.record(z.union([z.string().max(1000),z.number().finite(),z.boolean()])).default({})
}).strict();
export type EffectDescriptor = z.infer<typeof EffectDescriptorSchema>;

export const ActionProposalSchema = z.object({
  id: z.string().uuid(),
  intentId: z.string().uuid(),
  requestId: z.string().min(8).max(128),
  actor: CieavPrincipalSchema,
  delegationChain: z.array(CieavPrincipalSchema).max(16).default([]),
  actionType: z.string().min(1).max(160),
  summary: z.string().min(1).max(500),
  risk: CieavRiskValueSchema,
  effect: EffectDescriptorSchema,
  requestedAt: z.string().datetime()
}).strict();
export type ActionProposal = z.infer<typeof ActionProposalSchema>;

export const ProofEvidenceKindSchema = z.enum(["DOM_STATE","NETWORK","NAVIGATION","PAGE_MESSAGE","ELEMENT_STATE","API_READBACK","PAYMENT","EMAIL","CALENDAR","FILESYSTEM","DATABASE","TELEMETRY","EXTERNAL_RECEIPT","TOOL_RESULT","HUMAN_ATTESTATION","OTHER"]);
export type ProofEvidenceKind = z.infer<typeof ProofEvidenceKindSchema>;

export const ProofEvidenceSchema = z.object({
  kind: ProofEvidenceKindSchema,
  summary: z.string().min(1).max(1000),
  observedAt: z.string().datetime(),
  source: z.string().min(1).max(300).optional(),
  digest: z.string().max(256).optional(),
  confidence: z.number().min(0).max(1).default(1)
}).strict();
export type ProofEvidence = z.infer<typeof ProofEvidenceSchema>;

export const ConsequenceAssessmentSchema = z.object({
  directEffects: z.array(z.string().min(1).max(700)).min(1).max(30),
  secondOrderEffects: z.array(z.string().min(1).max(700)).max(30).default([]),
  blastRadius: CieavRiskValueSchema,
  confidence: z.number().min(0).max(1),
  verificationRequired: z.boolean(),
  verificationPlan: z.array(ProofEvidenceKindSchema).max(20).default([]),
  warnings: z.array(z.string().min(1).max(700)).max(30).default([])
}).strict();
export type ConsequenceAssessment = z.infer<typeof ConsequenceAssessmentSchema>;

export const AuthorityDecisionKindSchema = z.enum(["ALLOW","ASK","BLOCK"]);
export const AuthorityDecisionSchema = z.object({
  decision: AuthorityDecisionKindSchema,
  reasons: z.array(z.string().min(1).max(700)).min(1).max(30),
  humanApprovalRequired: z.boolean(),
  matchedConstraints: z.array(z.string().min(1).max(240)).max(30).default([]),
  evaluatedAt: z.string().datetime()
}).strict();
export type AuthorityDecision = z.infer<typeof AuthorityDecisionSchema>;

export const PermitSignatureAlgorithmSchema = z.enum(["Ed25519","HMAC-SHA256"]);
export const CommitPermitSchema = z.object({
  id: z.string().uuid(),
  proposalId: z.string().uuid(),
  intentId: z.string().uuid(),
  subject: CieavPrincipalSchema,
  effect: EffectDescriptorSchema,
  scopeHash: z.string().regex(/^[a-f0-9]{64}$/),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  maxUses: z.literal(1),
  signatureAlgorithm: PermitSignatureAlgorithmSchema,
  signatureKeyId: z.string().max(200).optional(),
  signingPublicKey: z.string().max(1000).optional(),
  signature: z.string().min(16).max(2048)
}).strict();
export type CommitPermit = z.infer<typeof CommitPermitSchema>;

export const SignedIntentContractSchema = z.object({
  intent: IntentContractSchema,
  signatureAlgorithm: PermitSignatureAlgorithmSchema,
  signatureKeyId: z.string().max(200).optional(),
  signingPublicKey: z.string().max(1000).optional(),
  signature: z.string().min(16).max(2048)
}).strict();
export type SignedIntentContract = z.infer<typeof SignedIntentContractSchema>;

export const VerificationStatusSchema = z.enum(["PROVEN","PARTIAL","PENDING","CONTRADICTED","UNKNOWN","FAILED"]);
export const VerificationResultSchema = z.object({
  status: VerificationStatusSchema,
  confidence: z.number().min(0).max(1),
  observedAt: z.string().datetime(),
  evidence: z.array(ProofEvidenceSchema).max(50).default([]),
  expectedState: z.array(z.string().min(1).max(1000)).max(40).default([]),
  observedState: z.array(z.string().min(1).max(1000)).max(40).default([])
}).strict();
export type VerificationResult = z.infer<typeof VerificationResultSchema>;

export const RecoveryKindSchema = z.enum(["UNDO","COMPENSATE","ESCALATE","NONE"]);
export const RecoveryPlanSchema = z.object({
  kind: RecoveryKindSchema,
  safeToAutoExecute: z.boolean(),
  steps: z.array(z.string().min(1).max(1000)).max(30).default([]),
  reason: z.string().min(1).max(1000)
}).strict();
export type RecoveryPlan = z.infer<typeof RecoveryPlanSchema>;

export const OpenLoopStatusSchema = z.enum(["OPEN","WAITING","BREACHED","RECOVERING","RESOLVED","CANCELLED"]);
export const OpenLoopSchema = z.object({
  id: z.string().uuid(),
  intentId: z.string().uuid(),
  receiptId: z.string().uuid().optional(),
  owner: CieavPrincipalSchema,
  expectedOutcome: z.string().min(1).max(2000),
  expectedBy: z.string().datetime().optional(),
  status: OpenLoopStatusSchema,
  createdAt: z.string().datetime(),
  lastCheckedAt: z.string().datetime().optional(),
  observedState: z.string().max(2000).optional(),
  resolution: z.string().max(2000).optional(),
  recovery: RecoveryPlanSchema.optional()
}).strict();
export type OpenLoop = z.infer<typeof OpenLoopSchema>;

export const OpenLoopCreateRequestSchema = z.object({
  intentId: z.string().uuid(),
  receiptId: z.string().uuid().optional(),
  owner: CieavPrincipalSchema,
  expectedOutcome: z.string().min(1).max(2000),
  expectedBy: z.string().datetime().optional()
}).strict();
export const OpenLoopUpdateRequestSchema = z.object({
  status: OpenLoopStatusSchema.optional(),
  lastCheckedAt: z.string().datetime().optional(),
  observedState: z.string().max(2000).optional(),
  resolution: z.string().max(2000).optional(),
  recovery: RecoveryPlanSchema.optional()
}).strict();

export const RealityEvaluateRequestSchema = z.object({
  intentId: z.string().uuid(),
  actor: CieavPrincipalSchema,
  delegationChain: z.array(CieavPrincipalSchema).max(16).default([]),
  amount: MoneySchema.optional()
}).strict();
