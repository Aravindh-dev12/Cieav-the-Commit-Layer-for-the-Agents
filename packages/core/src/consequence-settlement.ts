import crypto from "node:crypto";
import {
  ConsequenceSettlementSchema,
  ConsequenceSettlementTransitionSchema,
  type ConsequenceEvidenceState,
  type ConsequenceExecutionState,
  type ConsequenceLegitimacyState,
  type ConsequenceRealityState,
  type ConsequenceRecoveryState,
  type ConsequenceSettlement,
  type ConsequenceSettlementTransition
} from "@cieav/contracts/consequence-settlement";

const canonical=(value:unknown):string=>Array.isArray(value)
  ?`[${value.map(canonical).join(",")}]`
  :value&&typeof value==="object"
    ?`{${Object.keys(value as Record<string,unknown>).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(",")}}`
    :JSON.stringify(value)??"undefined";
export const consequenceSettlementDigest=(value:unknown)=>crypto.createHash("sha256").update(canonical(value)).digest("hex");
const uniq=(values:string[])=>[...new Set(values)].sort();

export type CreateConsequenceSettlementInput={
  consequenceRef:string;
  executionState:ConsequenceExecutionState;
  realityState:ConsequenceRealityState;
  legitimacyState?:ConsequenceLegitimacyState;
  evidenceState?:ConsequenceEvidenceState;
  recoveryState?:ConsequenceRecoveryState;
  evidenceRefs?:string[];
  basisRefs?:string[];
  observedAt?:string;
  legitimacyEvaluatedAt?:string;
  recoveryUpdatedAt?:string;
  at?:Date;
};

export function createConsequenceSettlement(input:CreateConsequenceSettlementInput):ConsequenceSettlement{
  const at=input.at??new Date(),now=at.toISOString();
  const base={
    id:crypto.randomUUID(),
    version:"CIEAV_CONSEQUENCE_SETTLEMENT_V2" as const,
    consequenceRef:input.consequenceRef,
    executionState:input.executionState,
    realityState:input.realityState,
    legitimacyState:(input.legitimacyState??"UNKNOWN_VALIDITY") as ConsequenceLegitimacyState,
    evidenceState:(input.evidenceState??"RESERVED") as ConsequenceEvidenceState,
    recoveryState:(input.recoveryState??"NOT_REQUIRED") as ConsequenceRecoveryState,
    evidenceRefs:uniq(input.evidenceRefs??[]),
    basisRefs:uniq(input.basisRefs??[]),
    ...(input.observedAt?{observedAt:input.observedAt}:input.realityState!=="UNKNOWN"?{observedAt:now}:{}),
    ...(input.legitimacyEvaluatedAt?{legitimacyEvaluatedAt:input.legitimacyEvaluatedAt}:{}),
    ...(input.recoveryUpdatedAt?{recoveryUpdatedAt:input.recoveryUpdatedAt}:input.recoveryState&&input.recoveryState!=="NOT_REQUIRED"?{recoveryUpdatedAt:now}:{}),
    createdAt:now,
    updatedAt:now,
    authority:false as const,
    mayMintExecutionAuthority:false as const
  };
  return ConsequenceSettlementSchema.parse({...base,settlementDigest:consequenceSettlementDigest(base)});
}

export function verifyConsequenceSettlement(value:ConsequenceSettlement){
  const parsed=ConsequenceSettlementSchema.parse(value),{settlementDigest,...base}=parsed;
  return consequenceSettlementDigest(base)===settlementDigest;
}

const executionRank:Record<ConsequenceExecutionState,number>={NOT_DISPATCHED:0,DISPATCHED:1,INTERRUPTED:2,COMPLETED:3};
const recoveryAllowed:Record<ConsequenceRecoveryState,Set<ConsequenceRecoveryState>>={
  NOT_REQUIRED:new Set(["NOT_REQUIRED","REQUIRED","UNKNOWN"]),
  REQUIRED:new Set(["REQUIRED","IN_PROGRESS","PARTIALLY_RECOVERED","RECOVERED","IRREVERSIBLE","UNKNOWN","NOT_REQUIRED"]),
  IN_PROGRESS:new Set(["IN_PROGRESS","PARTIALLY_RECOVERED","RECOVERED","IRREVERSIBLE","UNKNOWN","NOT_REQUIRED"]),
  PARTIALLY_RECOVERED:new Set(["PARTIALLY_RECOVERED","IN_PROGRESS","RECOVERED","IRREVERSIBLE","UNKNOWN"]),
  RECOVERED:new Set(["RECOVERED","REQUIRED"]),
  IRREVERSIBLE:new Set(["IRREVERSIBLE"]),
  UNKNOWN:new Set(["UNKNOWN","NOT_REQUIRED","REQUIRED","IN_PROGRESS","PARTIALLY_RECOVERED","RECOVERED","IRREVERSIBLE"])
};

export type ConsequenceSettlementPatch={
  executionState?:ConsequenceExecutionState;
  realityState?:ConsequenceRealityState;
  legitimacyState?:ConsequenceLegitimacyState;
  evidenceState?:ConsequenceEvidenceState;
  recoveryState?:ConsequenceRecoveryState;
  evidenceRefs?:string[];
  basisRefs?:string[];
  observedAt?:string;
  legitimacyEvaluatedAt?:string;
  recoveryUpdatedAt?:string;
};

