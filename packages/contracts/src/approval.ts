import {z} from "zod";

export const ApprovalStatusSchema=z.enum(["PENDING","APPROVED","DENIED","EXPIRED","PERMIT_ISSUED"]);
export type ApprovalStatus=z.infer<typeof ApprovalStatusSchema>;

export const ApprovalChallengeSchema=z.object({
  id:z.string().uuid(),
  intentId:z.string().uuid(),
  proposalId:z.string().uuid(),
  summary:z.string().min(1).max(500),
  risk:z.enum(["LOW","MEDIUM","HIGH","CRITICAL"]),
  status:ApprovalStatusSchema,
  createdAt:z.string().datetime(),
  expiresAt:z.string().datetime(),
  decidedAt:z.string().datetime().optional()
}).strict();
export type ApprovalChallenge=z.infer<typeof ApprovalChallengeSchema>;

export const ApprovalListSchema=z.object({approvals:z.array(ApprovalChallengeSchema)}).strict();

/**
 * A native approval activation is a narrowly scoped signal of human intent.
 * It is not a permit, execution ticket, credential lease, or reusable authority.
 */
export const ApprovalActivationDecisionSchema=z.enum(["APPROVED","DENIED"]);
export type ApprovalActivationDecision=z.infer<typeof ApprovalActivationDecisionSchema>;

export const ApprovalActivationPayloadSchema=z.object({
  version:z.literal("CIEAV_NATIVE_APPROVAL_ACTIVATION_V1"),
  challengeId:z.string().uuid(),
  deviceId:z.string().min(8).max(200),
  requestId:z.string().min(8).max(128),
  proposalId:z.string().uuid(),
  proposalDigest:z.string().regex(/^[0-9a-f]{64}$/),
  principalId:z.string().min(1).max(240),
  resource:z.string().min(1).max(500),
  risk:z.enum(["LOW","MEDIUM","HIGH","CRITICAL"]),
  decision:ApprovalActivationDecisionSchema,
  expiresAt:z.string().datetime(),
  nonce:z.string().regex(/^[0-9a-f]{64}$/),
  authority:z.literal(false).default(false),
  executionAuthorityIssued:z.literal(false).default(false)
}).strict();
export type ApprovalActivationPayload=z.infer<typeof ApprovalActivationPayloadSchema>;

export const ApprovalActivationCapabilitySchema=z.object({
  payload:ApprovalActivationPayloadSchema,
  mac:z.string().regex(/^[A-Za-z0-9_-]{43}$/)
}).strict();
export type ApprovalActivationCapability=z.infer<typeof ApprovalActivationCapabilitySchema>;

export const ApprovalNativeCapabilitiesSchema=z.object({
  approval:ApprovalChallengeSchema,
  approve:ApprovalActivationCapabilitySchema,
  deny:ApprovalActivationCapabilitySchema,
  authority:z.literal(false),
  executionAuthorityIssued:z.literal(false)
}).strict();
export type ApprovalNativeCapabilities=z.infer<typeof ApprovalNativeCapabilitiesSchema>;

export const ApprovalActivationResultSchema=z.object({
  approval:ApprovalChallengeSchema,
  consumedAt:z.string().datetime(),
  authority:z.literal(false),
  executionAuthorityIssued:z.literal(false)
}).strict();
export type ApprovalActivationResult=z.infer<typeof ApprovalActivationResultSchema>;
