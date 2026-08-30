import {z} from "zod";
import {SemanticEffectSchema} from "./intent-reality.js";
import {EvidenceProviderBindingSchema,EvidenceQuorumPlanSchema,EvidenceQuorumRequirementSchema} from "./evidence-quorum.js";

const DigestSchema=z.string().regex(/^[0-9a-f]{64}$/);
const RefSchema=z.string().min(1).max(1000);
const RiskSchema=z.enum(["LOW","MEDIUM","HIGH","CRITICAL"]);

export const ConsequenceRelationSchema=z.enum(["EQUIVALENT","INDEPENDENT","COMMUTES","CONFLICTS","REQUIRES","INVALIDATES","SUPERSEDES","COMPENSATES","AGGREGATES_WITH","UNKNOWN_RELATION"]);
export type ConsequenceRelation=z.infer<typeof ConsequenceRelationSchema>;

export const RealityAddressSchema=z.object({version:z.literal("CIEAV_REALITY_ADDRESS_V1"),namespace:z.string().min(1).max(120),authorityDomain:z.string().min(1).max(300),resourceKind:z.string().min(1).max(120),stableId:z.string().min(1).max(1000),aliases:z.array(z.string().min(1).max(2000)).max(100).default([]),parentRefs:z.array(RefSchema).max(32).default([]),identityEvidenceRefs:z.array(RefSchema).min(1).max(100),resolverId:z.string().min(1).max(200),resolverVersion:z.string().min(1).max(100),digest:DigestSchema});
export type RealityAddress=z.infer<typeof RealityAddressSchema>;

export const ConsequenceFootprintSchema=z.object({version:z.literal("CIEAV_CONSEQUENCE_FOOTPRINT_V1"),realityRead:z.array(RefSchema).max(500).default([]),realityWrite:z.array(RefSchema).max(500).default([]),create:z.array(RefSchema).max(500).default([]),delete:z.array(RefSchema).max(500).default([]),grant:z.array(RefSchema).max(500).default([]),revoke:z.array(RefSchema).max(500).default([]),authorityUse:z.array(RefSchema).max(200).default([]),credentialUse:z.array(RefSchema).max(200).default([]),budgetDeltas:z.record(z.string().max(120),z.number().finite()).default({}),privacyExternalities:z.array(z.string().min(1).max(300)).max(100).default([]),proofDependencies:z.array(RefSchema).max(100).default([]),invariantsTouched:z.array(RefSchema).max(100).default([]),spatialRegion:z.string().max(1000).optional(),temporalWindow:z.object({start:z.string().datetime().optional(),end:z.string().datetime().optional()}).optional(),digest:DigestSchema});
export type ConsequenceFootprint=z.infer<typeof ConsequenceFootprintSchema>;

export const SemanticEffectIdentitySchema=z.object({version:z.literal("CIEAV_SEMANTIC_EFFECT_IDENTITY_V1"),effectClass:z.string().min(1).max(200),targetRealityRefs:z.array(RefSchema).min(1).max(100),transitionShape:z.string().min(1).max(2000),normalizedDeltaDigest:DigestSchema,invariantContextDigest:DigestSchema,equivalenceScope:z.string().min(1).max(500),resolverId:z.string().min(1).max(200),resolverVersion:z.string().min(1).max(100),digest:DigestSchema});
export type SemanticEffectIdentity=z.infer<typeof SemanticEffectIdentitySchema>;

export const ConsequenceMaterializationSchema=z.object({version:z.literal("CIEAV_CONSEQUENCE_MATERIALIZATION_V1"),id:z.string().uuid(),taskId:z.string().uuid(),intentId:z.string().uuid(),scopeDeviceId:z.string().min(8).max(200),principalRef:z.string().min(1).max(300),toolId:z.string().min(1).max(240),operation:z.string().min(1).max(240),routeProtocol:z.string().min(1).max(80),normalizedArgumentsDigest:DigestSchema,semanticEffect:SemanticEffectSchema,realityAddress:RealityAddressSchema,semanticIdentity:SemanticEffectIdentitySchema,footprint:ConsequenceFootprintSchema,worldBeforeDigest:DigestSchema,expectedPostStateDigest:DigestSchema,proofObligationDigest:DigestSchema,risk:RiskSchema,rootIntentRef:z.string().min(1).max(500),createdAt:z.string().datetime(),authority:z.literal(false).default(false)});
export type ConsequenceMaterialization=z.infer<typeof ConsequenceMaterializationSchema>;

