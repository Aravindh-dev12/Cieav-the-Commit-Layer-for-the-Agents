import crypto from "node:crypto";
import {describe,expect,it} from "vitest";
import {createConsequenceSettlement,settlementFromLegacyOutcome,transitionConsequenceSettlement,verifyConsequenceSettlement} from "./consequence-settlement.js";

const id=()=>crypto.randomUUID();

describe("CIEAV multi-axis consequence settlement",()=>{
  it("creates a deterministic zero-authority settlement envelope",()=>{
    const settlement=createConsequenceSettlement({consequenceRef:id(),executionState:"COMPLETED",realityState:"OBSERVED_SUCCESS",legitimacyState:"VALID",evidenceState:"VERIFIED",recoveryState:"NOT_REQUIRED",evidenceRefs:["proof:bank-ledger"],at:new Date("2026-08-30T12:00:00.000Z")});
    expect(verifyConsequenceSettlement(settlement)).toBe(true);
    expect(settlement.authority).toBe(false);
    expect(settlement.mayMintExecutionAuthority).toBe(false);
    expect(settlement.observedAt).toBe("2026-08-30T12:00:00.000Z");
  });

  it("never rewrites observed physical success when legitimacy later becomes tainted",()=>{
    const initial=createConsequenceSettlement({consequenceRef:id(),executionState:"COMPLETED",realityState:"OBSERVED_SUCCESS",legitimacyState:"VALID",evidenceState:"VERIFIED",recoveryState:"NOT_REQUIRED",at:new Date("2026-08-30T12:00:00.000Z")});
    const {settlement,transition}=transitionConsequenceSettlement(initial,{legitimacyState:"CAUSALLY_TAINTED",evidenceState:"CONFLICTING",recoveryState:"REQUIRED",evidenceRefs:["incident:phishing"]},"Later evidence invalidated the causal basis.",{at:new Date("2026-08-30T13:00:00.000Z")});
    expect(settlement.realityState).toBe("OBSERVED_SUCCESS");
    expect(settlement.legitimacyState).toBe("CAUSALLY_TAINTED");
    expect(settlement.recoveryState).toBe("REQUIRED");
    expect(transition.changedAxes).toEqual(["LEGITIMACY","EVIDENCE","RECOVERY"]);
    expect(()=>transitionConsequenceSettlement(settlement,{realityState:"OBSERVED_FAILURE"},"rewrite reality")).toThrow("observed_reality_is_immutable");
  });

  it("requires trusted reconciliation before UNKNOWN becomes observed reality",()=>{
    const initial=createConsequenceSettlement({consequenceRef:id(),executionState:"DISPATCHED",realityState:"UNKNOWN",legitimacyState:"VALID",evidenceState:"UNAVAILABLE",recoveryState:"UNKNOWN"});
    expect(()=>transitionConsequenceSettlement(initial,{executionState:"COMPLETED",realityState:"OBSERVED_SUCCESS",evidenceState:"VERIFIED",recoveryState:"NOT_REQUIRED",evidenceRefs:["ledger:readback"]},"late readback")).toThrow("reality_reconciliation_required");
    const {settlement,transition}=transitionConsequenceSettlement(initial,{executionState:"COMPLETED",realityState:"OBSERVED_SUCCESS",evidenceState:"VERIFIED",recoveryState:"RECOVERED",evidenceRefs:["ledger:readback"]},"trusted ledger reconciliation",{trustedRealityReconciliation:true});
    expect(settlement.realityState).toBe("OBSERVED_SUCCESS");
    expect(transition.trustedRealityReconciliation).toBe(true);
  });

  it("rejects settlement digest tampering",()=>{
    const settlement=createConsequenceSettlement({consequenceRef:id(),executionState:"DISPATCHED",realityState:"UNKNOWN",recoveryState:"UNKNOWN"});
    expect(verifyConsequenceSettlement({...settlement,evidenceState:"VERIFIED"})).toBe(false);
    expect(()=>transitionConsequenceSettlement({...settlement,evidenceState:"VERIFIED"}, {legitimacyState:"VALID"},"tampered")).toThrow("integrity_mismatch");
  });

  it("migrates legacy receipts without inventing legitimacy",()=>{
    const settlement=settlementFromLegacyOutcome({consequenceRef:id(),receiptStatus:"COMMITTED",outcomeStatus:"OBSERVED_FAILURE",evidenceRefs:["legacy:observer"],at:new Date("2026-08-30T12:00:00.000Z")});
    expect(settlement.executionState).toBe("COMPLETED");
    expect(settlement.realityState).toBe("OBSERVED_FAILURE");
    expect(settlement.legitimacyState).toBe("UNKNOWN_VALIDITY");
    expect(settlement.evidenceState).toBe("AVAILABLE");
  });
});
