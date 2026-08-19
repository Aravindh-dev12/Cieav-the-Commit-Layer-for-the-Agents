import {z} from "zod";
import {ToolProtocolSchema} from "./execution-fabric.js";

const DigestSchema=z.string().regex(/^[0-9a-f]{64}$/);

export const InterpositionModeSchema=z.enum(["OBSERVE","GOVERNED","MANDATORY"]);
export type InterpositionMode=z.infer<typeof InterpositionModeSchema>;

export const CredentialExposureSchema=z.enum(["NONE","CIEAV_ONLY","AGENT_VISIBLE"]);
export const InterpositionRouteSchema=z.object({
  id:z.string().min(1).max(240),
  toolId:z.string().min(1).max(240),
  protocol:ToolProtocolSchema,
  consequenceCapable:z.boolean(),
  managedByCieav:z.boolean(),
  directAccessDeclared:z.boolean().default(false),
  credentialExposure:CredentialExposureSchema,
  enabled:z.boolean().default(true),
  evidenceRefs:z.array(z.string().min(1).max(500)).max(100).default([])
}).strict();
export type InterpositionRoute=z.infer<typeof InterpositionRouteSchema>;

export const InterpositionPostureSchema=z.object({
  version:z.literal(1),
  mode:InterpositionModeSchema,
  routes:z.array(InterpositionRouteSchema).max(10000),
  ready:z.boolean(),
  reasons:z.array(z.string().min(1).max(1200)).max(1000),
  evaluatedAt:z.string().datetime(),
  digest:DigestSchema
}).strict();
export type InterpositionPosture=z.infer<typeof InterpositionPostureSchema>;

export const OperationMandateStatusSchema=z.enum(["ISSUED","CONSUMED","INVALIDATED","EXPIRED"]);
export const OperationMandateSchema=z.object({
  id:z.string().uuid(),
  version:z.literal(1),
  rootIntentId:z.string().uuid(),
  taskId:z.string().uuid(),
  proposalId:z.string().uuid(),
  subjectId:z.string().min(1).max(240),
  identityAttestationId:z.string().uuid(),
  permissionGraphDigest:DigestSchema,
  authorizationDecisionDigest:DigestSchema,
  realityBoundCommitId:z.string().uuid(),
  effectKey:DigestSchema,
  routeDigest:DigestSchema,
  normalizedArgumentsDigest:DigestSchema,
  expectedPostStateDigest:DigestSchema,
  proofObligationDigest:DigestSchema,
  interpositionPostureDigest:DigestSchema,
  issuedAt:z.string().datetime(),
  expiresAt:z.string().datetime(),
  maxUses:z.literal(1),
  status:OperationMandateStatusSchema,
  consumedAt:z.string().datetime().optional(),
  signatureAlgorithm:z.literal("HMAC-SHA256"),
  signature:z.string().min(16).max(4096)
}).strict();
export type OperationMandate=z.infer<typeof OperationMandateSchema>;

export const AuthorizationWitnessSchema=z.object({
  version:z.literal(1),
  proposalId:z.string().uuid(),
  graphDigest:DigestSchema,
  decision:z.enum(["ALLOW","ASK","BLOCK"]),
  matchedEdgeIds:z.array(z.string().uuid()).max(1000),
  evidenceRefs:z.array(z.string().min(1).max(500)).max(1000),
  evaluatedAt:z.string().datetime(),
  witnessDigest:DigestSchema
}).strict();
export type AuthorizationWitness=z.infer<typeof AuthorizationWitnessSchema>;

export const ExecutionAttemptReceiptSchema=z.object({
  id:z.string().uuid(),
  version:z.literal(1),
  mandateId:z.string().uuid(),
  executionTicketId:z.string().uuid(),
  taskId:z.string().uuid(),
  intentId:z.string().uuid(),
  routeDigest:DigestSchema,
  normalizedArgumentsDigest:DigestSchema,
  attemptedAt:z.string().datetime(),
  transportResultDigest:DigestSchema,
  transportAccepted:z.boolean(),
  settlement:z.enum(["PENDING","PROVEN","DISPROVEN","UNKNOWN"]),
  proofCaseId:z.string().uuid().optional()
}).strict();
export type ExecutionAttemptReceipt=z.infer<typeof ExecutionAttemptReceiptSchema>;
