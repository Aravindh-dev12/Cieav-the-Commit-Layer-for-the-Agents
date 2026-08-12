import type {BusinessRealityPlan,BusinessReconciliation,DesiredStateAssertion,ObservedBusinessFact,StateValue} from "@latch/contracts/business";

const same=(a:StateValue|undefined,b:StateValue|undefined)=>JSON.stringify(a)===JSON.stringify(b);
const trusted=(fact:ObservedBusinessFact)=>["CIEAV_OBSERVER","TRUSTED_CONNECTOR","EXTERNAL_SIGNED","HUMAN_ATTESTATION"].includes(fact.provenance??"UNVERIFIED");
function expectedText(a:DesiredStateAssertion){return `${a.entity.kind}:${a.entity.id}.${a.field} ${a.operator}${a.expected!==undefined?` ${JSON.stringify(a.expected)}`:""}`}
function observedText(f?:ObservedBusinessFact){if(!f)return"No credible observation";return f.exists?`${JSON.stringify(f.value)} from ${f.source}`:`Absent according to ${f.source}`}
function assertionMatches(a:DesiredStateAssertion,f:ObservedBusinessFact){switch(a.operator){case"EXISTS":return f.exists;case"ABSENT":return!f.exists;case"EQUALS":return f.exists&&same(f.value,a.expected);case"NOT_EQUALS":return f.exists&&!same(f.value,a.expected);case"AT_MOST":return f.exists&&typeof f.value==="number"&&typeof a.expected==="number"&&f.value<=a.expected;case"AT_LEAST":return f.exists&&typeof f.value==="number"&&typeof a.expected==="number"&&f.value>=a.expected;case"CONTAINS":return f.exists&&typeof f.value==="string"&&typeof a.expected==="string"&&f.value.includes(a.expected)}}
export function reconcileBusinessReality(plan:BusinessRealityPlan,facts:ObservedBusinessFact[],at=Date.now()):BusinessReconciliation{
  const differences:BusinessReconciliation["differences"]=[];let matched=0,mismatched=0,missingEvidence=0,overdue=0;
  for(const assertion of plan.assertions){
    const candidates=facts.filter(f=>f.entity.kind===assertion.entity.kind&&f.entity.id===assertion.entity.id&&f.field===assertion.field&&trusted(f)).sort((a,b)=>b.observedAt.localeCompare(a.observedAt)),fact=candidates.find(f=>f.confidence>=.5);
    if(!fact){missingEvidence++;const late=Boolean(assertion.expectedBy&&Date.parse(assertion.expectedBy)<=at);if(late)overdue++;differences.push({assertionId:assertion.id,status:late?"OVERDUE":"MISSING_EVIDENCE",severity:assertion.severity,expected:expectedText(assertion),observed:"No credible trusted observation",explanation:late?"Expected business state is overdue and cannot be verified from trusted evidence.":"CIEAV does not yet have trusted evidence for this business state."});continue}
    if(assertionMatches(assertion,fact)){matched++;continue}
    mismatched++;const late=Boolean(assertion.expectedBy&&Date.parse(assertion.expectedBy)<=at);if(late)overdue++;differences.push({assertionId:assertion.id,status:late?"OVERDUE":"MISMATCH",severity:assertion.severity,expected:expectedText(assertion),observed:observedText(fact),explanation:late?"Trusted observed business state does not match the expected state and the expectation is overdue.":"Trusted observed business state does not match the expected state."});
  }
  return{planId:plan.id,organizationId:plan.organizationId,evaluatedAt:new Date(at).toISOString(),healthy:mismatched===0&&missingEvidence===0,matched,mismatched,missingEvidence,overdue,differences};
}
