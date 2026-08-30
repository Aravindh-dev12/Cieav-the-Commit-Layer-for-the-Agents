import {z} from "zod";
import {ConsequenceKindSchema} from "./commitment.js";
import {SemanticEffectSchema} from "./intent-reality.js";
import {ConsequenceFootprintSchema,RealityAddressSchema} from "./consequence-algebra.js";

const DigestSchema=z.string().regex(/^[0-9a-f]{64}$/);
const RefSchema=z.string().min(1).max(2000);
const EffectRoleSchema=z.enum(["PRIMARY","SECONDARY","CONDITIONAL","DEFERRED"]);

const ConsequenceBundleEffectObjectSchema=z.object({
  id:z.string().min(1).max(240),
  role:EffectRoleSchema,
  kind:ConsequenceKindSchema,
  semanticEffect:SemanticEffectSchema,
  realityAddresses:z.array(RealityAddressSchema).min(1).max(100),
  footprint:ConsequenceFootprintSchema,
  conditionRef:RefSchema.optional(),
  notBefore:z.string().datetime().optional(),
  dependsOn:z.array(z.string().min(1).max(240)).max(100).default([]),
  atomicityGroup:z.string().min(1).max(240).optional(),
  authority:z.literal(false).default(false)
}).strict();

export const ConsequenceBundleEffectSchema=ConsequenceBundleEffectObjectSchema.superRefine((effect,ctx)=>{
  if(effect.role==="CONDITIONAL"&&!effect.conditionRef)ctx.addIssue({code:z.ZodIssueCode.custom,path:["conditionRef"],message:"conditional consequence requires conditionRef"});
});
export type ConsequenceBundleEffect=z.infer<typeof ConsequenceBundleEffectSchema>;

const PrimaryConsequenceBundleEffectSchema=ConsequenceBundleEffectObjectSchema.extend({role:z.literal("PRIMARY")}).strict();
const SecondaryConsequenceBundleEffectSchema=ConsequenceBundleEffectObjectSchema.extend({role:z.literal("SECONDARY")}).strict();
const ConditionalConsequenceBundleEffectSchema=ConsequenceBundleEffectObjectSchema.extend({role:z.literal("CONDITIONAL")}).strict().superRefine((effect,ctx)=>{
  if(!effect.conditionRef)ctx.addIssue({code:z.ZodIssueCode.custom,path:["conditionRef"],message:"conditional consequence requires conditionRef"});
});
const DeferredConsequenceBundleEffectSchema=ConsequenceBundleEffectObjectSchema.extend({role:z.literal("DEFERRED")}).strict();

export const ConsequencePrivacyExternalitySchema=z.object({
  sourceRef:RefSchema,
  dataCategory:z.string().min(1).max(160),
  sinkRef:RefSchema,
  purpose:z.string().min(1).max(500),
  exposure:z.enum(["INTERNAL","THIRD_PARTY","PUBLIC","DEVICE","UNKNOWN"]),
  required:z.boolean(),
  authority:z.literal(false).default(false)
}).strict();

export const ConsequenceBudgetDeltaSchema=z.object({dimension:z.string().min(1).max(120),delta:z.number().finite(),unit:z.string().min(1).max(80),scopeRef:RefSchema,authority:z.literal(false).default(false)}).strict();
export const ConsequenceAuthorityUseSchema=z.object({authorityRef:RefSchema,scopeRef:RefSchema,operation:z.string().min(1).max(240),consumes:z.boolean().default(true),authority:z.literal(false).default(false)}).strict();
export const ConsequenceProofRequirementSchema=z.object({id:z.string().min(1).max(240),effectIds:z.array(z.string().min(1).max(240)).min(1).max(100),evidenceClass:z.string().min(1).max(200),independentOfActor:z.boolean().default(true),freshnessMs:z.number().int().positive().max(604800000).optional(),providerRefs:z.array(RefSchema).max(50).default([]),onUnavailable:z.literal("UNKNOWN"),authority:z.literal(false).default(false)}).strict();
export const ConsequenceRecoveryEdgeSchema=z.object({id:z.string().min(1).max(240),fromEffectIds:z.array(z.string().min(1).max(240)).min(1).max(100),trigger:z.enum(["OBSERVED_FAILURE","UNKNOWN","PARTIAL_SUCCESS","POLICY_REVOKED"]),kind:z.enum(["COMPENSATE","RECONCILE","ESCALATE","SAFE_STATE","NO_AUTOMATIC_RECOVERY"]),inverseEffectIds:z.array(z.string().min(1).max(240)).max(100).default([]),requiresFreshAuthority:z.boolean().default(true),authority:z.literal(false).default(false)}).strict();
export const ConsequenceAtomicityGroupSchema=z.object({id:z.string().min(1).max(240),effectIds:z.array(z.string().min(1).max(240)).min(1).max(100),mode:z.enum(["ATOMIC","SAGA","BEST_EFFORT","EXTERNAL_TRANSACTION"]),failurePolicy:z.enum(["ABORT","COMPENSATE","RECONCILE","UNKNOWN"]),authority:z.literal(false).default(false)}).strict();

