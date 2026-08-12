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
