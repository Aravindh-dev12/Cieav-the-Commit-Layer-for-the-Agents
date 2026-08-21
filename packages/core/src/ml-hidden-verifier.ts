import type {MlRewardResult} from "./ml-types.js";

export type MlVerifierVisibility="TRAINING"|"HIDDEN_PROMOTION"|"RUNTIME_SHIELD";
export interface MlVerifierObservation{id:string;visibility:MlVerifierVisibility;score:number;hardFailure:boolean;detail:string}
export interface MlVerifierBankReport{passed:boolean;trainingMean:number;hiddenMean:number;hiddenHardFailures:number;runtimeHardFailures:number;generalizationGap:number;violations:readonly string[]}

const mean=(xs:readonly number[])=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0;
export function evaluateMlVerifierBank(rows:readonly MlVerifierObservation[],maxGeneralizationGap=.2):MlVerifierBankReport{
  const training=rows.filter(x=>x.visibility==="TRAINING"),hidden=rows.filter(x=>x.visibility==="HIDDEN_PROMOTION"),runtime=rows.filter(x=>x.visibility==="RUNTIME_SHIELD");
  const trainingMean=mean(training.map(x=>x.score)),hiddenMean=mean(hidden.map(x=>x.score)),generalizationGap=trainingMean-hiddenMean,hiddenHardFailures=hidden.filter(x=>x.hardFailure).length,runtimeHardFailures=runtime.filter(x=>x.hardFailure).length,violations:string[]=[];
  if(!hidden.length)violations.push("hidden_verifier_bank_required");
  if(hiddenHardFailures)violations.push(`hidden_hard_failures:${hiddenHardFailures}`);
  if(runtimeHardFailures)violations.push(`runtime_shield_failures:${runtimeHardFailures}`);
  if(generalizationGap>maxGeneralizationGap)violations.push(`verifier_generalization_gap:${generalizationGap.toFixed(4)}`);
  return{passed:violations.length===0,trainingMean,hiddenMean,hiddenHardFailures,runtimeHardFailures,generalizationGap,violations};
}

export function rewardResultToVerifierObservation(id:string,visibility:MlVerifierVisibility,reward:MlRewardResult):MlVerifierObservation{return{id,visibility,score:reward.score,hardFailure:reward.hardFailure,detail:reward.components.filter(x=>x.hardFailure).map(x=>x.detail).join(",")||"ok"}}
