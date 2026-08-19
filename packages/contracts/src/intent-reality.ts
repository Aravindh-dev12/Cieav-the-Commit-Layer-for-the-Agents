import {z} from "zod";
import {ActionProposalSchema,CieavPrincipalSchema,EffectDescriptorSchema,IntentConstraintsSchema,ProofEvidenceKindSchema} from "./reality.js";

const Hex64Schema=z.string().regex(/^[a-f0-9]{64}$/);
const SafeValueSchema=z.union([z.string().max(2000),z.number().finite(),z.boolean(),z.null()]);

export const RealityStateFactSchema=z.object({
  key:z.string().min(1).max(300),
  valueHash:Hex64Schema,
  semanticLabel:z.string().max(300).optional()
}).strict();
export type RealityStateFact=z.infer<typeof RealityStateFactSchema>;

export const RealityStateWitnessSchema=z.object({
  id:z.string().uuid(),
  observedAt:z.string().datetime(),
  source:z.string().min(1).max(300),
  facts:z.array(RealityStateFactSchema).min(1).max(200),
  stateHash:Hex64Schema
}).strict();
export type RealityStateWitness=z.infer<typeof RealityStateWitnessSchema>;

export const ExpectedConsequenceSchema=z.object({
  summary:z.string().min(1).max(1000),
  effect:EffectDescriptorSchema,
  postconditions:z.array(z.string().min(1).max(1000)).min(1).max(50),
  proofKinds:z.array(ProofEvidenceKindSchema).min(1).max(20),
  consequenceHash:Hex64Schema
}).strict();
export type ExpectedConsequence=z.infer<typeof ExpectedConsequenceSchema>;

export const IntentRealityProfileSchema=z.object({
  intentId:z.string().uuid(),
  enabled:z.boolean().default(true),
  requireRealityBoundCommit:z.boolean().default(true),
  retryQuarantineOnUnknown:z.boolean().default(true),
  realityWitnessMaxAgeSeconds:z.number().int().min(1).max(300).default(30),
  maxCumulativeConsequenceDrift:z.number().min(0).max(1).default(.35),
  minimumIndependentProofSources:z.number().int().min(1).max(10).default(1),
  autonomyLearningEnabled:z.boolean().default(true),
  minimumVerifiedActionsForExpansion:z.number().int().min(1).max(10000).default(20),
  updatedAt:z.string().datetime()
}).strict();
export type IntentRealityProfile=z.infer<typeof IntentRealityProfileSchema>;

export const IntentAttenuationWitnessSchema=z.object({
  id:z.string().uuid(),
  rootIntentId:z.string().uuid(),
  parentWitnessId:z.string().uuid().optional(),
  parentScopeHash:Hex64Schema,
  childScopeHash:Hex64Schema,
  parentConstraints:IntentConstraintsSchema,
  childConstraints:IntentConstraintsSchema,
  authorityDelta:z.object({
    removedActionTypes:z.array(z.string().max(160)).max(100).default([]),
    removedTargets:z.array(z.string().max(500)).max(100).default([]),
    removedDataCategories:z.array(z.string().max(80)).max(30).default([]),
    maxRiskFrom:z.string().max(20),
    maxRiskTo:z.string().max(20),
    externalRecipientsFrom:z.boolean(),
    externalRecipientsTo:z.boolean(),
    maxDelegationDepthFrom:z.number().int().min(0).max(16),
    maxDelegationDepthTo:z.number().int().min(0).max(16),
    addedAuthority:z.literal(false)
  }).strict(),
  issuedAt:z.string().datetime(),
  signatureAlgorithm:z.literal("HMAC-SHA256"),
  signature:z.string().min(16).max(2048)
}).strict();
export type IntentAttenuationWitness=z.infer<typeof IntentAttenuationWitnessSchema>;

export const RealityBoundCommitPermitSchema=z.object({
  id:z.string().uuid(),
  taskId:z.string().uuid(),
  intentId:z.string().uuid(),
  proposalId:z.string().uuid(),
  subject:CieavPrincipalSchema,
  effect:EffectDescriptorSchema,
  effectKey:Hex64Schema,
  rootIntentHash:Hex64Schema,
  attenuationWitnessId:z.string().uuid().optional(),
  preStateHash:Hex64Schema,
  expectedConsequenceHash:Hex64Schema,
  proofKinds:z.array(ProofEvidenceKindSchema).min(1).max(20),
  issuedAt:z.string().datetime(),
  expiresAt:z.string().datetime(),
  maxUses:z.literal(1),
  signatureAlgorithm:z.literal("HMAC-SHA256"),
  signature:z.string().min(16).max(2048)
}).strict();
export type RealityBoundCommitPermit=z.infer<typeof RealityBoundCommitPermitSchema>;

export const RealityBoundCommitStatusSchema=z.enum(["ISSUED","CONSUMED","INVALIDATED_REALITY_CHANGED","EXPIRED"]);
export const RealityBoundCommitRecordSchema=z.object({
  scopeDeviceId:z.string().min(8).max(200),
  permit:RealityBoundCommitPermitSchema,
  status:RealityBoundCommitStatusSchema,
  createdAt:z.string().datetime(),
  consumedAt:z.string().datetime().optional(),
  invalidatedAt:z.string().datetime().optional(),
  invalidationReason:z.string().max(1000).optional()
}).strict();
export type RealityBoundCommitRecord=z.infer<typeof RealityBoundCommitRecordSchema>;

