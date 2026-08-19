import {z} from "zod";
import {SemanticEffectSchema,RealityWitnessSchema} from "./intent-reality.js";

const DigestSchema=z.string().regex(/^[0-9a-f]{64}$/);
const RiskSchema=z.enum(["LOW","MEDIUM","HIGH","CRITICAL"]);

export const AgentAttestationMethodSchema=z.enum(["LOCAL_KEY","OIDC","MTLS","TPM","SECURE_ENCLAVE","EXTERNAL_SIGNED"]);
export const AgentIdentityAttestationSchema=z.object({
  id:z.string().uuid(),version:z.literal(1),subjectId:z.string().min(1).max(240),provider:z.string().min(1).max(160),method:AgentAttestationMethodSchema,
  keyId:z.string().min(1).max(240),publicKeyFingerprint:DigestSchema,claimsDigest:DigestSchema,issuedAt:z.string().datetime(),expiresAt:z.string().datetime(),
  issuer:z.string().min(1).max(240),signature:z.string().min(16).max(4096)
}).strict();
export type AgentIdentityAttestation=z.infer<typeof AgentIdentityAttestationSchema>;

export const ToolProtocolSchema=z.enum(["MCP","A2A","HTTP","BROWSER","CLI","FILESYSTEM","DATABASE","CLOUD_API"]);
export const CredentialModeSchema=z.enum(["NONE","CIEAV_INJECTED","DOWNSTREAM_OAUTH","MTLS","SIGNED_REQUEST"]);
export const FederatedToolSchema=z.object({
  id:z.string().min(1).max(240),displayName:z.string().min(1).max(240),protocol:ToolProtocolSchema,operation:z.string().min(1).max(240),
  downstreamRef:z.string().min(1).max(2000),credentialMode:CredentialModeSchema,risk:RiskSchema,
  consequenceCapable:z.boolean().default(true),proofSources:z.array(z.string().min(1).max(240)).max(30).default([]),enabled:z.boolean().default(true)
}).strict();
export type FederatedTool=z.infer<typeof FederatedToolSchema>;

export const ScopedCredentialLeaseSchema=z.object({
  id:z.string().uuid(),version:z.literal(1),sessionId:z.string().uuid(),identityAttestationId:z.string().uuid(),scopeDeviceId:z.string().min(8).max(200),
  audience:z.string().min(1).max(500),allowedIntentIds:z.array(z.string().uuid()).min(1).max(100),allowedToolIds:z.array(z.string().min(1).max(240)).min(1).max(200),
  allowedOperations:z.array(z.string().min(1).max(240)).min(1).max(200),maxRisk:RiskSchema,credentialRefDigest:DigestSchema,bindingDigest:DigestSchema,
  issuedAt:z.string().datetime(),expiresAt:z.string().datetime(),maxUses:z.number().int().min(1).max(10000),used:z.number().int().min(0).max(10000).default(0),revokedAt:z.string().datetime().optional()
}).strict();
export type ScopedCredentialLease=z.infer<typeof ScopedCredentialLeaseSchema>;

export const PermissionEffectSchema=z.enum(["ALLOW","ASK","DENY"]);
export const PermissionGraphEdgeSchema=z.object({
  id:z.string().uuid(),effect:PermissionEffectSchema,subjectIds:z.array(z.string().min(1).max(240)).min(1).max(100),intentIds:z.array(z.string().uuid()).min(1).max(100),
  toolIds:z.array(z.string().min(1).max(240)).min(1).max(200),operations:z.array(z.string().min(1).max(240)).min(1).max(200),targetPrefixes:z.array(z.string().max(1000)).max(100).default([]),
  maxRisk:RiskSchema,evidenceRefs:z.array(z.string().min(1).max(500)).min(1).max(100),reason:z.string().min(1).max(1000)
}).strict();
export type PermissionGraphEdge=z.infer<typeof PermissionGraphEdgeSchema>;
export const FormalPermissionGraphSchema=z.object({
  id:z.string().uuid(),version:z.literal(1),scopeDeviceId:z.string().min(8).max(200),rootIntentId:z.string().uuid(),defaultDecision:z.literal("DENY"),
  edges:z.array(PermissionGraphEdgeSchema).max(5000),createdAt:z.string().datetime(),updatedAt:z.string().datetime(),digest:DigestSchema
}).strict();
export type FormalPermissionGraph=z.infer<typeof FormalPermissionGraphSchema>;

