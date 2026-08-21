import type {ActionOutcomeStatus,Reversibility,RiskLevel} from "@cieav/contracts";

export type MlDecisionDisposition="ALLOW"|"PREVIEW"|"REQUIRE_APPROVAL"|"BLOCK"|"ABSTAIN";
export type MlPolicyCheckResult="PASS"|"FAIL"|"UNKNOWN";
export type MlTrajectoryStepKind="OBSERVE"|"ANALYZE"|"PREVIEW"|"APPROVAL"|"PERMIT"|"TOOL"|"COMMIT"|"OUTCOME"|"UNDO";

export interface MlCandidateDecision{
  actionType:string;
  risk:RiskLevel;
  reversibility:Reversibility;
  confidence:number;
  abstain?:boolean;
  promptInjectionSuspected?:boolean;
  verifierUsed?:boolean;
  explanation?:string;
  evidence?:readonly string[];
  warnings?:readonly string[];
  exposedData?:readonly string[];
}

export interface MlSoftRequirement{
  id:string;
  anyOfTerms:readonly string[];
  weight?:number;
  required?:boolean;
}

export interface MlExpectedPolicyCheck{
  id:string;
  result:MlPolicyCheckResult;
  critical?:boolean;
}

export interface MlExpectedProcess{
  requiredFacts?:readonly string[];
  requiredRiskFactors?:readonly string[];
  policyChecks?:readonly MlExpectedPolicyCheck[];
  disposition?:MlDecisionDisposition;
}

export interface MlDecisionExpectation{
  actionTypes:readonly string[];
  risk:RiskLevel;
  reversibility:Reversibility;
  promptInjection?:boolean;
  requireVerifier?:boolean;
  shouldAbstain?:boolean;
  forbiddenFragments?:readonly string[];
  softRequirements?:readonly MlSoftRequirement[];
  process?:MlExpectedProcess;
}

export interface MlProcessTrace{
  facts:readonly string[];
  riskFactors:readonly string[];
  policyChecks:readonly {id:string;result:MlPolicyCheckResult}[];
  disposition:MlDecisionDisposition;
}

export interface MlTrajectoryStep{
  kind:MlTrajectoryStepKind;
  tool?:string;
  authorized?:boolean;
  permitId?:string;
  outcome?:ActionOutcomeStatus;
  claimsSuccess?:boolean;
  inverseCredible?:boolean;
  payload?:string;
}

export interface MlTrajectoryPolicy{
  allowedTools?:readonly string[];
  requiresHumanApproval?:boolean;
  forbiddenFragments?:readonly string[];
}

export type MlRewardComponentId="action"|"risk"|"reversibility"|"injection"|"verifier"|"privacy"|"process"|"soft"|"trajectory"|"calibration"|"abstention"|"reward-hacking";
export interface MlRewardComponent{
  id:MlRewardComponentId;
  score:number;
  weight:number;
  hardFailure:boolean;
  detail:string;
}

export interface MlRewardResult{
  score:number;
  hardFailure:boolean;
  components:readonly MlRewardComponent[];
}

export interface MlPromotionSample{
  id:string;
  expectedRisk:RiskLevel;
  reward:number;
  hardFailure:boolean;
  riskUnderclassified:boolean;
  calibrationError:number;
  shouldAbstain:boolean;
  abstained:boolean;
  rewardHackingDetected?:boolean;
}

export interface MlPromotionThresholds{
  maxCriticalFalseNegatives:number;
  maxHighFalseNegatives:number;
  maxHardSafetyFailures:number;
  maxRewardHackingCases:number;
  minMeanReward:number;
  minP10Reward:number;
  maxMeanCalibrationError:number;
  minAbstentionRecall:number;
}

export interface MlPromotionReport{
  passed:boolean;
  metrics:{
    samples:number;
    criticalFalseNegatives:number;
    highFalseNegatives:number;
    hardSafetyFailures:number;
    rewardHackingCases:number;
    meanReward:number;
    p10Reward:number;
    meanCalibrationError:number;
    abstentionRecall:number;
  };
  thresholds:MlPromotionThresholds;
  violations:readonly string[];
}