export const ConsequenceRelationRuleSchema=z.object({
  id:z.string().uuid(),
  version:z.literal("CIEAV_CONSEQUENCE_RELATION_RULE_V1"),
  enabled:z.boolean().default(true),
  priority:z.number().int().min(-10000).max(10000).default(0),
  leftEffectClass:z.string().min(1).max(200),
  rightEffectClass:z.string().min(1).max(200),
  relation:ConsequenceRelationSchema.exclude(["UNKNOWN_RELATION"]),
  bidirectional:z.boolean().default(false),
  realityRefPrefix:z.string().min(1).max(1000).optional(),
  evidenceRefs:z.array(RefSchema).max(100).default([]),
  reason:z.string().min(1).max(1000),
  authority:z.literal(false).default(false)
});
export type ConsequenceRelationRule=z.infer<typeof ConsequenceRelationRuleSchema>;

export const ConsequenceInvariantSelectorSchema=z.object({
  effectClasses:z.array(z.string().min(1).max(200)).max(100).default([]),
  realityRefPrefixes:z.array(z.string().min(1).max(1000)).max(100).default([]),
  principalRefs:z.array(z.string().min(1).max(300)).max(100).default([]),
  minRisk:RiskSchema.optional()
});
export type ConsequenceInvariantSelector=z.infer<typeof ConsequenceInvariantSelectorSchema>;

export const ConsequenceInvariantRuleSchema=z.object({
  id:z.string().uuid(),
  version:z.literal("CIEAV_CONSEQUENCE_INVARIANT_RULE_V1"),
  enabled:z.boolean().default(true),
  kind:z.enum(["MAX_ACTIVE_MATCHES","MAX_CUMULATIVE_DELTA","MUTUAL_EXCLUSION"]),
  selector:ConsequenceInvariantSelectorSchema,
  maxActive:z.number().int().min(0).max(100000).optional(),
  budgetDimension:z.string().min(1).max(120).optional(),
  budgetLimit:z.number().finite().optional(),
  mutuallyExclusiveEffectClasses:z.array(z.string().min(1).max(200)).min(2).max(100).optional(),
  evidenceRefs:z.array(RefSchema).max(100).default([]),
  reason:z.string().min(1).max(1000),
  authority:z.literal(false).default(false)
}).superRefine((rule,ctx)=>{
  if(rule.kind==="MAX_ACTIVE_MATCHES"&&rule.maxActive===undefined)ctx.addIssue({code:z.ZodIssueCode.custom,path:["maxActive"],message:"MAX_ACTIVE_MATCHES requires maxActive"});
  if(rule.kind==="MAX_CUMULATIVE_DELTA"&&(rule.budgetDimension===undefined||rule.budgetLimit===undefined))ctx.addIssue({code:z.ZodIssueCode.custom,path:["budgetDimension"],message:"MAX_CUMULATIVE_DELTA requires budgetDimension and budgetLimit"});
  if(rule.kind==="MUTUAL_EXCLUSION"&&!rule.mutuallyExclusiveEffectClasses?.length)ctx.addIssue({code:z.ZodIssueCode.custom,path:["mutuallyExclusiveEffectClasses"],message:"MUTUAL_EXCLUSION requires effect classes"});
});
export type ConsequenceInvariantRule=z.infer<typeof ConsequenceInvariantRuleSchema>;

export const ConsequenceAlgebraPolicySchema=z.object({
  version:z.literal("CIEAV_CONSEQUENCE_ALGEBRA_POLICY_V1"),
  enabled:z.boolean().default(true),
  failClosedUnknown:z.boolean().default(true),
  reservationTtlSeconds:z.number().int().min(5).max(3600).default(60),
  proofabilityRisks:z.array(RiskSchema).max(4).default(["CRITICAL"]),
  proofProviderBindings:z.record(z.string().min(1).max(300),z.array(RefSchema).min(1).max(50)).default({}),
  evidenceProviders:z.array(EvidenceProviderBindingSchema).max(500).default([]),
  evidenceQuorumRequirements:z.array(EvidenceQuorumRequirementSchema).max(500).default([]),
  defaultAggregationLimits:z.record(z.string().min(1).max(120),z.number().finite()).default({}),
  aggregationWindowSeconds:z.number().int().min(60).max(2592000).default(86400),
  aggregationScope:z.enum(["ROOT_INTENT","PRINCIPAL_TARGET"]).default("ROOT_INTENT"),
  maxActiveConsequences:z.number().int().min(1).max(100000).default(10000),
  maxHistoryConsequences:z.number().int().min(100).max(500000).default(100000),
  authority:z.literal(false).default(false),
  mayMintExecutionAuthority:z.literal(false).default(false)
});
export type ConsequenceAlgebraPolicy=z.infer<typeof ConsequenceAlgebraPolicySchema>;

