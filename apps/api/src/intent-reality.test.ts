import {mkdtemp,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach,describe,expect,it} from "vitest";
import type {ActionProposal,IntentContract} from "@cieav/contracts/reality";
import {createExpectedConsequence,createRealityStateWitness} from "@cieav/core/intent-reality";
import {CieavIntentRealityStore} from "./intent-reality.js";

const dirs:string[]=[];
const secret="s".repeat(64);
const intent:IntentContract={id:"11111111-1111-4111-8111-111111111111",owner:{id:"owner",kind:"HUMAN"},goal:"Pay invoice",createdAt:"2026-08-19T00:00:00.000Z",status:"ACTIVE",constraints:{allowedActionTypes:["financial.commit"],deniedActionTypes:[],allowedTargets:["vendor.example"],deniedTargets:[],maxRisk:"HIGH",humanApprovalAtOrAbove:"HIGH",allowedDataCategories:["NONE","FINANCIAL"],allowExternalRecipients:false,maxAmount:{currency:"USD",value:5000},maxDelegationDepth:1,requireIndependentVerification:true},completionCriteria:["Invoice is proven paid"],contextLabels:{}};
const effect={class:"FINANCIAL" as const,operation:"stripe.transfer",target:"vendor.example",amount:{currency:"USD",value:1200},recipients:[],dataCategories:["FINANCIAL" as const],reversibility:"COMPENSABLE" as const,metadata:{invoiceId:"inv-44",cieavSemanticEffect:"payment.transfer"}};
const proposal=(id:string):ActionProposal=>({id,intentId:intent.id,requestId:`request-${id.slice(0,8)}`,actor:{id:"agent-1",kind:"AGENT"},delegationChain:[],actionType:"financial.commit",summary:"Pay invoice",risk:"HIGH",effect,requestedAt:new Date().toISOString()});

afterEach(async()=>{for(const dir of dirs.splice(0))await rm(dir,{recursive:true,force:true})});

describe("CIEAV intent-reality durable store",()=>{
  it("quarantines unresolved semantic effects across tasks and survives restart",async()=>{
    const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-intent-reality-"));dirs.push(dir);const file=path.join(dir,"state.json"),scope="dev_1234567890",store=new CieavIntentRealityStore(file,secret);
    const pre=createRealityStateWitness({invoice:"UNPAID",amount:1200},"provider-readback"),expected=createExpectedConsequence({summary:"Invoice is paid",effect,postconditions:["invoice == PAID"],proofKinds:["PAYMENT","API_READBACK"]});
    const first=await store.prepareCommit(scope,"33333333-3333-4333-8333-333333333333",intent,{proposal:proposal("22222222-2222-4222-8222-222222222222"),preState:pre,expected,driftDelta:.05,driftBasis:["same vendor and invoice"],ttlSeconds:30});
    const consumed=await store.consumeCommit(scope,first.record.permit,pre);expect(consumed.ok).toBe(true);
    const quarantine=await store.settleTask(scope,"33333333-3333-4333-8333-333333333333","UNKNOWN");expect(quarantine?.status).toBe("OPEN");
    await expect(store.prepareCommit(scope,"44444444-4444-4444-8444-444444444444",intent,{proposal:proposal("55555555-5555-4555-8555-555555555555"),preState:pre,expected,driftDelta:.01,ttlSeconds:30})).rejects.toThrow(/effect_quarantined/);
    if(!quarantine)throw new Error("quarantine missing");await store.reconcileQuarantine(scope,quarantine.id,"NOT_APPLIED",undefined,"provider confirmed no transaction");await store.close();
    const reopened=new CieavIntentRealityStore(file,secret),snapshot=await reopened.snapshot(scope);expect(snapshot.quarantines).toHaveLength(1);expect(snapshot.quarantines[0]?.status).toBe("RESOLVED_NOT_APPLIED");expect(snapshot.commits[0]?.status).toBe("CONSUMED");await reopened.close();
  });

  it("invalidates an issued commit if the pre-state changes before consumption",async()=>{
    const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-intent-reality-"));dirs.push(dir);const store=new CieavIntentRealityStore(path.join(dir,"state.json"),secret),scope="dev_1234567890";
    const pre=createRealityStateWitness({invoice:"UNPAID"},"provider-readback"),expected=createExpectedConsequence({summary:"Invoice is paid",effect,postconditions:["invoice == PAID"],proofKinds:["PAYMENT"]});
    const issued=await store.prepareCommit(scope,"33333333-3333-4333-8333-333333333333",intent,{proposal:proposal("22222222-2222-4222-8222-222222222222"),preState:pre,expected,driftDelta:0,ttlSeconds:30});
    const current=createRealityStateWitness({invoice:"PAID"},"provider-readback"),result=await store.consumeCommit(scope,issued.record.permit,current);expect(result.ok).toBe(false);expect(result.reason).toBe("reality_changed_since_authorization");expect(result.record?.status).toBe("INVALIDATED_REALITY_CHANGED");await store.close();
  });
});
