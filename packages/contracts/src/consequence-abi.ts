import {z} from "zod";
import {AgentFrameworkSchema,FrameworkToolCallSchema} from "./framework-interop.js";
import {SemanticEffectSchema} from "./intent-reality.js";

const DigestSchema=z.string().regex(/^[0-9a-f]{64}$/);
const ConsequenceRiskSchema=z.enum(["LOW","MEDIUM","HIGH","CRITICAL"]);
const ConsequenceReversibilitySchema=z.enum(["REVERSIBLE","DELAYABLE","COMPENSABLE","IRREVERSIBLE","UNKNOWN"]);
export const ConsequenceSourceKindSchema=z.enum(["MCP","A2A","CLI","BROWSER","HTTP","GRPC","ROS2","MQTT","DESKTOP","CLOUD","DATABASE","FILESYSTEM","GIT","CUSTOM"]);
export type ConsequenceSourceKind=z.infer<typeof ConsequenceSourceKindSchema>;
export const ConsequencePrincipalSchema=z.object({kind:z.enum(["USER","AGENT","SERVICE","DEVICE","ORGANIZATION"]),id:z.string().min(1).max(300)}).strict();
export const ConsequenceDuplicateSemanticsSchema=z.enum(["RETRY_SAFE","IDEMPOTENCY_REQUIRED","RECONCILE_BEFORE_RETRY","NEVER_RETRY_AUTOMATICALLY"]);
export const ConsequenceUncertaintyPolicySchema=z.enum(["ALLOW_UNKNOWN","STOP_AND_RECONCILE","ESCALATE"]);

export const ConsequenceDescriptorSchema=z.object({
  version:z.literal("CIEAV_CONSEQUENCE_ABI_V1"),descriptorId:z.string().min(8).max(1200),
  source:z.object({kind:ConsequenceSourceKindSchema,framework:AgentFrameworkSchema.optional(),runId:z.string().max(500).optional(),callId:z.string().max(500).optional(),adapterManifestId:z.string().max(240).optional()}).strict(),
  principal:ConsequencePrincipalSchema,agentRef:z.string().max(300).optional(),modelRef:z.string().max(300).optional(),objective:z.string().min(1).max(5000),resource:z.string().min(1).max(2000),worldBeforeDigest:DigestSchema.optional(),operation:z.string().min(1).max(300),normalizedArgumentsDigest:DigestSchema,semanticEffect:SemanticEffectSchema,
  expectedEffects:z.array(z.string().min(1).max(1500)).max(100).default([]),authorityRequired:z.array(z.string().min(1).max(500)).max(100).default([]),safetyConstraints:z.array(z.string().min(1).max(1000)).max(100).default([]),proofObligations:z.array(z.string().min(1).max(1000)).max(100).default([]),duplicateSemantics:ConsequenceDuplicateSemanticsSchema,reversibility:ConsequenceReversibilitySchema,uncertaintyPolicy:ConsequenceUncertaintyPolicySchema,continuationConditions:z.array(z.string().min(1).max(1000)).max(100).default([]),recoveryContract:z.array(z.string().min(1).max(1000)).max(100).default([]),risk:ConsequenceRiskSchema,createdAt:z.string().datetime(),authority:z.literal(false).default(false),mayMintExecutionAuthority:z.literal(false).default(false),
}).strict();
export type ConsequenceDescriptor=z.infer<typeof ConsequenceDescriptorSchema>;

export const FrameworkConsequenceRequestSchema=z.object({
  call:FrameworkToolCallSchema,adapterManifestId:z.string().min(1).max(240),principal:ConsequencePrincipalSchema,objective:z.string().min(1).max(5000),resource:z.string().min(1).max(2000),expectedEffects:z.array(z.string().min(1).max(1500)).max(100).default([]),authorityRequired:z.array(z.string().min(1).max(500)).max(100).default([]),safetyConstraints:z.array(z.string().min(1).max(1000)).max(100).default([]),proofObligations:z.array(z.string().min(1).max(1000)).max(100).default([]),duplicateSemantics:ConsequenceDuplicateSemanticsSchema,reversibility:ConsequenceReversibilitySchema,uncertaintyPolicy:ConsequenceUncertaintyPolicySchema,continuationConditions:z.array(z.string().min(1).max(1000)).max(100).default([]),recoveryContract:z.array(z.string().min(1).max(1000)).max(100).default([]),risk:ConsequenceRiskSchema,worldBeforeDigest:DigestSchema.optional(),modelRef:z.string().max(300).optional(),authority:z.literal(false).default(false),
}).strict();
export type FrameworkConsequenceRequest=z.infer<typeof FrameworkConsequenceRequestSchema>;

export const ConsequenceAbiResultSchema=z.object({descriptor:ConsequenceDescriptorSchema,executionAuthorityIssued:z.literal(false),authority:z.literal(false),mayMintExecutionAuthority:z.literal(false)}).strict();
export type ConsequenceAbiResult=z.infer<typeof ConsequenceAbiResultSchema>;
