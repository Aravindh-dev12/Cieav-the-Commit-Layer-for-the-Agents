import {describe,expect,it} from "vitest";
import type {ActionProposal,IntentConstraints,IntentContract} from "@cieav/contracts/reality";
import {
  attenuationIssues,
  createExpectedConsequence,
  createIntentAttenuationWitness,
  createRealityBoundCommit,
  createRealityStateWitness,
  createAutonomyCandidate,
  semanticEffectKey,
  verifyIntentAttenuationWitness,
  verifyRealityBoundCommit
} from "./intent-reality.js";

const secret="r".repeat(64);
const baseConstraints:IntentConstraints={allowedActionTypes:["financial.commit"],deniedActionTypes:["identity.disable_mfa"],allowedTargets:["vendor.example"],deniedTargets:[],maxRisk:"HIGH",humanApprovalAtOrAbove:"HIGH",allowedDataCategories:["NONE","FINANCIAL"],allowExternalRecipients:false,maxAmount:{currency:"USD",value:5000},maxDelegationDepth:2,requireIndependentVerification:true};
const intent:IntentContract={id:"11111111-1111-4111-8111-111111111111",owner:{id:"owner",kind:"HUMAN"},goal:"Pay verified invoices",createdAt:"2026-08-19T00:00:00.000Z",status:"ACTIVE",constraints:baseConstraints,completionCriteria:["Invoice is independently proven paid"],contextLabels:{}};
const effect={class:"FINANCIAL" as const,operation:"stripe.transfer",target:"vendor.example",amount:{currency:"USD",value:1200},recipients:[],dataCategories:["FINANCIAL" as const],reversibility:"COMPENSABLE" as const,metadata:{invoiceId:"inv-44",cieavSemanticEffect:"payment.transfer"}};
const proposal:ActionProposal={id:"22222222-2222-4222-8222-222222222222",intentId:intent.id,requestId:"request-12345678",actor:{id:"agent-1",kind:"AGENT"},delegationChain:[],actionType:"financial.commit",summary:"Pay invoice inv-44",risk:"HIGH",effect,requestedAt:"2026-08-19T00:00:00.000Z"};

describe("CIEAV intent-to-reality core",()=>{
  it("invalidates a commit when reality changes after authorization",()=>{
    const pre=createRealityStateWitness({invoiceStatus:"UNPAID",amount:1200},"bank-readback","2026-08-19T00:00:00.000Z");
    const expected=createExpectedConsequence({summary:"Invoice becomes paid",effect,postconditions:["invoice.status == PAID"],proofKinds:["PAYMENT","API_READBACK"]});
    const permit=createRealityBoundCommit({taskId:"33333333-3333-4333-8333-333333333333",intent,proposal,preState:pre,expected,ttlSeconds:120},secret,new Date("2026-08-19T00:00:01.000Z"));
    expect(verifyRealityBoundCommit(permit,pre,secret,Date.parse("2026-08-19T00:00:02.000Z"))).toEqual({ok:true});
    const changed=createRealityStateWitness({invoiceStatus:"PAID",amount:1200},"bank-readback","2026-08-19T00:00:02.000Z");
    expect(verifyRealityBoundCommit(permit,changed,secret,Date.parse("2026-08-19T00:00:03.000Z"))).toEqual({ok:false,reason:"reality_changed_since_authorization"});
  });

  it("creates verifiable attenuation witnesses and rejects widened child authority",()=>{
    const child:IntentConstraints={...baseConstraints,allowedActionTypes:["financial.commit"],maxRisk:"MEDIUM",maxAmount:{currency:"USD",value:1000},maxDelegationDepth:1};
    const witness=createIntentAttenuationWitness({rootIntentId:intent.id,parentConstraints:baseConstraints,childConstraints:child},secret);
    expect(verifyIntentAttenuationWitness(witness,secret)).toBe(true);
    expect(()=>createIntentAttenuationWitness({rootIntentId:intent.id,parentConstraints:child,childConstraints:{...baseConstraints,maxRisk:"CRITICAL"}},secret)).toThrow(/widens_authority/);
    expect(attenuationIssues(child,{...child,allowExternalRecipients:true})).toContain("external recipient authority widened");
  });

  it("deduplicates a semantic consequence across heterogeneous execution channels",()=>{
    const api={...effect,operation:"stripe.transfer"},browser={...effect,operation:"browser.click",metadata:{...effect.metadata,cieavSemanticEffect:"payment.transfer"}};
    expect(semanticEffectKey(api)).toBe(semanticEffectKey(browser));
  });

  it("allows automatic contraction but requires safe replay before autonomy expansion becomes a candidate",()=>{
    const contracted:IntentConstraints={...baseConstraints,maxRisk:"MEDIUM",maxAmount:{currency:"USD",value:1000}};
    const contraction=createAutonomyCandidate({scopeDeviceId:"dev_1234567890",intentId:intent.id,currentConstraints:baseConstraints,candidateConstraints:contracted,replay:{historicalActions:100,verifiedExpectedOutcomes:90,newlyAutonomousActions:0,deniedWouldBecomeAutonomous:0,disprovenWouldBecomeAutonomous:0,unknownWouldBecomeAutonomous:0,highCriticalWouldBecomeAutonomous:0},reason:"reduce authority"},20);
    expect(contraction.state).toBe("AUTO_CONTRACTED");
    const expansionReplay={historicalActions:100,verifiedExpectedOutcomes:90,newlyAutonomousActions:5,deniedWouldBecomeAutonomous:0,disprovenWouldBecomeAutonomous:0,unknownWouldBecomeAutonomous:0,highCriticalWouldBecomeAutonomous:0};
    const expansion=createAutonomyCandidate({scopeDeviceId:"dev_1234567890",intentId:intent.id,currentConstraints:contracted,candidateConstraints:baseConstraints,replay:expansionReplay,reason:"verified reliable history"},20);
    expect(expansion.state).toBe("CANDIDATE");
    expect(()=>createAutonomyCandidate({scopeDeviceId:"dev_1234567890",intentId:intent.id,currentConstraints:contracted,candidateConstraints:baseConstraints,replay:{...expansionReplay,unknownWouldBecomeAutonomous:1},reason:"unsafe"},20)).toThrow(/safety_replay_failed/);
  });
});