export const ConsequenceRelationResultSchema=z.object({version:z.literal("CIEAV_CONSEQUENCE_RELATION_V1"),leftId:z.string().uuid(),rightId:z.string().uuid(),relation:ConsequenceRelationSchema,basisDigest:DigestSchema,evidenceRefs:z.array(RefSchema).max(100).default([]),resolverId:z.string().min(1).max(200),resolverVersion:z.string().min(1).max(100),worldVersion:z.string().max(300).optional(),authority:z.literal(false).default(false)});
export type ConsequenceRelationResult=z.infer<typeof ConsequenceRelationResultSchema>;

export const ConsequenceCoordinationPlanSchema=z.object({
  version:z.literal("CIEAV_CONSEQUENCE_COORDINATION_PLAN_V1"),
  consequenceRef:z.string().uuid(),
  blockerConsequenceRefs:z.array(z.string().uuid()).max(1000).default([]),
  reconciliationConsequenceRefs:z.array(z.string().uuid()).max(1000).default([]),
  requiredPredecessorRefs:z.array(z.string().uuid()).max(1000).default([]),
  invalidatingConsequenceRefs:z.array(z.string().uuid()).max(1000).default([]),
  supersedingConsequenceRefs:z.array(z.string().uuid()).max(1000).default([]),
  compensationTargetRefs:z.array(z.string().uuid()).max(1000).default([]),
  commutativeConsequenceRefs:z.array(z.string().uuid()).max(1000).default([]),
  aggregationConsequenceRefs:z.array(z.string().uuid()).max(1000).default([]),
  unknownRelationRefs:z.array(z.string().uuid()).max(1000).default([]),
  planDigest:DigestSchema,
  authority:z.literal(false).default(false)
});
export type ConsequenceCoordinationPlan=z.infer<typeof ConsequenceCoordinationPlanSchema>;

export const InvariantCompatibilityWitnessSchema=z.object({version:z.literal("CIEAV_INVARIANT_COMPATIBILITY_V1"),consequenceRefs:z.array(z.string().uuid()).min(1).max(100),invariantRefs:z.array(RefSchema).max(100),worldVersion:z.string().min(1).max(300),compositionClass:z.string().min(1).max(200),result:z.enum(["PRESERVES","REQUIRES_COORDINATION","VIOLATES","UNKNOWN"]),basisDigest:DigestSchema,evidenceRefs:z.array(RefSchema).max(100).default([]),resolverId:z.string().min(1).max(200),resolverVersion:z.string().min(1).max(100),authority:z.literal(false).default(false)});
export type InvariantCompatibilityWitness=z.infer<typeof InvariantCompatibilityWitnessSchema>;

export const ConsequenceReservationSchema=z.object({id:z.string().uuid(),version:z.literal("CIEAV_CONSEQUENCE_RESERVATION_V1"),consequenceRef:z.string().uuid(),semanticEffectRef:DigestSchema,footprintDigest:DigestSchema,realityVersion:z.string().min(1).max(300),reservationClass:z.enum(["EXCLUSIVE_EFFECT","COMMUTATIVE_EFFECT","READ_STABILITY","BUDGET","SPATIAL_TEMPORAL","CONTINUING_EFFECT"]),ownerPrincipalRef:z.string().min(1).max(300),rootIntentRef:z.string().min(1).max(500),issuedAt:z.string().datetime(),expiresAt:z.string().datetime(),state:z.enum(["RESERVED","DISPATCHED","OBSERVING","RELEASED","QUARANTINED","EXPIRED"]),reason:z.string().min(1).max(1000),authority:z.literal(false).default(false)});
export type ConsequenceReservation=z.infer<typeof ConsequenceReservationSchema>;

export const ProofPlanReservationSchema=z.object({
  id:z.string().uuid(),
  version:z.literal("CIEAV_PROOF_PLAN_RESERVATION_V1"),
  consequenceRef:z.string().uuid(),
  proofObligationDigest:DigestSchema,
  providerBindings:z.array(RefSchema).min(1).max(50),
  providerVersionDigests:z.array(DigestSchema).max(50).default([]),
  requiredEvidenceClasses:z.array(z.string().min(1).max(200)).max(50).default([]),
  freshnessRequirements:z.array(z.string().min(1).max(500)).max(50).default([]),
  timeoutPolicy:z.string().min(1).max(500),
  fallbackPolicy:z.string().min(1).max(500),
  evidenceQuorumPlan:EvidenceQuorumPlanSchema.optional(),
  evidenceQuorumDigest:DigestSchema.optional(),
  issuedAt:z.string().datetime(),
  expiresAt:z.string().datetime(),
  authority:z.literal(false).default(false),
  mayMintExecutionAuthority:z.literal(false).default(false)
}).superRefine((value,ctx)=>{
  if(value.evidenceQuorumPlan&&value.evidenceQuorumDigest!==value.evidenceQuorumPlan.quorumDigest){
    ctx.addIssue({code:z.ZodIssueCode.custom,path:["evidenceQuorumDigest"],message:"evidenceQuorumDigest must match the embedded evidence quorum plan"});
  }
});
export type ProofPlanReservation=z.infer<typeof ProofPlanReservationSchema>;

