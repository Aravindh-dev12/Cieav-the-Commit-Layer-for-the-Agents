import type {ActionOutcomeStatus,RiskLevel} from "@cieav/contracts";

export type MlSafetyState="PROPOSED"|"POLICY_VERIFIED"|"PREVIEWED"|"APPROVED"|"PERMIT_ISSUED"|"COMMITTED"|"OBSERVED_SUCCESS"|"OBSERVED_FAILURE"|"UNKNOWN"|"UNDO_ELIGIBLE"|"TERMINATED";
export type MlSafetyConstraintId="transition_not_allowed"|"human_approval_required"|"permit_required"|"permit_replay"|"unauthorized_tool"|"secret_leak"|"critical_risk_underclassification"|"unsupported_success_claim"|"observed_outcome_mismatch"|"credible_inverse_required";
export interface MlSafetyViolation{id:MlSafetyConstraintId;hard:boolean;detail:string}
export interface MlSafetyTransitionInput{
  from:MlSafetyState;
  to:MlSafetyState;
  predictedRisk?:RiskLevel;
  minimumRisk?:RiskLevel;
  requiresHumanApproval?:boolean;
  approvalObserved?:boolean;
  permitId?:string;
  permitConsumed?:boolean;
  authorizedTool?:boolean;
  secretLeak?:boolean;
  claimsSuccess?:boolean;
  observedOutcome?:ActionOutcomeStatus;
  inverseCredible?:boolean;
}
export interface MlSafetyTransitionResult{allowed:boolean;violations:readonly MlSafetyViolation[]}

const riskRank:Record<RiskLevel,number>={LOW:0,MEDIUM:1,HIGH:2,CRITICAL:3};
const transitions:Record<MlSafetyState,readonly MlSafetyState[]>={
  PROPOSED:["POLICY_VERIFIED","TERMINATED"],
  POLICY_VERIFIED:["PREVIEWED","TERMINATED"],
  PREVIEWED:["APPROVED","PERMIT_ISSUED","TERMINATED"],
  APPROVED:["PERMIT_ISSUED","TERMINATED"],
  PERMIT_ISSUED:["COMMITTED","TERMINATED"],
  COMMITTED:["OBSERVED_SUCCESS","OBSERVED_FAILURE","UNKNOWN","TERMINATED"],
  OBSERVED_SUCCESS:["UNDO_ELIGIBLE","TERMINATED"],
  OBSERVED_FAILURE:["TERMINATED"],
  UNKNOWN:["TERMINATED"],
  UNDO_ELIGIBLE:["TERMINATED"],
  TERMINATED:[]
};
const violation=(id:MlSafetyConstraintId,hard:boolean,detail:string):MlSafetyViolation=>({id,hard,detail});

export function evaluateMlSafetyTransition(input:MlSafetyTransitionInput):MlSafetyTransitionResult{
  const violations:MlSafetyViolation[]=[];
  if(!transitions[input.from].includes(input.to))violations.push(violation("transition_not_allowed",true,`${input.from}->${input.to}`));
  if(input.secretLeak)violations.push(violation("secret_leak",true,"candidate trajectory exposed protected data"));
  if(input.authorizedTool===false)violations.push(violation("unauthorized_tool",true,"tool transition is outside explicit authority"));
  if(input.minimumRisk&&input.predictedRisk&&riskRank[input.minimumRisk]>=riskRank.HIGH&&riskRank[input.predictedRisk]<riskRank[input.minimumRisk])violations.push(violation("critical_risk_underclassification",true,`${input.predictedRisk}<${input.minimumRisk}`));
  if(input.to==="APPROVED"&&!input.approvalObserved)violations.push(violation("human_approval_required",false,"approval state requires independently observed approval"));
  if(input.to==="PERMIT_ISSUED"){
    if(input.requiresHumanApproval&&input.from!=="APPROVED")violations.push(violation("human_approval_required",false,"permit issuance requires approval first"));
    if(!input.permitId)violations.push(violation("permit_required",true,"issued permit must have a concrete identifier"));
  }
  if(input.to==="COMMITTED"){
    if(!input.permitId)violations.push(violation("permit_required",true,"commit requires an explicit permit"));
    if(input.permitConsumed)violations.push(violation("permit_replay",true,"single-use permit has already been consumed"));
  }
  if(input.claimsSuccess&&input.observedOutcome!=="OBSERVED_SUCCESS")violations.push(violation("unsupported_success_claim",true,"success cannot be inferred from commit or an unknown outcome"));
  if(input.to==="OBSERVED_SUCCESS"&&input.observedOutcome!=="OBSERVED_SUCCESS")violations.push(violation("observed_outcome_mismatch",true,"OBSERVED_SUCCESS requires trusted success evidence"));
  if(input.to==="OBSERVED_FAILURE"&&input.observedOutcome!=="OBSERVED_FAILURE")violations.push(violation("observed_outcome_mismatch",true,"OBSERVED_FAILURE requires trusted failure evidence"));
  if(input.to==="UNKNOWN"&&input.observedOutcome!=="UNKNOWN")violations.push(violation("observed_outcome_mismatch",true,"UNKNOWN must remain explicit when reality is unresolved"));
  if(input.to==="UNDO_ELIGIBLE"&&!input.inverseCredible)violations.push(violation("credible_inverse_required",true,"undo requires observed success and a credible inverse"));
  return{allowed:violations.length===0,violations};
}

export const CIEAV_ML_HARD_SAFETY_CONSTRAINTS=Object.freeze([
  "secret_leak","unauthorized_tool","permit_replay","critical_risk_underclassification","unsupported_success_claim","observed_outcome_mismatch","credible_inverse_required"
] satisfies readonly MlSafetyConstraintId[]);
