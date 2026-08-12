import {z} from "zod";
import {ActionProposalSchema,CieavPrincipalSchema,MoneySchema} from "./reality.js";

export const RecoveryActionEvaluateRequestSchema=z.object({
  openLoopId:z.string().uuid(),
  actor:CieavPrincipalSchema,
  manifest:z.record(z.unknown()),
  delegationChain:z.array(CieavPrincipalSchema).max(16).default([]),
  amount:MoneySchema.optional()
}).strict();
export type RecoveryActionEvaluateRequest=z.infer<typeof RecoveryActionEvaluateRequestSchema>;

export const RecoveryActionBindingSchema=z.object({
  openLoopId:z.string().uuid(),
  recoveryKind:z.enum(["UNDO","COMPENSATE","ESCALATE"]),
  proposal:ActionProposalSchema,
  createdAt:z.string().datetime()
}).strict();
export type RecoveryActionBinding=z.infer<typeof RecoveryActionBindingSchema>;