export const CausalRealityFenceSchema=z.object({id:z.string().uuid(),version:z.literal("CIEAV_CAUSAL_REALITY_FENCE_V1"),consequenceRef:z.string().uuid(),predecessorConsequenceRefs:z.array(z.string().uuid()).min(1).max(100),requiredOutcomes:z.array(z.enum(["SUCCESS","FAILURE","UNKNOWN"])).min(1).max(3),requiredRealityClaims:z.array(RefSchema).max(100).default([]),minimumEvidenceClass:z.string().min(1).max(200),maxEvidenceAgeMs:z.number().int().positive().max(86_400_000),fenceDigest:DigestSchema,createdAt:z.string().datetime(),authority:z.literal(false).default(false)});
export type CausalRealityFence=z.infer<typeof CausalRealityFenceSchema>;

export const ConsequenceAggregationEntrySchema=z.object({id:z.string().uuid(),version:z.literal("CIEAV_CONSEQUENCE_AGGREGATION_V1"),principalRef:z.string().min(1).max(300),rootIntentRef:z.string().min(1).max(500),effectClass:z.string().min(1).max(200),targetRealityRefs:z.array(RefSchema).min(1).max(100),windowKey:z.string().min(1).max(300),dimensions:z.record(z.string().max(120),z.number().finite()),consequenceRef:z.string().uuid(),recordedAt:z.string().datetime(),authority:z.literal(false).default(false)});
export type ConsequenceAggregationEntry=z.infer<typeof ConsequenceAggregationEntrySchema>;

export const ActiveConsequenceNodeSchema=z.object({version:z.literal("CIEAV_ACTIVE_CONSEQUENCE_NODE_V1"),materialization:ConsequenceMaterializationSchema,state:z.enum(["MATERIALIZED","RESERVED","AUTHORIZED","COMMITTED","DISPATCHED","OBSERVING","QUARANTINED","SETTLED_SUCCESS","SETTLED_FAILURE","SETTLED_UNKNOWN","CANCELLED"]),reservationId:z.string().uuid().optional(),proofPlanReservationId:z.string().uuid().optional(),relationSnapshot:z.array(ConsequenceRelationResultSchema).max(1000).default([]),coordinationPlan:ConsequenceCoordinationPlanSchema.optional(),createdAt:z.string().datetime(),updatedAt:z.string().datetime(),settledAt:z.string().datetime().optional(),authority:z.literal(false).default(false)});
export type ActiveConsequenceNode=z.infer<typeof ActiveConsequenceNodeSchema>;

export const ConsequenceAlgebraAuditEventSchema=z.object({
  id:z.string().uuid(),
  version:z.literal("CIEAV_CONSEQUENCE_ALGEBRA_AUDIT_V1"),
  sequence:z.number().int().positive(),
  at:z.string().datetime(),
  type:z.enum(["POLICY_CHANGED","RELATION_RULE_CHANGED","INVARIANT_RULE_CHANGED","ADMISSION","STATE_CHANGED","SAFE_EXPIRY","RECOVERY","INTEGRITY_VERIFIED"]),
  consequenceRef:z.string().uuid().optional(),
  summary:z.string().min(1).max(1600),
  detailsDigest:DigestSchema,
  previousHash:DigestSchema.optional(),
  eventHash:DigestSchema,
  authority:z.literal(false).default(false)
});
export type ConsequenceAlgebraAuditEvent=z.infer<typeof ConsequenceAlgebraAuditEventSchema>;

export const AlgebraAdmissionSchema=z.object({version:z.literal("CIEAV_ALGEBRA_ADMISSION_V1"),consequenceRef:z.string().uuid(),decision:z.enum(["ADMIT","COORDINATE","BLOCK","RECONCILE"]),relations:z.array(ConsequenceRelationResultSchema).max(1000),invariantWitnesses:z.array(InvariantCompatibilityWitnessSchema).max(100),coordinationPlan:ConsequenceCoordinationPlanSchema.optional(),reservation:ConsequenceReservationSchema.optional(),proofPlanReservation:ProofPlanReservationSchema.optional(),reasons:z.array(z.string().min(1).max(1000)).min(1).max(100),authority:z.literal(false).default(false),executionAuthorityIssued:z.literal(false).default(false)});
export type AlgebraAdmission=z.infer<typeof AlgebraAdmissionSchema>;
