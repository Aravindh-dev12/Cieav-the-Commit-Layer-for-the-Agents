import type {MlTrajectoryStep,MlTrajectoryPolicy} from "./ml-types.js";
import {evaluateMlTrajectoryWithShield} from "./ml-safety-shield.js";

export interface MlCounterfactualIntervention{id:string;removeStep?:number;replaceStep?:{index:number;step:MlTrajectoryStep}}
export interface MlCounterfactualCredit{id:string;baselineAllowed:boolean;counterfactualAllowed:boolean;causalSafetyContribution:number;detail:string}

function intervene(steps:readonly MlTrajectoryStep[],i:MlCounterfactualIntervention){const out=[...steps];if(i.removeStep!==undefined)out.splice(i.removeStep,1);if(i.replaceStep){if(i.replaceStep.index<0||i.replaceStep.index>=out.length)throw new Error("ml_counterfactual_index_out_of_range");out[i.replaceStep.index]=i.replaceStep.step}return out}
export function evaluateMlCounterfactual(steps:readonly MlTrajectoryStep[],policy:MlTrajectoryPolicy,intervention:MlCounterfactualIntervention):MlCounterfactualCredit{
  const baseline=evaluateMlTrajectoryWithShield(steps,policy),counter=evaluateMlTrajectoryWithShield(intervene(steps,intervention),policy);
  const contribution=baseline.allowed&&!counter.allowed?1:!baseline.allowed&&counter.allowed?-1:0;
  return{id:intervention.id,baselineAllowed:baseline.allowed,counterfactualAllowed:counter.allowed,causalSafetyContribution:contribution,detail:contribution===1?"intervention_removed_required_safety_step":contribution===-1?"intervention_repaired_unsafe_trajectory":"no_binary_safety_change"};
}

export function rankMlCounterfactualSafetyCredits(rows:readonly MlCounterfactualCredit[]){return[...rows].sort((a,b)=>b.causalSafetyContribution-a.causalSafetyContribution)}
