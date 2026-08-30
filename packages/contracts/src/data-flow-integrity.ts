import {z} from "zod";

const DigestSchema=z.string().regex(/^[0-9a-f]{64}$/);
const RefSchema=z.string().min(1).max(1000);

export const DataFlowTrustSchema=z.enum([
  "TRUSTED_POLICY",
  "TRUSTED_OBSERVATION",
  "USER_ASSERTION",
  "TOOL_OUTPUT",
  "MODEL_INFERENCE",
  "EXTERNAL_UNTRUSTED"
]);
export type DataFlowTrust=z.infer<typeof DataFlowTrustSchema>;

export const DataFlowCategorySchema=z.enum([
  "NONE",
  "PUBLIC",
  "ACCOUNT",
  "CONTACT",
  "LOCATION",
  "IDENTITY",
  "FINANCIAL",
  "HEALTH",
  "CREDENTIAL",
  "BIOMETRIC",
  "FILE",
  "MESSAGE",
  "SOURCE_CODE",
  "WORK",
  "OTHER"
]);
export type DataFlowCategory=z.infer<typeof DataFlowCategorySchema>;

export const DataFlowLabelSchema=z.object({
  version:z.literal("CIEAV_DATA_FLOW_LABEL_V1"),
  labelId:z.string().uuid(),
  sourceRefs:z.array(RefSchema).min(1).max(1000),
  trust:DataFlowTrustSchema,
  categories:z.array(DataFlowCategorySchema).min(1).max(50),
  instructionalContent:z.boolean().default(false),
  secretBearing:z.boolean().default(false),
  provenanceRefs:z.array(RefSchema).max(1000).default([]),
  labelDigest:DigestSchema,
  authority:z.literal(false).default(false),
  mayMintExecutionAuthority:z.literal(false).default(false)
});
export type DataFlowLabel=z.infer<typeof DataFlowLabelSchema>;

export const DataFlowHopSchema=z.object({
  version:z.literal("CIEAV_DATA_FLOW_HOP_V1"),
  hopId:z.string().uuid(),
  fromRef:RefSchema,
  toRef:RefSchema,
  boundary:z.enum(["MODEL","MEMORY","TOOL","MCP","API","BROWSER","FILESYSTEM","DATABASE","NETWORK","HUMAN","OTHER"]),
  operation:z.string().min(1).max(300),
  inputLabelRefs:z.array(z.string().uuid()).min(1).max(1000),
  sanitized:z.boolean().default(false),
  sanitizationEvidenceRefs:z.array(RefSchema).max(100).default([]),
  createdAt:z.string().datetime(),
  authority:z.literal(false).default(false),
  mayMintExecutionAuthority:z.literal(false).default(false)
});
export type DataFlowHop=z.infer<typeof DataFlowHopSchema>;

export const DataSinkPolicySchema=z.object({
  id:z.string().uuid(),
  version:z.literal("CIEAV_DATA_SINK_POLICY_V1"),
  enabled:z.boolean().default(true),
  priority:z.number().int().min(-10000).max(10000).default(0),
  sinkRefPrefixes:z.array(z.string().min(1).max(1000)).max(100).default([]),
  sinkClasses:z.array(z.enum(["MODEL","MEMORY","TOOL","MCP","API","BROWSER","FILESYSTEM","DATABASE","NETWORK","HUMAN","OTHER"])).max(20).default([]),
  denyTrust:z.array(DataFlowTrustSchema).max(20).default([]),
  denyCategories:z.array(DataFlowCategorySchema).max(50).default([]),
  requireSanitizationForUntrustedInstructions:z.boolean().default(true),
  externalDisclosure:z.boolean().default(false),
  evidenceRefs:z.array(RefSchema).max(100).default([]),
  reason:z.string().min(1).max(1000),
  authority:z.literal(false).default(false),
  mayMintExecutionAuthority:z.literal(false).default(false)
});
export type DataSinkPolicy=z.infer<typeof DataSinkPolicySchema>;

export const DataFlowAssessmentSchema=z.object({
  version:z.literal("CIEAV_DATA_FLOW_ASSESSMENT_V1"),
  sinkRef:RefSchema,
  sinkClass:z.enum(["MODEL","MEMORY","TOOL","MCP","API","BROWSER","FILESYSTEM","DATABASE","NETWORK","HUMAN","OTHER"]),
  decision:z.enum(["ALLOW","BLOCK","REQUIRE_REVIEW"]),
  effectiveTrust:DataFlowTrustSchema,
  categories:z.array(DataFlowCategorySchema).max(50),
  instructionalContent:z.boolean(),
  secretBearing:z.boolean(),
  matchedPolicyRefs:z.array(z.string().uuid()).max(100),
  privacyExternalities:z.array(z.string().min(1).max(1000)).max(100),
  reasons:z.array(z.string().min(1).max(1000)).min(1).max(100),
  assessmentDigest:DigestSchema,
  authority:z.literal(false).default(false),
  mayMintExecutionAuthority:z.literal(false).default(false)
});
export type DataFlowAssessment=z.infer<typeof DataFlowAssessmentSchema>;
