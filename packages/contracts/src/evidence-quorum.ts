import {z} from "zod";

const DigestSchema=z.string().regex(/^[0-9a-f]{64}$/);
const RefSchema=z.string().min(1).max(1000);
const RiskSchema=z.enum(["LOW","MEDIUM","HIGH","CRITICAL"]);

export const EvidenceProviderHealthSchema=z.enum(["AVAILABLE","DEGRADED","UNAVAILABLE"]);
export type EvidenceProviderHealth=z.infer<typeof EvidenceProviderHealthSchema>;

export const EvidenceProviderBindingSchema=z.object({
  version:z.literal("CIEAV_EVIDENCE_PROVIDER_BINDING_V1"),
  ref:RefSchema,
  enabled:z.boolean().default(true),
  versionDigest:DigestSchema,
  independenceDomain:z.string().min(1).max(300),
  evidenceClasses:z.array(z.string().min(1).max(200)).min(1).max(100),
  sourceClass:z.enum(["REMOTE_API","LOCAL_READBACK","SIGNED_RECEIPT","HARDWARE_ATTESTATION","HUMAN_ATTESTATION","SENSOR","LEDGER","OTHER"]),
  health:EvidenceProviderHealthSchema.default("AVAILABLE"),
  evidenceRefs:z.array(RefSchema).max(100).default([]),
  authority:z.literal(false).default(false),
  mayMintExecutionAuthority:z.literal(false).default(false)
});
export type EvidenceProviderBinding=z.infer<typeof EvidenceProviderBindingSchema>;

export const EvidenceQuorumRequirementSchema=z.object({
  id:z.string().uuid(),
  version:z.literal("CIEAV_EVIDENCE_QUORUM_REQUIREMENT_V1"),
  enabled:z.boolean().default(true),
  priority:z.number().int().min(-10000).max(10000).default(0),
  toolIds:z.array(z.string().min(1).max(240)).max(100).default([]),
  effectClasses:z.array(z.string().min(1).max(200)).max(100).default([]),
  minRisk:RiskSchema.optional(),
  minimumProviders:z.number().int().min(1).max(20).default(1),
  minimumIndependenceDomains:z.number().int().min(1).max(20).default(1),
  requiredEvidenceClasses:z.array(z.string().min(1).max(200)).max(50).default([]),
  maxEvidenceAgeMs:z.number().int().positive().max(86_400_000).default(300_000),
  timeoutOutcome:z.literal("UNKNOWN").default("UNKNOWN"),
  evidenceRefs:z.array(RefSchema).max(100).default([]),
  reason:z.string().min(1).max(1000),
  authority:z.literal(false).default(false),
  mayMintExecutionAuthority:z.literal(false).default(false)
}).superRefine((value,ctx)=>{
  if(value.minimumIndependenceDomains>value.minimumProviders){
    ctx.addIssue({code:z.ZodIssueCode.custom,path:["minimumIndependenceDomains"],message:"minimumIndependenceDomains cannot exceed minimumProviders"});
  }
});
export type EvidenceQuorumRequirement=z.infer<typeof EvidenceQuorumRequirementSchema>;

export const EvidenceQuorumPlanSchema=z.object({
  id:z.string().uuid(),
  version:z.literal("CIEAV_EVIDENCE_QUORUM_PLAN_V1"),
  consequenceRef:z.string().uuid(),
  proofObligationDigest:DigestSchema,
  requirementRef:z.string().uuid(),
  selectedProviderRefs:z.array(RefSchema).max(20),
  selectedProviderVersionDigests:z.record(RefSchema,DigestSchema),
  selectedIndependenceDomains:z.array(z.string().min(1).max(300)).max(20),
  requiredEvidenceClasses:z.array(z.string().min(1).max(200)).max(50),
  coveredEvidenceClasses:z.array(z.string().min(1).max(200)).max(100),
  minimumProviders:z.number().int().min(1).max(20),
  minimumIndependenceDomains:z.number().int().min(1).max(20),
  maxEvidenceAgeMs:z.number().int().positive().max(86_400_000),
  timeoutOutcome:z.literal("UNKNOWN"),
  availabilityState:z.enum(["SATISFIABLE","UNSATISFIABLE"]),
  unavailableReasons:z.array(z.string().min(1).max(1000)).max(100).default([]),
  quorumDigest:DigestSchema,
  issuedAt:z.string().datetime(),
  expiresAt:z.string().datetime(),
  authority:z.literal(false).default(false),
  mayMintExecutionAuthority:z.literal(false).default(false)
});
export type EvidenceQuorumPlan=z.infer<typeof EvidenceQuorumPlanSchema>;
