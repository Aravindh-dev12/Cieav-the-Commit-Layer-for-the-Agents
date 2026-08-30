import {z} from "zod";
import {ConsequenceRelationSchema} from "./consequence-algebra.js";

const DigestSchema=z.string().regex(/^[0-9a-f]{64}$/);
const RefSchema=z.string().min(1).max(1000);

export const RealityQuarantineDispositionSchema=z.enum(["RECONCILE","BLOCK","ALLOW","AGGREGATE"]);
export type RealityQuarantineDisposition=z.infer<typeof RealityQuarantineDispositionSchema>;

export const RealityQuarantineRelationSchema=z.object({
  consequenceRef:z.string().uuid(),
  relation:ConsequenceRelationSchema,
  basisDigest:DigestSchema,
  evidenceRefs:z.array(RefSchema).max(100).default([]),
  disposition:RealityQuarantineDispositionSchema
});
export type RealityQuarantineRelation=z.infer<typeof RealityQuarantineRelationSchema>;

export const RealityQuarantineClosureSchema=z.object({
  version:z.literal("CIEAV_REALITY_QUARANTINE_CLOSURE_V1"),
  sourceConsequenceRef:z.string().uuid(),
  sourceState:z.enum(["QUARANTINED","SETTLED_UNKNOWN"]),
  sourceSemanticEffectDigest:DigestSchema,
  sourceRealityRefs:z.array(RefSchema).min(1).max(100),
  status:z.enum(["OPEN","CLOSED"]),
  relationRuleSetDigest:DigestSchema,
  invariantRuleSetDigest:DigestSchema,
  affectedConsequenceRefs:z.array(z.string().uuid()).max(10000).default([]),
  affectedRealityRefs:z.array(RefSchema).max(10000).default([]),
  blockerConsequenceRefs:z.array(z.string().uuid()).max(10000).default([]),
  waiterConsequenceRefs:z.array(z.string().uuid()).max(10000).default([]),
  reconcileCandidateRefs:z.array(z.string().uuid()).max(10000).default([]),
  allowedIndependentConsequenceRefs:z.array(z.string().uuid()).max(10000).default([]),
  relationSnapshot:z.array(RealityQuarantineRelationSchema).max(10000).default([]),
  computedAt:z.string().datetime(),
  closedAt:z.string().datetime().optional(),
  resolution:z.enum(["SUCCESS","FAILURE"]).optional(),
  closureDigest:DigestSchema,
  authority:z.literal(false).default(false),
  mayMintExecutionAuthority:z.literal(false).default(false)
}).superRefine((closure,ctx)=>{
  if(closure.status==="OPEN"&&(closure.closedAt!==undefined||closure.resolution!==undefined))ctx.addIssue({code:z.ZodIssueCode.custom,path:["status"],message:"OPEN quarantine closure cannot contain closure resolution"});
  if(closure.status==="CLOSED"&&(closure.closedAt===undefined||closure.resolution===undefined))ctx.addIssue({code:z.ZodIssueCode.custom,path:["closedAt"],message:"CLOSED quarantine closure requires closedAt and resolution"});
});
export type RealityQuarantineClosure=z.infer<typeof RealityQuarantineClosureSchema>;
