import type {ProofAssessment,ProofObservation,ProofPlan} from "@latch/contracts/proof";

const now=()=>new Date().toISOString();
const independent=(o:ProofObservation)=>["CIEAV_OBSERVER","TRUSTED_ADAPTER","EXTERNAL_SIGNED"].includes(o.provenance??"UNVERIFIED")||(o.kind==="HUMAN_ATTESTATION"&&o.provenance==="HUMAN_ATTESTATION");
export function evaluateProof(plan:ProofPlan,observations:ProofObservation[],at=Date.now()):ProofAssessment{
  const supporting=observations.filter(x=>x.signal==="SUPPORTS"),trustedSupporting=supporting.filter(independent),contradicting=observations.filter(x=>x.signal==="CONTRADICTS"),neutral=observations.filter(x=>x.signal==="NEUTRAL");
  const missingRequired=plan.requirements.filter(r=>r.required&&!trustedSupporting.some(o=>o.kind===r.kind&&o.confidence>=r.minConfidence)).map(r=>r.kind);
  const materialContradictions=contradicting.filter(o=>{const requirement=plan.requirements.find(r=>r.kind===o.kind);return o.confidence>=(requirement?.minConfidence??.7)});
  const warnings:string[]=[],deadlinePassed=Boolean(plan.deadline&&Date.parse(plan.deadline)<=at);let status:ProofAssessment["status"];
  if(materialContradictions.length)status="CONTRADICTED";
  else if(!missingRequired.length&&trustedSupporting.length>0)status="PROVEN";
  else if(trustedSupporting.length)status=deadlinePassed?"UNKNOWN":"PARTIAL";
  else status=deadlinePassed?"UNKNOWN":"PENDING";
  if(deadlinePassed&&missingRequired.length)warnings.push("Verification deadline passed without all required independent evidence.");
  if(materialContradictions.length)warnings.push("Evidence contradicts the expected outcome.");
  if(supporting.some(o=>!independent(o)))warnings.push("Agent or unverified self-report cannot satisfy independent proof requirements.");
  if(plan.requirements.length===0&&!trustedSupporting.length)warnings.push("At least one trusted observation is required before CIEAV can settle an outcome.");
  const relevant=[...trustedSupporting,...materialContradictions],confidence=relevant.length?Math.max(0,Math.min(1,relevant.reduce((s,x)=>s+x.confidence,0)/relevant.length)):0;
  return{status,confidence,evaluatedAt:now(),supporting,contradicting,neutral,missingRequired:[...new Set(missingRequired)],warnings};
}
