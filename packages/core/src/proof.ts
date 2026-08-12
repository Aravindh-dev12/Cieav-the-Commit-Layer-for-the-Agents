import type {ProofAssessment,ProofObservation,ProofPlan} from "@latch/contracts/proof";

const now=()=>new Date().toISOString();
export function evaluateProof(plan:ProofPlan,observations:ProofObservation[],at=Date.now()):ProofAssessment{
  const supporting=observations.filter(x=>x.signal==="SUPPORTS");
  const contradicting=observations.filter(x=>x.signal==="CONTRADICTS");
  const neutral=observations.filter(x=>x.signal==="NEUTRAL");
  const missingRequired=plan.requirements.filter(r=>r.required&&!supporting.some(o=>o.kind===r.kind&&o.confidence>=r.minConfidence)).map(r=>r.kind);
  const materialContradictions=contradicting.filter(o=>{
    const requirement=plan.requirements.find(r=>r.kind===o.kind);
    return o.confidence>=(requirement?.minConfidence??.7);
  });
  const warnings:string[]=[];
  const deadlinePassed=Boolean(plan.deadline&&Date.parse(plan.deadline)<=at);
  let status:ProofAssessment["status"];
  if(materialContradictions.length)status="CONTRADICTED";
  else if(!missingRequired.length&&(supporting.length>0||plan.requirements.length===0))status="PROVEN";
  else if(supporting.length)status=deadlinePassed?"UNKNOWN":"PARTIAL";
  else status=deadlinePassed?"UNKNOWN":"PENDING";
  if(deadlinePassed&&missingRequired.length)warnings.push("Verification deadline passed without all required independent evidence.");
  if(materialContradictions.length)warnings.push("Independent evidence contradicts the expected outcome.");
  const relevant=[...supporting,...materialContradictions];
  const confidence=relevant.length?Math.max(0,Math.min(1,relevant.reduce((s,x)=>s+x.confidence,0)/relevant.length)):0;
  return{status,confidence,evaluatedAt:now(),supporting,contradicting,neutral,missingRequired:[...new Set(missingRequired)],warnings};
}