export const EffectQuarantineStatusSchema=z.enum(["OPEN","RESOLVED_APPLIED","RESOLVED_NOT_APPLIED","CANCELLED"]);
export const EffectQuarantineSchema=z.object({
  id:z.string().uuid(),
  scopeDeviceId:z.string().min(8).max(200),
  effectKey:Hex64Schema,
  intentId:z.string().uuid(),
  taskId:z.string().uuid(),
  commitId:z.string().uuid(),
  status:EffectQuarantineStatusSchema,
  reason:z.string().min(1).max(1000),
  createdAt:z.string().datetime(),
  resolvedAt:z.string().datetime().optional(),
  proofCaseId:z.string().uuid().optional(),
  resolutionNote:z.string().max(1000).optional()
}).strict();
export type EffectQuarantine=z.infer<typeof EffectQuarantineSchema>;

export const ConsequenceDriftEntrySchema=z.object({
  id:z.string().uuid(),
  scopeDeviceId:z.string().min(8).max(200),
  intentId:z.string().uuid(),
  taskId:z.string().uuid(),
  proposalId:z.string().uuid(),
  delta:z.number().min(0).max(1),
  cumulative:z.number().min(0).max(1000),
  budget:z.number().min(0).max(1),
  basis:z.array(z.string().min(1).max(500)).max(20).default([]),
  recordedAt:z.string().datetime()
}).strict();
export type ConsequenceDriftEntry=z.infer<typeof ConsequenceDriftEntrySchema>;

export const AuthoritySafetyReplaySchema=z.object({
  historicalActions:z.number().int().min(0),
  verifiedExpectedOutcomes:z.number().int().min(0),
  newlyAutonomousActions:z.number().int().min(0),
  deniedWouldBecomeAutonomous:z.number().int().min(0),
  disprovenWouldBecomeAutonomous:z.number().int().min(0),
  unknownWouldBecomeAutonomous:z.number().int().min(0),
  highCriticalWouldBecomeAutonomous:z.number().int().min(0)
}).strict();
export type AuthoritySafetyReplay=z.infer<typeof AuthoritySafetyReplaySchema>;

export const AutonomyCandidateStateSchema=z.enum(["CANDIDATE","RATIFIED","REJECTED","AUTO_CONTRACTED","EXPIRED"]);
export const AutonomyDirectionSchema=z.enum(["EXPAND","CONTRACT"]);
export const AutonomyCandidateSchema=z.object({
  id:z.string().uuid(),
  scopeDeviceId:z.string().min(8).max(200),
  intentId:z.string().uuid(),
  direction:AutonomyDirectionSchema,
  currentConstraints:IntentConstraintsSchema,
  candidateConstraints:IntentConstraintsSchema,
  candidateHash:Hex64Schema,
  replay:AuthoritySafetyReplaySchema,
  reason:z.string().min(1).max(1000),
  state:AutonomyCandidateStateSchema,
  createdAt:z.string().datetime(),
  decidedAt:z.string().datetime().optional(),
  decidedBy:CieavPrincipalSchema.optional()
}).strict();
export type AutonomyCandidate=z.infer<typeof AutonomyCandidateSchema>;

export const RealityCommitPrepareRequestSchema=z.object({
  proposal:ActionProposalSchema,
  preState:RealityStateWitnessSchema,
  expected:ExpectedConsequenceSchema,
  attenuationWitnessId:z.string().uuid().optional(),
  driftDelta:z.number().min(0).max(1).default(0),
  driftBasis:z.array(z.string().min(1).max(500)).max(20).default([]),
  ttlSeconds:z.number().int().min(5).max(120).default(30)
}).strict();
export type RealityCommitPrepareRequest=z.infer<typeof RealityCommitPrepareRequestSchema>;

export const RealityCommitConsumeRequestSchema=z.object({
  permit:RealityBoundCommitPermitSchema,
  currentState:RealityStateWitnessSchema
}).strict();
export type RealityCommitConsumeRequest=z.infer<typeof RealityCommitConsumeRequestSchema>;

export const EffectQuarantineReconcileRequestSchema=z.object({
  resolution:z.enum(["APPLIED","NOT_APPLIED","CANCEL"]),
  proofCaseId:z.string().uuid().optional(),
  note:z.string().max(1000).optional()
}).strict();

export const AutonomyCandidateCreateRequestSchema=z.object({
  intentId:z.string().uuid(),
  candidateConstraints:IntentConstraintsSchema,
  replay:AuthoritySafetyReplaySchema,
  reason:z.string().min(1).max(1000)
}).strict();

export const IntentAttenuationCreateRequestSchema=z.object({
  rootIntentId:z.string().uuid(),
  parentWitnessId:z.string().uuid().optional(),
  parentConstraints:IntentConstraintsSchema,
  childConstraints:IntentConstraintsSchema
}).strict();

export const IntentRealityDiagnosticSchema=z.object({
  platform:z.enum(["win32","darwin","linux","other"]),
  durableState:z.boolean(),
  realityBoundCommit:z.boolean(),
  semanticRetryQuarantine:z.boolean(),
  attenuationWitnesses:z.boolean(),
  consequenceDriftLedger:z.boolean(),
  proofGatedSettlement:z.boolean(),
  verifiedAutonomyRatchet:z.boolean(),
  details:z.record(SafeValueSchema).default({})
}).strict();
