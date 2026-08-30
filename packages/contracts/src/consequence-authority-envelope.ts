import {z} from "zod";
import {ConsequenceKindSchema} from "./commitment.js";

const DigestSchema=z.string().regex(/^[0-9a-f]{64}$/);
const RefSchema=z.string().min(1).max(2000);

export const ConsequenceAuthorityRouteSchema=z.object({
  routeId:z.string().min(1).max(240),
  toolId:z.string().min(1).max(240),
  protocol:z.string().min(1).max(80),
  operation:z.string().min(1).max(240),
  target:z.string().max(2000).nullable(),
  normalizedArgumentsDigest:DigestSchema,
  trustedToolBindingDigest:DigestSchema,
  canonicalRealityResolutionDigest:DigestSchema,
  routeDigest:DigestSchema,
  adapterArtifactDigest:DigestSchema.optional(),
  runtimeIdentityDigest:DigestSchema.optional(),
  authority:z.literal(false).default(false),
  mayMintExecutionAuthority:z.literal(false).default(false)
}).strict();
export type ConsequenceAuthorityRoute=z.infer<typeof ConsequenceAuthorityRouteSchema>;

export const ConsequenceAuthorityEnvelopeSchema=z.object({
  id:z.string().uuid(),
  version:z.literal("CIEAV_CONSEQUENCE_AUTHORITY_ENVELOPE_V1"),
  consequenceRef:z.string().uuid(),
  semanticIdentityDigest:DigestSchema,
  bundleDigest:DigestSchema,
  canonicalRealityRefs:z.array(RefSchema).min(1).max(200),
  permittedEffectClasses:z.array(ConsequenceKindSchema).min(1).max(64),
  permittedBudgetDeltas:z.record(z.string().min(1).max(120),z.number().finite()).default({}),
  invariantWitnessDigest:DigestSchema,
  reservationDigest:DigestSchema,
  proofPlanDigest:DigestSchema.nullable(),
  quarantineClosureDigests:z.array(DigestSchema).max(1000).default([]),
  quarantineSnapshotDigest:DigestSchema,
  authorityPolicyDigest:DigestSchema,
  trustedToolBindingDigest:DigestSchema,
  canonicalRealityResolutionDigest:DigestSchema,
  permittedRoutes:z.array(ConsequenceAuthorityRouteSchema).min(1).max(64),
  issuedAt:z.string().datetime(),
  expiresAt:z.string().datetime(),
  oneUse:z.literal(true),
  envelopeDigest:DigestSchema,
  authority:z.literal(true),
  authorityClass:z.literal("CONSEQUENCE_BOUND_EXECUTION"),
  mayMintExecutionAuthority:z.literal(false)
}).strict().superRefine((value,ctx)=>{
  if(new Set(value.canonicalRealityRefs).size!==value.canonicalRealityRefs.length)ctx.addIssue({code:z.ZodIssueCode.custom,path:["canonicalRealityRefs"],message:"canonical reality refs must be unique"});
  if(new Set(value.permittedEffectClasses).size!==value.permittedEffectClasses.length)ctx.addIssue({code:z.ZodIssueCode.custom,path:["permittedEffectClasses"],message:"permitted effect classes must be unique"});
  if(new Set(value.permittedRoutes.map(route=>route.routeId)).size!==value.permittedRoutes.length)ctx.addIssue({code:z.ZodIssueCode.custom,path:["permittedRoutes"],message:"permitted route ids must be unique"});
  if(Date.parse(value.expiresAt)<=Date.parse(value.issuedAt))ctx.addIssue({code:z.ZodIssueCode.custom,path:["expiresAt"],message:"authority envelope must expire after issuance"});
});
export type ConsequenceAuthorityEnvelope=z.infer<typeof ConsequenceAuthorityEnvelopeSchema>;
