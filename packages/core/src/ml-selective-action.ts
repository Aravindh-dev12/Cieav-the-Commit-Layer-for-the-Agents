import type {RiskLevel} from "@cieav/contracts";

export interface MlSelectiveActionInput{
  risk:RiskLevel;
  modelConfidence:number;
  verifierAgreement:number;
  ensembleAgreement:number;
  oodScore:number;
  perturbationStability:number;
}
export type MlSelectiveActionDecision="ACCEPT"|"ABSTAIN"|"REQUIRE_HUMAN";
export interface MlSelectiveActionResult{decision:MlSelectiveActionDecision;score:number;reasons:readonly string[]}

const riskRank:Record<RiskLevel,number>={LOW:0,MEDIUM:1,HIGH:2,CRITICAL:3};
export function evaluateMlSelectiveAction(input:MlSelectiveActionInput):MlSelectiveActionResult{
  const reasons:string[]=[];
  const score=.2*input.modelConfidence+.3*input.verifierAgreement+.2*input.ensembleAgreement+.2*input.perturbationStability+.1*(1-input.oodScore);
  if(input.oodScore>.55)reasons.push("ood_high");
  if(input.verifierAgreement<.8)reasons.push("verifier_disagreement");
  if(input.ensembleAgreement<.75)reasons.push("ensemble_disagreement");
  if(input.perturbationStability<.9)reasons.push("counterfactual_instability");
  if(riskRank[input.risk]>=riskRank.CRITICAL)return{decision:"REQUIRE_HUMAN",score,reasons:[...reasons,"critical_requires_human"]};
  if(riskRank[input.risk]>=riskRank.HIGH&&(score<.9||reasons.length))return{decision:"REQUIRE_HUMAN",score,reasons:[...reasons,"high_risk_selective_escalation"]};
  if(score<.75||reasons.length)return{decision:"ABSTAIN",score,reasons};
  return{decision:"ACCEPT",score,reasons};
}
