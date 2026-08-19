import {z} from "zod";
import {CommitmentPrincipalSchema,ConsequenceKindSchema} from "./commitment.js";

const DigestSchema=z.string().regex(/^[0-9a-f]{64}$/);
export const RealityFactSchema=z.object({key:z.string().min(1).max(300),valueDigest:DigestSchema,source:z.string().min(1).max(300),observedAt:z.string().datetime()}).strict();
export type RealityFact=z.infer<typeof RealityFactSchema>;
export const RealityWitnessSchema=z.object({version:z.literal(1),observedAt:z.string().datetime(),facts:z.array(RealityFactSchema).min(1).max(200),digest:DigestSchema}).strict();
export type RealityWitness=z.infer<typeof RealityWitnessSchema>;

export const SemanticEffectSchema=z.object({kind:ConsequenceKindSchema,target:z.string().min(1).max(1000).optional(),objectRef:z.string().min(1).max(1000).optional(),amount:z.object({currency:z.string().regex(/^[A-Z]{3}$/),value:z.number().nonnegative()}).optional(),attributes:z.record(z.union([z.string().max(1000),z.number(),z.boolean(),z.null()])).default({})}).strict();
export type SemanticEffect=z.infer<typeof SemanticEffectSchema>;

const RiskSchema=z.enum(["LOW","MEDIUM","HIGH","CRITICAL"]);
export const AuthorityEnvelopeSchema=z.object({allowedActionTypes:z.array(z.string().min(1).max(200)).max(200).default([]),allowedTargets:z.array(z.string().min(1).max(1000)).max(200).default([]),maxRisk:RiskSchema,maxMonetaryAmount:z.object({currency:z.string().regex(/^[A-Z]{3}$/),value:z.number().nonnegative()}).optional(),maxDelegationDepth:z.number().int().min(0).max(32).default(0)}).strict();
export type AuthorityEnvelope=z.infer<typeof AuthorityEnvelopeSchema>;

export const IntentAttenuationWitnessSchema=z.object({id:z.string().uuid(),version:z.literal(1),rootIntentId:z.string().uuid(),parentDigest:DigestSchema,childDigest:DigestSchema,removedActionTypes:z.array(z.string().max(200)).max(200),removedTargets:z.array(z.string().max(1000)).max(200),depth:z.number().int().min(1).max(32),createdAt:z.string().datetime(),digest:DigestSchema}).strict();
export type IntentAttenuationWitness=z.infer<typeof IntentAttenuationWitnessSchema>;

export const ReversibilityEscrowSchema=z.object({
  id:z.string().uuid(),version:z.literal(1),taskId:z.string().uuid(),intentId:z.string().uuid(),effectKey:DigestSchema,
  inverseKind:z.enum(["RESTORE_SNAPSHOT","REPEAT_INVERSE","COMPENSATE","SITE_ADAPTER","MANUAL_RECOVERY"]),
  inverseDescriptorDigest:DigestSchema,preEffectSnapshotDigest:DigestSchema,inverseCapabilityDigest:DigestSchema.optional(),
  reservedAt:z.string().datetime(),reversibleUntil:z.string().datetime().optional(),activatedAt:z.string().datetime().optional(),releasedAt:z.string().datetime().optional(),
  state:z.enum(["RESERVED","ACTIVATED","RELEASED","INVALIDATED"]),
  reason:z.string().min(1).max(1200)
}).strict();
export type ReversibilityEscrow=z.infer<typeof ReversibilityEscrowSchema>;

export const RealityBoundCommitSchema=z.object({id:z.string().uuid(),version:z.literal(1),taskId:z.string().uuid(),intentId:z.string().uuid(),commitmentId:z.string().uuid(),principal:CommitmentPrincipalSchema,proposalDigest:DigestSchema,consequenceGraphDigest:DigestSchema,proofObligationDigest:DigestSchema,preStateDigest:DigestSchema,expectedPostStateDigest:DigestSchema,effectKey:DigestSchema,reversibilityEscrowId:z.string().uuid().optional(),issuedAt:z.string().datetime(),expiresAt:z.string().datetime(),consumedAt:z.string().datetime().optional(),status:z.enum(["ISSUED","CONSUMED","INVALIDATED","EXPIRED"])}).strict();
export type RealityBoundCommit=z.infer<typeof RealityBoundCommitSchema>;

export const EffectQuarantineSchema=z.object({id:z.string().uuid(),version:z.literal(1),effectKey:DigestSchema,taskId:z.string().uuid(),intentId:z.string().uuid(),reason:z.enum(["UNKNOWN_OUTCOME","CONFLICTING_EVIDENCE","REALITY_CHANGED"]),status:z.enum(["OPEN","RESOLVED"]),createdAt:z.string().datetime(),resolvedAt:z.string().datetime().optional(),resolution:z.string().min(1).max(2000).optional()}).strict();
export type EffectQuarantine=z.infer<typeof EffectQuarantineSchema>;

export const ConsequenceDriftSchema=z.object({cumulative:z.number().min(0),budget:z.number().min(0).max(10),lastIncrement:z.number().min(0).max(1),updatedAt:z.string().datetime(),basis:z.string().min(1).max(1000)}).strict();
export type ConsequenceDrift=z.infer<typeof ConsequenceDriftSchema>;

export const AutonomyCandidateSchema=z.object({id:z.string().uuid(),version:z.literal(1),scopeDeviceId:z.string().min(8).max(200),actionClass:z.string().min(1).max(200),proposedEnvelope:AuthorityEnvelopeSchema,evidence:z.object({proven:z.number().int().min(0),disproven:z.number().int().min(0),unknown:z.number().int().min(0),undone:z.number().int().min(0)}),historicalReplay:z.object({evaluated:z.number().int().min(0),previouslyDeniedWouldAllow:z.number().int().min(0),criticalWouldAllow:z.number().int().min(0)}),state:z.enum(["CANDIDATE","RATIFIED","REJECTED"]),createdAt:z.string().datetime(),decidedAt:z.string().datetime().optional()}).strict();
export type AutonomyCandidate=z.infer<typeof AutonomyCandidateSchema>;
