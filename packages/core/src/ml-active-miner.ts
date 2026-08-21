export interface MlFailureSignal{
  id:string;
  reward:number;
  verifierDisagreement:number;
  ensembleDisagreement:number;
  oodScore:number;
  perturbationInstability:number;
  safetyShieldViolations:number;
  humanLabelCost?:number;
}
export interface MlFailurePriority extends MlFailureSignal{priority:number;reasons:readonly string[]}

export function prioritizeMlFailures(rows:readonly MlFailureSignal[],limit=100):MlFailurePriority[]{
  return rows.map(row=>{
    const reasons:string[]=[];
    if(row.reward<0)reasons.push("negative_reward");
    if(row.verifierDisagreement>.2)reasons.push("verifier_disagreement");
    if(row.ensembleDisagreement>.2)reasons.push("ensemble_disagreement");
    if(row.oodScore>.4)reasons.push("ood");
    if(row.perturbationInstability>.1)reasons.push("metamorphic_instability");
    if(row.safetyShieldViolations>0)reasons.push("shield_violation");
    const cost=Math.max(.25,row.humanLabelCost??1),severity=Math.max(0,-row.reward)+2*row.verifierDisagreement+1.5*row.ensembleDisagreement+1.5*row.oodScore+2*row.perturbationInstability+3*Math.min(1,row.safetyShieldViolations);
    return{...row,priority:severity/cost,reasons};
  }).sort((a,b)=>b.priority-a.priority).slice(0,Math.max(0,limit));
}

export type MlCurriculumBand="KNOWN"|"BOUNDARY"|"TEACHER_ASSISTED"|"ADVERSARIAL"|"OOD";
export function classifyMlCurriculumBand(row:MlFailureSignal):MlCurriculumBand{
  if(row.safetyShieldViolations>0||row.perturbationInstability>.25)return"ADVERSARIAL";
  if(row.oodScore>.65)return"OOD";
  if(row.verifierDisagreement>.35||row.ensembleDisagreement>.35)return"TEACHER_ASSISTED";
  if(row.reward<.4||row.verifierDisagreement>.15||row.ensembleDisagreement>.15)return"BOUNDARY";
  return"KNOWN";
}
