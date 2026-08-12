import crypto from "node:crypto";
import {describe,expect,it} from "vitest";
import type {ProofObservation,ProofPlan} from "@latch/contracts/proof";
import {evaluateProof} from "./proof.js";

const plan:ProofPlan={expectedState:["Refund is visible in the payment account"],requirements:[{kind:"PAYMENT",required:true,minConfidence:.8},{kind:"EXTERNAL_RECEIPT",required:true,minConfidence:.7}]};
const observation=(kind:ProofObservation["kind"],signal:ProofObservation["signal"],confidence:number):ProofObservation=>({id:crypto.randomUUID(),kind,signal,summary:`${kind} ${signal}`,observedAt:new Date().toISOString(),confidence});

describe("CIEAV proof mesh",()=>{
  it("does not call an outcome proven while required evidence is missing",()=>{const r=evaluateProof(plan,[observation("PAYMENT","SUPPORTS",.95)]);expect(r.status).toBe("PARTIAL");expect(r.missingRequired).toContain("EXTERNAL_RECEIPT")});
  it("proves an outcome only when independent requirements are satisfied",()=>{const r=evaluateProof(plan,[observation("PAYMENT","SUPPORTS",.95),observation("EXTERNAL_RECEIPT","SUPPORTS",.85)]);expect(r.status).toBe("PROVEN");expect(r.missingRequired).toEqual([])});
  it("lets credible contradictory evidence dominate optimistic evidence",()=>{const r=evaluateProof(plan,[observation("PAYMENT","SUPPORTS",.95),observation("EXTERNAL_RECEIPT","CONTRADICTS",.9)]);expect(r.status).toBe("CONTRADICTED")});
});