export const FormalAuthorizationDecisionSchema=z.object({
  decision:z.enum(["ALLOW","ASK","BLOCK"]),graphDigest:DigestSchema,intentId:z.string().uuid(),subjectId:z.string().min(1).max(240),toolId:z.string().min(1).max(240),operation:z.string().min(1).max(240),
  matchedEdgeIds:z.array(z.string().uuid()).max(200),evidenceRefs:z.array(z.string().min(1).max(500)).max(200),reasons:z.array(z.string().min(1).max(1000)).min(1).max(100),evaluatedAt:z.string().datetime(),engine:z.literal("CIEAV_FORMAL_AUTH_V1")
}).strict();
export type FormalAuthorizationDecision=z.infer<typeof FormalAuthorizationDecisionSchema>;

export const ExecutionProposalSchema=z.object({
  id:z.string().uuid(),version:z.literal(1),taskId:z.string().uuid(),intentId:z.string().uuid(),scopeDeviceId:z.string().min(8).max(200),subjectId:z.string().min(1).max(240),
  identityAttestationId:z.string().uuid(),credentialLeaseId:z.string().uuid(),toolId:z.string().min(1).max(240),protocol:ToolProtocolSchema,operation:z.string().min(1).max(240),target:z.string().max(1000).optional(),risk:RiskSchema,
  normalizedArgumentsDigest:DigestSchema,semanticEffect:SemanticEffectSchema,realityWitness:RealityWitnessSchema,expectedPostStateDigest:DigestSchema,proofObligationDigest:DigestSchema,
  attenuationWitnessIds:z.array(z.string().uuid()).max(32).default([]),createdAt:z.string().datetime()
}).strict();
export type ExecutionProposal=z.infer<typeof ExecutionProposalSchema>;

export const ExecutionTicketSchema=z.object({
  id:z.string().uuid(),version:z.literal(1),proposalId:z.string().uuid(),intentId:z.string().uuid(),taskId:z.string().uuid(),toolId:z.string().min(1).max(240),
  authorizationDigest:DigestSchema,realityBoundCommitId:z.string().uuid(),credentialLeaseId:z.string().uuid(),routeDigest:DigestSchema,
  issuedAt:z.string().datetime(),expiresAt:z.string().datetime(),status:z.enum(["ISSUED","CONSUMED","INVALIDATED","EXPIRED"]),consumedAt:z.string().datetime().optional()
}).strict();
export type ExecutionTicket=z.infer<typeof ExecutionTicketSchema>;

export const ExecutionAuditPhaseSchema=z.enum(["IDENTITY","AUTHORIZE","STATE_REVALIDATE","COMMIT","ROUTE","EXECUTE","OBSERVE","SETTLE","RECOVER"]);
export const ExecutionAuditEventSchema=z.object({
  id:z.string().uuid(),version:z.literal(1),scopeDeviceId:z.string().min(8).max(200),intentId:z.string().uuid().optional(),taskId:z.string().uuid().optional(),proposalId:z.string().uuid().optional(),ticketId:z.string().uuid().optional(),
  phase:ExecutionAuditPhaseSchema,outcome:z.enum(["PASS","ASK","BLOCK","ERROR","PROVEN","DISPROVEN","UNKNOWN"]),summary:z.string().min(1).max(1200),detailsDigest:DigestSchema,
  previousHash:DigestSchema.optional(),eventHash:DigestSchema,createdAt:z.string().datetime()
}).strict();
export type ExecutionAuditEvent=z.infer<typeof ExecutionAuditEventSchema>;
