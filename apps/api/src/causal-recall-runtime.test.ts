import crypto from "node:crypto";
import {mkdtemp,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach,describe,expect,it} from "vitest";
import {makeCausalProvenanceLink,makeCausalRecallEvent} from "@cieav/core";
import {CieavCausalRecallStore} from "./causal-recall-store.js";
import {applyCausalRecall} from "./causal-recall-runtime.js";
import {CieavConsequenceSettlementStore} from "./consequence-settlement-store.js";

const roots:string[]=[];
async function stores(){const root=await mkdtemp(path.join(os.tmpdir(),"cieav-recall-runtime-"));roots.push(root);return{recall:new CieavCausalRecallStore(path.join(root,"recall.json"),"r".repeat(48)),settlement:new CieavConsequenceSettlementStore(path.join(root,"settlement.json"),"s".repeat(48))}}
afterEach(async()=>{while(roots.length)await rm(roots.pop()!,{recursive:true,force:true})});

describe("CIEAV causal recall runtime",()=>{
  it("preserves observed reality while tainting legitimacy and freezing affected future work",async()=>{
    const {recall,settlement}=await stores(),payment=crypto.randomUUID(),vendorNotice=crypto.randomUUID(),at=new Date("2026-08-30T18:30:00.000Z");
    await recall.addLink(makeCausalProvenanceLink({sourceRef:"evidence:vendor-bank",consequenceRef:payment,kind:"EVIDENCE",createdAt:at}));
    await recall.addLink(makeCausalProvenanceLink({sourceRef:`consequence:${payment}`,consequenceRef:vendorNotice,kind:"PREDECESSOR",upstreamConsequenceRefs:[payment],createdAt:at}));
    await settlement.create({consequenceRef:payment,executionState:"COMPLETED",realityState:"OBSERVED_SUCCESS",legitimacyState:"VALID",evidenceState:"VERIFIED",recoveryState:"NOT_REQUIRED",evidenceRefs:["ledger:payment"],at});
    await settlement.create({consequenceRef:vendorNotice,executionState:"NOT_DISPATCHED",realityState:"UNKNOWN",legitimacyState:"VALID",evidenceState:"RESERVED",recoveryState:"NOT_REQUIRED",at});
    const event=makeCausalRecallEvent({reasonClass:"EVIDENCE_INVALIDATED",invalidatedRefs:["evidence:vendor-bank"],reason:"Vendor account source was later identified as phishing.",evidenceRefs:["incident:phishing"],discoveredAt:at}),result=await applyCausalRecall(recall,settlement,event,[{consequenceRef:payment,disposition:"COMPENSATE",proposedEffectRefs:["effect:payment-recovery"],evidenceRefs:["recovery:contract"],authority:false}],at);
    const paymentAfter=await settlement.get(payment),noticeAfter=await settlement.get(vendorNotice);
    expect(paymentAfter?.realityState).toBe("OBSERVED_SUCCESS");
    expect(paymentAfter?.legitimacyState).toBe("EVIDENCE_INVALIDATED");
    expect(paymentAfter?.evidenceState).toBe("CONFLICTING");
    expect(paymentAfter?.recoveryState).toBe("REQUIRED");
    expect(noticeAfter?.realityState).toBe("UNKNOWN");
    expect(noticeAfter?.legitimacyState).toBe("EVIDENCE_INVALIDATED");
    expect(result.futureConsequencesToBlock).toContain(vendorNotice);
    expect(result.proposedRecoveryProgramRefs.length).toBeGreaterThan(0);
    await expect(recall.assertConsequenceNotRecallBlocked(vendorNotice)).rejects.toThrow("consequence_blocked_by_causal_recall");
    await recall.close();await settlement.close();
  });
});
