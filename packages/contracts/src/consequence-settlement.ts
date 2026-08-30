import {z} from "zod";

const DigestSchema=z.string().regex(/^[0-9a-f]{64}$/);
const RefSchema=z.string().min(1).max(1000);

export const ConsequenceExecutionStateSchema=z.enum(["NOT_DISPATCHED","DISPATCHED","COMPLETED","INTERRUPTED"]);
export type ConsequenceExecutionState=z.infer<typeof ConsequenceExecutionStateSchema>;

export const ConsequenceRealityStateSchema=z.enum(["OBSERVED_SUCCESS","OBSERVED_FAILURE","UNKNOWN"]);
export type ConsequenceRealityState=z.infer<typeof ConsequenceRealityStateSchema>;

export const ConsequenceLegitimacyStateSchema=z.enum([
  "VALID",
  "AUTHORITY_REVOKED",
  "EVIDENCE_INVALIDATED",
  "TOOL_COMPROMISED",
  "POLICY_INVALIDATED",
  "CAUSALLY_TAINTED",
  "UNKNOWN_VALIDITY"
]);
export type ConsequenceLegitimacyState=z.infer<typeof ConsequenceLegitimacyStateSchema>;

export const ConsequenceEvidenceStateSchema=z.enum(["RESERVED","AVAILABLE","VERIFIED","CONFLICTING","STALE","UNAVAILABLE"]);
export type ConsequenceEvidenceState=z.infer<typeof ConsequenceEvidenceStateSchema>;

export const ConsequenceRecoveryStateSchema=z.enum(["NOT_REQUIRED","REQUIRED","IN_PROGRESS","RECOVERED","PARTIALLY_RECOVERED","IRREVERSIBLE","UNKNOWN"]);
export type ConsequenceRecoveryState=z.infer<typeof ConsequenceRecoveryStateSchema>;

export const ConsequenceSettlementSchema=z.object({
  id:z.string().uuid(),
  version:z.literal("CIEAV_CONSEQUENCE_SETTLEMENT_V2"),
  consequenceRef:z.string().uuid(),
  executionState:ConsequenceExecutionStateSchema,
  realityState:ConsequenceRealityStateSchema,
  legitimacyState:ConsequenceLegitimacyStateSchema,
  evidenceState:ConsequenceEvidenceStateSchema,
  recoveryState:ConsequenceRecoveryStateSchema,
  evidenceRefs:z.array(RefSchema).max(1000).default([]),
  basisRefs:z.array(RefSchema).max(1000).default([]),
  observedAt:z.string().datetime().optional(),
  legitimacyEvaluatedAt:z.string().datetime().optional(),
  recoveryUpdatedAt:z.string().datetime().optional(),
  createdAt:z.string().datetime(),
  updatedAt:z.string().datetime(),
  settlementDigest:DigestSchema,
  authority:z.literal(false).default(false),
  mayMintExecutionAuthority:z.literal(false).default(false)
}).superRefine((value,ctx)=>{
  if(value.realityState!=="UNKNOWN"&&!value.observedAt)ctx.addIssue({code:z.ZodIssueCode.custom,path:["observedAt"],message:"observedAt is required for observed reality states"});
  if(value.recoveryState!=="NOT_REQUIRED"&&!value.recoveryUpdatedAt)ctx.addIssue({code:z.ZodIssueCode.custom,path:["recoveryUpdatedAt"],message:"recoveryUpdatedAt is required once recovery is tracked"});
});
export type ConsequenceSettlement=z.infer<typeof ConsequenceSettlementSchema>;

export const ConsequenceSettlementTransitionSchema=z.object({
  version:z.literal("CIEAV_CONSEQUENCE_SETTLEMENT_TRANSITION_V1"),
  settlementRef:z.string().uuid(),
  consequenceRef:z.string().uuid(),
  previousDigest:DigestSchema,
  nextDigest:DigestSchema,
  reason:z.string().min(1).max(1600),
  evidenceRefs:z.array(RefSchema).max(1000).default([]),
  changedAxes:z.array(z.enum(["EXECUTION","REALITY","LEGITIMACY","EVIDENCE","RECOVERY"])).min(1).max(5),
  trustedRealityReconciliation:z.boolean().default(false),
  createdAt:z.string().datetime(),
  authority:z.literal(false).default(false),
  mayMintExecutionAuthority:z.literal(false).default(false)
});
export type ConsequenceSettlementTransition=z.infer<typeof ConsequenceSettlementTransitionSchema>;
