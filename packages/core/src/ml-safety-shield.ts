import type {MlTrajectoryStep,MlTrajectoryPolicy} from "./ml-types.js";
import {evaluateMlSafetyTransition,type MlSafetyState,type MlSafetyTransitionInput,type MlSafetyViolation} from "./ml-safety-spec.js";

export interface MlShieldSnapshot{state:MlSafetyState;permitId?:string;permitConsumed:boolean;approvalObserved:boolean;outcome?:"OBSERVED_SUCCESS"|"OBSERVED_FAILURE"|"UNKNOWN"}
export interface MlShieldDecision{allowed:boolean;next:MlShieldSnapshot;violations:readonly MlSafetyViolation[]}

export function initialMlShieldSnapshot():MlShieldSnapshot{return{state:"PROPOSED",permitConsumed:false,approvalObserved:false}}

export function applyMlSafetyShield(snapshot:MlShieldSnapshot,step:MlTrajectoryStep,policy:MlTrajectoryPolicy):MlShieldDecision{
  let to:MlSafetyState=snapshot.state,permitId=snapshot.permitId,permitConsumed=snapshot.permitConsumed,approvalObserved=snapshot.approvalObserved,outcome=snapshot.outcome;
  const extra:MlSafetyViolation[]=[];
  switch(step.kind){
    case "ANALYZE":to="POLICY_VERIFIED";break;
    case "PREVIEW":to="PREVIEWED";break;
    case "APPROVAL":approvalObserved=true;to="APPROVED";break;
    case "PERMIT":permitId=step.permitId;to="PERMIT_ISSUED";break;
    case "TOOL":{
      if(step.tool&&policy.allowedTools&&!policy.allowedTools.includes(step.tool))extra.push({id:"unauthorized_tool",hard:true,detail:`tool:${step.tool}`});
      to=snapshot.state;break;
    }
    case "COMMIT":permitId=step.permitId??permitId;to="COMMITTED";break;
    case "OUTCOME":outcome=step.outcome;to=step.outcome??"UNKNOWN";break;
    case "UNDO":to="UNDO_ELIGIBLE";break;
    case "OBSERVE":to=snapshot.state;break;
  }
  const input:MlSafetyTransitionInput={from:snapshot.state,to,requiresHumanApproval:policy.requiresHumanApproval,approvalObserved,permitId,permitConsumed,authorizedTool:step.authorized,secretLeak:Boolean(step.payload&&policy.forbiddenFragments?.some(x=>x&&step.payload!.includes(x))),claimsSuccess:step.claimsSuccess,observedOutcome:outcome,inverseCredible:step.inverseCredible};
  const checked=to===snapshot.state?{allowed:true,violations:[] as MlSafetyViolation[]}:evaluateMlSafetyTransition(input);
  const violations=[...checked.violations,...extra];
  if(step.kind==="COMMIT"&&violations.length===0)permitConsumed=true;
  return{allowed:violations.length===0,next:{state:violations.length?snapshot.state:to,permitId,permitConsumed,approvalObserved,outcome},violations};
}

export function evaluateMlTrajectoryWithShield(steps:readonly MlTrajectoryStep[],policy:MlTrajectoryPolicy){let snapshot=initialMlShieldSnapshot();const violations:MlSafetyViolation[]=[];for(const step of steps){const decision=applyMlSafetyShield(snapshot,step,policy);violations.push(...decision.violations);snapshot=decision.next;if(decision.violations.some(x=>x.hard))break}return{allowed:violations.length===0,finalState:snapshot.state,violations}}
