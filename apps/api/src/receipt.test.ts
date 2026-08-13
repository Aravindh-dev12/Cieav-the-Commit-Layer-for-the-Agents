import {describe, expect, it} from "vitest";
import {ActionOutcomeSchema} from "@cieav/contracts";
import {createReceipt, withOutcome} from "./receipt.js";

const manifest:any={
  requestId:"request-12345678",
  actionType:"access.grant",
  summary:"Grant access",
  actor:"You",
  recipients:[],
  dataCategories:["ACCOUNT"],
  effects:["Another service may gain access."],
  reversibility:"COMPENSABLE",
  undo:{kind:"NONE"},
  risk:"MEDIUM",
  confidence:.9,
  modelUsed:false,
  warnings:[],
  evidence:["test"],
  policyVersion:"test"
};

const source={url:"https://example.com/connect",origin:"https://example.com",title:"Example"};

describe("receipt outcomes",()=>{
  it("creates v2 committed receipts without claiming remote success",()=>{
    const receipt=createReceipt("device-12345678",manifest,source,"COMMITTED","secret");
    expect(receipt.status).toBe("COMMITTED");
    expect(receipt.receiptVersion).toBe("2");
    expect(receipt.outcome).toBeUndefined();
    expect(receipt.signatureAlgorithm).toBe("HMAC-SHA256");
  });

  it("re-signs when observed outcome is attached",()=>{
    const receipt=createReceipt("device-12345678",manifest,source,"COMMITTED","secret");
    const outcome=ActionOutcomeSchema.parse({
      status:"OBSERVED_SUCCESS",
      confidence:.86,
      observedAt:new Date().toISOString(),
      evidence:[{kind:"NAVIGATION",summary:"Top frame navigated after the action."}]
    });
    const updated=withOutcome(receipt,outcome,"secret");
    expect(updated.outcome?.status).toBe("OBSERVED_SUCCESS");
    expect(updated.signature).not.toBe(receipt.signature);
    expect(updated.receiptVersion).toBe("2");
  });

  it("rejects invalid outcome confidence",()=>{
    expect(()=>ActionOutcomeSchema.parse({
      status:"OBSERVED_SUCCESS",
      confidence:2,
      observedAt:new Date().toISOString(),
      evidence:[]
    })).toThrow();
  });
});
