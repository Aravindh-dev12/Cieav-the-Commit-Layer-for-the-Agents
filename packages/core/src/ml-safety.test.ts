import {describe,expect,it} from "vitest";
import {evaluateMlSafetyTransition} from "./ml-safety-spec.js";
import {evaluateMlTrajectoryWithShield} from "./ml-safety-shield.js";
import {verifyMlPerturbation} from "./ml-perturbation.js";
import {evaluateMlCounterfactual} from "./ml-counterfactual.js";
import {evaluateMlRewardGap} from "./ml-reward-gap.js";
import {evaluateMlSelectiveAction} from "./ml-selective-action.js";

const candidate={actionType:"financial.commit",risk:"CRITICAL" as const,reversibility:"COMPENSABLE" as const,confidence:.9};

describe("CIEAV constrained ML safety architecture",()=>{
  it("rejects direct commit and unsupported success",()=>{
    expect(evaluateMlSafetyTransition({from:"PROPOSED",to:"COMMITTED",permitId:"p1"}).allowed).toBe(false);
    expect(evaluateMlSafetyTransition({from:"COMMITTED",to:"UNKNOWN",observedOutcome:"UNKNOWN",claimsSuccess:true}).violations.some(x=>x.id==="unsupported_success_claim")).toBe(true);
  });
  it("requires approval before commit in the shield",()=>{
    const r=evaluateMlTrajectoryWithShield([
      {kind:"ANALYZE"},{kind:"PREVIEW"},{kind:"COMMIT",permitId:"p1"}
    ],{requiresHumanApproval:true});
    expect(r.allowed).toBe(false);
  });
  it("detects metamorphic instability and material sensitivity",()=>{
    expect(verifyMlPerturbation(candidate,{...candidate,risk:"LOW"},{id:"styling",kind:"INVARIANT",dimension:"dom-style"}).passed).toBe(false);
    expect(verifyMlPerturbation(candidate,{...candidate,risk:"HIGH"},{id:"amount",kind:"MATERIAL",dimension:"amount",expectedChange:["risk"]}).passed).toBe(true);
  });
  it("attributes causal safety contribution to approval",()=>{
    const steps=[{kind:"ANALYZE" as const},{kind:"PREVIEW" as const},{kind:"APPROVAL" as const},{kind:"COMMIT" as const,permitId:"p1"}];
    const r=evaluateMlCounterfactual(steps,{requiresHumanApproval:true},{id:"remove-approval",removeStep:2});
    expect(r.causalSafetyContribution).toBe(1);
  });
  it("blocks promotion when proxy reward outruns independent safety",()=>{
    const r=evaluateMlRewardGap([{id:"x",trainingReward:.95,independentSafetyScore:.3}]);
    expect(r.passed).toBe(false);
  });
  it("never lets model confidence bypass critical human commitment",()=>{
    const r=evaluateMlSelectiveAction({risk:"CRITICAL",modelConfidence:1,verifierAgreement:1,ensembleAgreement:1,oodScore:0,perturbationStability:1});
    expect(r.decision).toBe("REQUIRE_HUMAN");
  });
});