export const ConsequenceBundleSchema=z.object({
  version:z.literal("CIEAV_CONSEQUENCE_BUNDLE_V1"),
  id:z.string().uuid(),
  invocationRef:z.string().min(1).max(500),
  taskId:z.string().uuid(),
  intentId:z.string().uuid(),
  scopeDeviceId:z.string().min(8).max(200),
  principalRef:z.string().min(1).max(300),
  toolId:z.string().min(1).max(240),
  operation:z.string().min(1).max(240),
  normalizedArgumentsDigest:DigestSchema,
  trustedToolBindingDigest:DigestSchema,
  compilerId:z.string().min(1).max(240),
  compilerVersion:z.string().min(1).max(120),
  compilerDigest:DigestSchema,
  primaryEffects:z.array(PrimaryConsequenceBundleEffectSchema).min(1).max(100),
  secondaryEffects:z.array(SecondaryConsequenceBundleEffectSchema).max(100).default([]),
  conditionalEffects:z.array(ConditionalConsequenceBundleEffectSchema).max(100).default([]),
  deferredEffects:z.array(DeferredConsequenceBundleEffectSchema).max(100).default([]),
  privacyExternalities:z.array(ConsequencePrivacyExternalitySchema).max(200).default([]),
  budgetDeltas:z.array(ConsequenceBudgetDeltaSchema).max(200).default([]),
  authorityUses:z.array(ConsequenceAuthorityUseSchema).max(200).default([]),
  proofRequirements:z.array(ConsequenceProofRequirementSchema).max(200).default([]),
  recoveryEdges:z.array(ConsequenceRecoveryEdgeSchema).max(200).default([]),
  atomicityGroups:z.array(ConsequenceAtomicityGroupSchema).max(100).default([]),
  createdAt:z.string().datetime(),
  bundleDigest:DigestSchema,
  authority:z.literal(false).default(false),
  mayMintExecutionAuthority:z.literal(false).default(false)
}).strict().superRefine((bundle,ctx)=>{
  const effects=[...bundle.primaryEffects,...bundle.secondaryEffects,...bundle.conditionalEffects,...bundle.deferredEffects];
  const ids=effects.map(e=>e.id),idSet=new Set(ids);
  if(idSet.size!==ids.length)ctx.addIssue({code:z.ZodIssueCode.custom,path:["primaryEffects"],message:"consequence bundle effect ids must be unique"});
  for(const effect of effects)for(const dependency of effect.dependsOn)if(!idSet.has(dependency))ctx.addIssue({code:z.ZodIssueCode.custom,path:["primaryEffects"],message:`unknown consequence dependency:${dependency}`});
  for(const proof of bundle.proofRequirements)for(const effectId of proof.effectIds)if(!idSet.has(effectId))ctx.addIssue({code:z.ZodIssueCode.custom,path:["proofRequirements"],message:`unknown proof effect:${effectId}`});
  for(const edge of bundle.recoveryEdges){for(const effectId of edge.fromEffectIds)if(!idSet.has(effectId))ctx.addIssue({code:z.ZodIssueCode.custom,path:["recoveryEdges"],message:`unknown recovery source effect:${effectId}`});for(const effectId of edge.inverseEffectIds)if(!idSet.has(effectId))ctx.addIssue({code:z.ZodIssueCode.custom,path:["recoveryEdges"],message:`unknown inverse effect:${effectId}`})}
  for(const group of bundle.atomicityGroups)for(const effectId of group.effectIds)if(!idSet.has(effectId))ctx.addIssue({code:z.ZodIssueCode.custom,path:["atomicityGroups"],message:`unknown atomicity effect:${effectId}`});
});
export type ConsequenceBundle=z.infer<typeof ConsequenceBundleSchema>;
