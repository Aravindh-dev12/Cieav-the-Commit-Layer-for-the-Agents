import {z} from "zod";

export const ToolProviderSchema=z.enum(["LOCAL","EFFECT_NODE","MCP","A2A","BROWSER"]);
export type ToolProvider=z.infer<typeof ToolProviderSchema>;

export const ToolConsequenceSchema=z.enum(["READ","COMMUNICATE","CREATE","UPDATE","DELETE","PUBLISH","SHARE","GRANT_ACCESS","REVOKE_ACCESS","TRANSFER_VALUE","PURCHASE","LEGAL_COMMITMENT","DEPLOY","EXECUTE_CODE","OTHER"]);
export type ToolConsequence=z.infer<typeof ToolConsequenceSchema>;

export const ToolDescriptorSchema=z.object({
  id:z.string().min(1).max(300),
  provider:ToolProviderSchema,
  sourceId:z.string().min(1).max(300),
  sourceOperation:z.string().min(1).max(300),
  name:z.string().min(1).max(200),
  description:z.string().min(1).max(2000),
  inputSchema:z.record(z.string(),z.unknown()).default({}),
  consequences:z.array(ToolConsequenceSchema).max(30).default([]),
  requiresCommitment:z.boolean(),
  readOnly:z.boolean(),
  externalEffect:z.boolean(),
  trust:z.enum(["CIEAV_INTERNAL","VERIFIED_NODE","TRUSTED_CONNECTOR","UNTRUSTED_REMOTE"]),
  available:z.boolean(),
  constraints:z.object({
    roots:z.array(z.string().min(1).max(2000)).max(50).default([]),
    hosts:z.array(z.string().min(1).max(500)).max(50).default([]),
    commands:z.array(z.string().min(1).max(500)).max(100).default([]),
    maxRuntimeMs:z.number().int().min(100).max(3_600_000).optional()
  }).strict(),
  metadata:z.record(z.union([z.string().max(1000),z.number(),z.boolean(),z.null()])).default({})
}).strict();
export type ToolDescriptor=z.infer<typeof ToolDescriptorSchema>;

export const ToolBrokerPolicySchema=z.object({
  allowedProviders:z.array(ToolProviderSchema).max(10).optional(),
  allowedToolIds:z.array(z.string().min(1).max(300)).max(500).optional(),
  allowedConsequences:z.array(ToolConsequenceSchema).max(30).optional(),
  allowExternalEffects:z.boolean().default(false),
  allowCommitmentRequired:z.boolean().default(true),
  maximumTools:z.number().int().min(1).max(1000).default(200)
}).strict();
export type ToolBrokerPolicy=z.infer<typeof ToolBrokerPolicySchema>;

export const ToolCatalogSchema=z.object({
  version:z.literal(1),
  generatedAt:z.string().datetime(),
  tools:z.array(ToolDescriptorSchema).max(1000),
  catalogDigest:z.string().regex(/^[0-9a-f]{64}$/),
  executionAuthority:z.literal(false)
}).strict();
export type ToolCatalog=z.infer<typeof ToolCatalogSchema>;
