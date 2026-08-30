import crypto from "node:crypto";
import {describe,expect,it} from "vitest";
import {createConsequenceSettlement,transitionConsequenceSettlement} from "./consequence-settlement.js";
import {computeConsequenceRecoveryClosure,makeCausalProvenanceLink,makeCausalRecallEvent,settlementPatchForCausalRecall,verifyConsequenceRecoveryClosureDigest} from "./causal-recall.js";

const at=new Date("2026-08-30T17:30:00.000Z");

describe("CIEAV causal recall",()=>{
  it("propagates invalidated evidence through consequence descendants without rewriting physical success",()=>{
    const paid=crypto.randomUUID(),notify=crypto.randomUUID(),followup=crypto.randomUUID();
    const links=[
      makeCausalProvenanceLink({sourceRef:"evidence:invoice:bank-account",consequenceRef:paid,kind:"EVIDENCE",evidenceRefs:["mail:compromised"],createdAt:at}),
      makeCausalProvenanceLink({sourceRef:`consequence:${paid}`,consequenceRef:notify,kind:"PREDECESSOR",upstreamConsequenceRefs:[paid],createdAt:at}),
      makeCausalProvenanceLink({sourceRef:`consequence:${notify}`,consequenceRef:followup,kind:"PREDECESSOR",upstreamConsequenceRefs:[notify],createdAt:at})
    ];
    const event=makeCausalRecallEvent({reasonClass:"EVIDENCE_INVALIDATED",invalidatedRefs:["evidence:invoice:bank-account"],reason:"Vendor bank evidence was later proven compromised.",evidenceRefs:["incident:phishing-1"],discoveredAt:at});
    const settlements=[
      createConsequenceSettlement({consequenceRef:paid,executionState:"COMPLETED",realityState:"OBSERVED_SUCCESS",legitimacyState:"VALID",evidenceState:"VERIFIED",recoveryState:"NOT_REQUIRED",evidenceRefs:["ledger:payment-1"],at}),
      createConsequenceSettlement({consequenceRef:notify,executionState:"DISPATCHED",realityState:"UNKNOWN",legitimacyState:"UNKNOWN_VALIDITY",evidenceState:"UNAVAILABLE",recoveryState:"UNKNOWN",at}),
      createConsequenceSettlement({consequenceRef:followup,executionState:"NOT_DISPATCHED",realityState:"UNKNOWN",legitimacyState:"UNKNOWN_VALIDITY",evidenceState:"RESERVED",recoveryState:"NOT_REQUIRED",at})
    ];
    const closure=computeConsequenceRecoveryClosure(event,links,settlements,[
      {consequenceRef:paid,disposition:"COMPENSATE",proposedEffectRefs:["effect:recover-payment"],evidenceRefs:["recovery:contract"],authority:false},
      {consequenceRef:notify,disposition:"RECONCILE",proposedEffectRefs:[],evidenceRefs:[],authority:false},
      {consequenceRef:followup,disposition:"SAFE_STATE",proposedEffectRefs:["effect:block-followup"],evidenceRefs:[],authority:false}
    ],at);
    expect(closure.directlyAffectedConsequenceRefs).toEqual([paid]);
    expect(closure.transitivelyAffectedConsequenceRefs).toEqual([followup,notify].sort());
    expect(closure.futureConsequencesToBlock).toEqual([followup,notify].sort());
    expect(closure.compensableConsequenceRefs).toEqual([paid]);
    expect(closure.settlementSnapshots.find(value=>value.consequenceRef===paid)?.realityState).toBe("OBSERVED_SUCCESS");
    expect(closure.proposedRecoveryPrograms.find(value=>value.sourceConsequenceRef===paid)?.requiresFreshAuthority).toBe(true);
    expect(closure.proposedRecoveryPrograms.every(value=>value.authority===false&&value.mayMintExecutionAuthority===false)).toBe(true);
    expect(verifyConsequenceRecoveryClosureDigest(closure)).toBe(true);
    const paymentSettlement=settlements[0]!,patch=settlementPatchForCausalRecall(event,paymentSettlement),changed=transitionConsequenceSettlement(paymentSettlement,patch,"causal recall invalidated payment evidence",{at});
    expect(changed.settlement.realityState).toBe("OBSERVED_SUCCESS");
    expect(changed.settlement.legitimacyState).toBe("EVIDENCE_INVALIDATED");
    expect(changed.settlement.evidenceState).toBe("CONFLICTING");
    expect(changed.settlement.recoveryState).toBe("REQUIRED");
  });

  it("finds consequences directly dependent on a compromised qualified tool",()=>{
    const consequenceRef=crypto.randomUUID(),link=makeCausalProvenanceLink({sourceRef:"tool:payments:v7",consequenceRef,kind:"TOOL",createdAt:at}),event=makeCausalRecallEvent({reasonClass:"TOOL_COMPROMISED",invalidatedRefs:["tool:payments:v7"],reason:"Qualified adapter artifact was later found compromised.",evidenceRefs:["incident:supply-chain"],discoveredAt:at});
    const settlement=createConsequenceSettlement({consequenceRef,executionState:"COMPLETED",realityState:"OBSERVED_SUCCESS",legitimacyState:"VALID",evidenceState:"VERIFIED",recoveryState:"NOT_REQUIRED",at});
    const closure=computeConsequenceRecoveryClosure(event,[link],[settlement],[{consequenceRef,disposition:"IRREVERSIBLE",proposedEffectRefs:[],evidenceRefs:["recovery:none"],authority:false}],at);
    expect(closure.directlyAffectedConsequenceRefs).toEqual([consequenceRef]);
    expect(closure.irreversibleConsequenceRefs).toEqual([consequenceRef]);
    expect(closure.proposedRecoveryPrograms).toEqual([]);
  });

  it("detects recovery-closure tampering",()=>{
    const consequenceRef=crypto.randomUUID(),link=makeCausalProvenanceLink({sourceRef:"policy:prod:v3",consequenceRef,kind:"POLICY",createdAt:at}),event=makeCausalRecallEvent({reasonClass:"POLICY_INVALIDATED",invalidatedRefs:["policy:prod:v3"],reason:"Policy was invalidated after deployment.",evidenceRefs:["audit:policy"],discoveredAt:at}),closure=computeConsequenceRecoveryClosure(event,[link],[],[],at);
    expect(verifyConsequenceRecoveryClosureDigest(closure)).toBe(true);
    expect(verifyConsequenceRecoveryClosureDigest({...closure,futureConsequencesToBlock:[]})).toBe(false);
  });
});
