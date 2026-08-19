import {z} from "zod";
import {EffectDescriptorSchema,ProofEvidenceKindSchema} from "./reality.js";

const Hex64Schema=z.string().regex(/^[a-f0-9]{64}$/);

export const InverseActionDescriptorSchema=z.object({
  actionType:z.string().min(1).max(160),
  effect:EffectDescriptorSchema,
  instructions:z.array(z.string().min(1).max(1000)).min(1).max(30),
  requiredEvidenceKinds:z.array(ProofEvidenceKindSchema).min(1).max(20),
  artifactDigests:z.array(Hex64Schema).max(50).default([]),
  expiresAt:z.string().datetime().optional()
}).strict();
export type InverseActionDescriptor=z.infer<typeof InverseActionDescriptorSchema>;

export const ReversibilityEscrowStateSchema=z.enum(["RESERVED","ACTIVATED","CONSUMED","EXPIRED","CANCELLED"]);
export const ReversibilityEscrowSchema=z.object({
  id:z.string().uuid(),
  scopeDeviceId:z.string().min(8).max(200),
  intentId:z.string().uuid(),
  taskId:z.string().uuid(),
  forwardEffectKey:Hex64Schema,
  inverse:InverseActionDescriptorSchema,
  state:ReversibilityEscrowStateSchema,
  createdAt:z.string().datetime(),
  activatedAt:z.string().datetime().optional(),
  activatedByProofCaseId:z.string().uuid().optional(),
  consumedAt:z.string().datetime().optional(),
  cancelledAt:z.string().datetime().optional(),
  expiresAt:z.string().datetime().optional()
}).strict();
export type ReversibilityEscrow=z.infer<typeof ReversibilityEscrowSchema>;

export const ReversibilityEscrowReserveRequestSchema=z.object({
  scopeDeviceId:z.string().min(8).max(200),
  intentId:z.string().uuid(),
  taskId:z.string().uuid(),
  forwardEffect:EffectDescriptorSchema,
  inverse:InverseActionDescriptorSchema
}).strict();

export const ReversibilityEscrowConsumeRequestSchema=z.object({
  scopeDeviceId:z.string().min(8).max(200),
  inverseEffect:EffectDescriptorSchema
}).strict();
