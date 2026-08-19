import crypto from "node:crypto";
import type {EffectDescriptor} from "@cieav/contracts/reality";
import {ReversibilityEscrowSchema,type InverseActionDescriptor,type ReversibilityEscrow} from "@cieav/contracts/reversibility-escrow";
import {semanticEffectKey} from "./intent-reality.js";

export function reserveReversibilityEscrow(input:{scopeDeviceId:string;intentId:string;taskId:string;forwardEffect:EffectDescriptor;inverse:InverseActionDescriptor},createdAt=new Date().toISOString()):ReversibilityEscrow{
  if(!["REVERSIBLE","COMPENSABLE"].includes(input.forwardEffect.reversibility))throw new Error("forward_effect_not_eligible_for_reversibility_escrow");
  if(input.inverse.effect.reversibility==="IRREVERSIBLE")throw new Error("inverse_effect_must_not_be_irreversible");
  if(input.forwardEffect.target&&input.inverse.effect.target&&input.forwardEffect.target!==input.inverse.effect.target)throw new Error("inverse_effect_target_mismatch");
  return ReversibilityEscrowSchema.parse({id:crypto.randomUUID(),scopeDeviceId:input.scopeDeviceId,intentId:input.intentId,taskId:input.taskId,forwardEffectKey:semanticEffectKey(input.forwardEffect),inverse:input.inverse,state:"RESERVED",createdAt,...(input.inverse.expiresAt?{expiresAt:input.inverse.expiresAt}:{})});
}

export function activateReversibilityEscrow(escrow:ReversibilityEscrow,proofCaseId:string,at=new Date().toISOString()):ReversibilityEscrow{
  if(escrow.state!=="RESERVED")throw new Error("reversibility_escrow_not_reserved");
  if(escrow.expiresAt&&Date.parse(escrow.expiresAt)<=Date.parse(at))throw new Error("reversibility_escrow_expired");
  return ReversibilityEscrowSchema.parse({...escrow,state:"ACTIVATED",activatedAt:at,activatedByProofCaseId:proofCaseId});
}

export function consumeReversibilityEscrow(escrow:ReversibilityEscrow,inverseEffect:EffectDescriptor,at=new Date().toISOString()):ReversibilityEscrow{
  if(escrow.state!=="ACTIVATED")throw new Error("reversibility_escrow_not_activated");
  if(escrow.expiresAt&&Date.parse(escrow.expiresAt)<=Date.parse(at))throw new Error("reversibility_escrow_expired");
  if(semanticEffectKey(escrow.inverse.effect)!==semanticEffectKey(inverseEffect))throw new Error("inverse_effect_not_bound_to_escrow");
  return ReversibilityEscrowSchema.parse({...escrow,state:"CONSUMED",consumedAt:at});
}

export function expireReversibilityEscrow(escrow:ReversibilityEscrow,at=new Date().toISOString()):ReversibilityEscrow{
  if(!escrow.expiresAt||Date.parse(escrow.expiresAt)>Date.parse(at)||!["RESERVED","ACTIVATED"].includes(escrow.state))return escrow;
  return ReversibilityEscrowSchema.parse({...escrow,state:"EXPIRED"});
}