export function transitionConsequenceSettlement(
  currentRaw:ConsequenceSettlement,
  patch:ConsequenceSettlementPatch,
  reason:string,
  options:{trustedRealityReconciliation?:boolean;at?:Date}={}
):{settlement:ConsequenceSettlement;transition:ConsequenceSettlementTransition}{
  const current=ConsequenceSettlementSchema.parse(currentRaw);if(!verifyConsequenceSettlement(current))throw new Error("consequence_settlement_integrity_mismatch");
  const at=options.at??new Date(),now=at.toISOString(),executionState=patch.executionState??current.executionState,realityState=patch.realityState??current.realityState,legitimacyState=patch.legitimacyState??current.legitimacyState,evidenceState=patch.evidenceState??current.evidenceState,recoveryState=patch.recoveryState??current.recoveryState;
  if(executionRank[executionState]<executionRank[current.executionState])throw new Error("consequence_settlement_execution_regression");
  if(current.executionState==="COMPLETED"&&executionState!=="COMPLETED")throw new Error("consequence_settlement_execution_complete_is_immutable");
  if(current.realityState!=="UNKNOWN"&&realityState!==current.realityState)throw new Error("consequence_settlement_observed_reality_is_immutable");
  if(current.realityState==="UNKNOWN"&&realityState!=="UNKNOWN"&&!options.trustedRealityReconciliation)throw new Error("consequence_settlement_reality_reconciliation_required");
  if(!recoveryAllowed[current.recoveryState].has(recoveryState))throw new Error("consequence_settlement_recovery_transition_invalid");
  const changedAxes:Array<"EXECUTION"|"REALITY"|"LEGITIMACY"|"EVIDENCE"|"RECOVERY">=[];
  if(executionState!==current.executionState)changedAxes.push("EXECUTION");if(realityState!==current.realityState)changedAxes.push("REALITY");if(legitimacyState!==current.legitimacyState)changedAxes.push("LEGITIMACY");if(evidenceState!==current.evidenceState)changedAxes.push("EVIDENCE");if(recoveryState!==current.recoveryState)changedAxes.push("RECOVERY");
  if(!changedAxes.length&&(patch.evidenceRefs?.length||patch.basisRefs?.length))changedAxes.push("EVIDENCE");
  if(!changedAxes.length)throw new Error("consequence_settlement_transition_no_change");
  const base={
    ...current,
    executionState,realityState,legitimacyState,evidenceState,recoveryState,
    evidenceRefs:uniq([...current.evidenceRefs,...(patch.evidenceRefs??[])]),
    basisRefs:uniq([...current.basisRefs,...(patch.basisRefs??[])]),
    ...(patch.observedAt?{observedAt:patch.observedAt}:realityState!=="UNKNOWN"&&!current.observedAt?{observedAt:now}:{}),
    ...(patch.legitimacyEvaluatedAt?{legitimacyEvaluatedAt:patch.legitimacyEvaluatedAt}:legitimacyState!==current.legitimacyState?{legitimacyEvaluatedAt:now}:{}),
    ...(patch.recoveryUpdatedAt?{recoveryUpdatedAt:patch.recoveryUpdatedAt}:recoveryState!==current.recoveryState?{recoveryUpdatedAt:now}:{}),
    updatedAt:now,
    authority:false as const,mayMintExecutionAuthority:false as const
  };
  const {settlementDigest:_,...withoutDigest}=base,settlement=ConsequenceSettlementSchema.parse({...withoutDigest,settlementDigest:consequenceSettlementDigest(withoutDigest)});
  const transition=ConsequenceSettlementTransitionSchema.parse({version:"CIEAV_CONSEQUENCE_SETTLEMENT_TRANSITION_V1",settlementRef:current.id,consequenceRef:current.consequenceRef,previousDigest:current.settlementDigest,nextDigest:settlement.settlementDigest,reason,evidenceRefs:uniq(patch.evidenceRefs??[]),changedAxes,trustedRealityReconciliation:Boolean(options.trustedRealityReconciliation),createdAt:now,authority:false,mayMintExecutionAuthority:false});
  return{settlement,transition};
}

export function settlementFromLegacyOutcome(input:{consequenceRef:string;receiptStatus?:"PREVIEWED"|"COMMITTED"|"CANCELLED"|"UNDONE"|"UNDO_FAILED";outcomeStatus?:"OBSERVED_SUCCESS"|"OBSERVED_FAILURE"|"UNKNOWN";evidenceRefs?:string[];at?:Date}){
  const executionState:ConsequenceExecutionState=input.receiptStatus==="PREVIEWED"||input.receiptStatus==="CANCELLED"||!input.receiptStatus?"NOT_DISPATCHED":input.outcomeStatus?"COMPLETED":"DISPATCHED";
  const realityState:ConsequenceRealityState=input.outcomeStatus??"UNKNOWN";
  const recoveryState:ConsequenceRecoveryState=input.receiptStatus==="UNDONE"?"RECOVERED":input.receiptStatus==="UNDO_FAILED"?"REQUIRED":"NOT_REQUIRED";
  const evidenceState:ConsequenceEvidenceState=input.outcomeStatus&&input.outcomeStatus!=="UNKNOWN"?"AVAILABLE":input.evidenceRefs?.length?"AVAILABLE":"UNAVAILABLE";
  return createConsequenceSettlement({consequenceRef:input.consequenceRef,executionState,realityState,legitimacyState:"UNKNOWN_VALIDITY",evidenceState,recoveryState,evidenceRefs:input.evidenceRefs,at:input.at});
}

export const CONSEQUENCE_SETTLEMENT_AUTHORITY=false as const;
export const CONSEQUENCE_SETTLEMENT_MAY_MINT_EXECUTION_AUTHORITY=false as const;
