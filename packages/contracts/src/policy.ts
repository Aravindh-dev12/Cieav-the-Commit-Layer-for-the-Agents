import {z} from "zod";
import {CieavPrincipalKindSchema,CieavRiskValueSchema,EffectClassSchema,MoneySchema} from "./reality.js";

export const EnterprisePolicyEffectSchema=z.enum(["DENY","REQUIRE_APPROVAL"]);
export type EnterprisePolicyEffect=z.infer<typeof EnterprisePolicyEffectSchema>;

export const PrincipalPolicyBindingSchema=z.object({
  principalId:z.string().min(1).max(240),
  roles:z.array(z.string().min(1).max(120)).max(100).default([]),
  attributes:z.record(z.string().max(300)).default({})
}).strict();
export type PrincipalPolicyBinding=z.infer<typeof PrincipalPolicyBindingSchema>;

export const EnterprisePolicyRuleSchema=z.object({
  id:z.string().uuid(),
  name:z.string().min(1).max(240),
  effect:EnterprisePolicyEffectSchema,
  actorKinds:z.array(CieavPrincipalKindSchema).max(5).default([]),
  actionTypes:z.array(z.string().min(1).max(160)).max(200).default([]),
  effectClasses:z.array(EffectClassSchema).max(20).default([]),
  targets:z.array(z.string().min(1).max(500)).max(200).default([]),
  dataCategoriesAny:z.array(z.string().min(1).max(80)).max(30).default([]),
  requiredRoles:z.array(z.string().min(1).max(120)).max(50).default([]),
  requiredAttributes:z.record(z.string().max(300)).default({}),
  minRisk:CieavRiskValueSchema.optional(),
  reason:z.string().min(1).max(700)
}).strict();
export type EnterprisePolicyRule=z.infer<typeof EnterprisePolicyRuleSchema>;

export const OrganizationPolicySchema=z.object({
  id:z.string().uuid(),
  organizationId:z.string().min(1).max(300),
  version:z.string().min(1).max(80),
  createdAt:z.string().datetime(),
  updatedAt:z.string().datetime(),
  enabled:z.boolean().default(true),
  bindings:z.array(PrincipalPolicyBindingSchema).max(20_000).default([]),
  deniedActionTypes:z.array(z.string().min(1).max(160)).max(500).default([]),
  deniedTargets:z.array(z.string().min(1).max(500)).max(500).default([]),
  deniedDataCategories:z.array(z.string().min(1).max(80)).max(50).default([]),
  maxRisk:CieavRiskValueSchema.optional(),
  maxAmount:MoneySchema.optional(),
  allowExternalRecipients:z.boolean().optional(),
  rules:z.array(EnterprisePolicyRuleSchema).max(2000).default([])
}).strict();
export type OrganizationPolicy=z.infer<typeof OrganizationPolicySchema>;

export const OrganizationPolicyCreateSchema=OrganizationPolicySchema.omit({id:true,createdAt:true,updatedAt:true});
export const OrganizationPolicyUpdateSchema=OrganizationPolicyCreateSchema.partial().omit({organizationId:true});

export const EnterprisePolicyDecisionSchema=z.object({
  decision:z.enum(["ALLOW","ASK","BLOCK"]),
  organizationId:z.string().min(1),
  policyId:z.string().uuid(),
  policyVersion:z.string(),
  reasons:z.array(z.string().min(1).max(700)).min(1).max(50),
  matchedRuleIds:z.array(z.string().uuid()).max(100).default([]),
  actorRoles:z.array(z.string().max(120)).max(100).default([]),
  evaluatedAt:z.string().datetime()
}).strict();
export type EnterprisePolicyDecision=z.infer<typeof EnterprisePolicyDecisionSchema>;
