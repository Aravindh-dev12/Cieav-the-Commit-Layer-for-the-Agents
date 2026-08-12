import type {ActionProposal,IntentContract} from "@latch/contracts/reality";
import type {EnterprisePolicyDecision,EnterprisePolicyRule,OrganizationPolicy,PrincipalPolicyBinding} from "@latch/contracts/policy";

const riskRank={LOW:0,MEDIUM:1,HIGH:2,CRITICAL:3} as const;
const includesTarget=(values:string[],target?:string)=>{if(!target)return false;const t=target.toLowerCase();return values.some(v=>{const x=v.toLowerCase();return t===x||t.endsWith(`.${x}`)||t.includes(x)})};
const roleSet=(binding?:PrincipalPolicyBinding)=>new Set(binding?.roles??[]);
const attrMatch=(required:Record<string,string>,binding?:PrincipalPolicyBinding)=>Object.entries(required).every(([k,v])=>binding?.attributes?.[k]===v);
function ruleBaseMatches(rule:EnterprisePolicyRule,proposal:ActionProposal){
  if(rule.actorKinds.length&&!rule.actorKinds.includes(proposal.actor.kind))return false;
  if(rule.actionTypes.length&&!rule.actionTypes.includes(proposal.actionType))return false;
  if(rule.effectClasses.length&&!rule.effectClasses.includes(proposal.effect.class))return false;
  if(rule.targets.length&&!includesTarget(rule.targets,proposal.effect.target))return false;
  if(rule.dataCategoriesAny.length&&!proposal.effect.dataCategories.some(x=>rule.dataCategoriesAny.includes(x)))return false;
  if(rule.minRisk&&riskRank[proposal.risk]<riskRank[rule.minRisk])return false;
  return true;
}
export function evaluateEnterprisePolicy(policy:OrganizationPolicy,intent:IntentContract,proposal:ActionProposal):EnterprisePolicyDecision{
  const reasons:string[]=[],matchedRuleIds:string[]=[];const binding=policy.bindings.find(x=>x.principalId===proposal.actor.id),roles=roleSet(binding);
  if(!policy.enabled)return{decision:"ALLOW",organizationId:policy.organizationId,policyId:policy.id,policyVersion:policy.version,reasons:["Organization policy is disabled; no additional restriction applied."],matchedRuleIds,actorRoles:[...roles],evaluatedAt:new Date().toISOString()};
  if(intent.contextLabels.organizationId&&intent.contextLabels.organizationId!==policy.organizationId)reasons.push("Intent organization does not match the evaluated enterprise policy.");
  if(policy.deniedActionTypes.includes(proposal.actionType))reasons.push("Enterprise policy denies this action type.");
  if(includesTarget(policy.deniedTargets,proposal.effect.target))reasons.push("Enterprise policy denies this target.");
  if(proposal.effect.dataCategories.some(x=>policy.deniedDataCategories.includes(x)))reasons.push("Enterprise policy denies one or more data categories in this action.");
  if(policy.maxRisk&&riskRank[proposal.risk]>riskRank[policy.maxRisk])reasons.push(`Enterprise policy caps risk at ${policy.maxRisk}.`);
  if(policy.maxAmount&&proposal.effect.amount&&(policy.maxAmount.currency!==proposal.effect.amount.currency||proposal.effect.amount.value>policy.maxAmount.value))reasons.push("Enterprise policy amount limit would be exceeded.");
  if(policy.allowExternalRecipients===false&&proposal.effect.recipients.length)reasons.push("Enterprise policy forbids external recipients.");
  if(reasons.length)return{decision:"BLOCK",organizationId:policy.organizationId,policyId:policy.id,policyVersion:policy.version,reasons,matchedRuleIds,actorRoles:[...roles],evaluatedAt:new Date().toISOString()};
  let ask=false;
  for(const rule of policy.rules){
    if(!ruleBaseMatches(rule,proposal))continue;
    if(!attrMatch(rule.requiredAttributes,binding))continue;
    matchedRuleIds.push(rule.id);
    const missingRoles=rule.requiredRoles.filter(r=>!roles.has(r));
    if(missingRoles.length){reasons.push(`Enterprise policy rule '${rule.name}' requires roles: ${missingRoles.join(", ")}.`);return{decision:"BLOCK",organizationId:policy.organizationId,policyId:policy.id,policyVersion:policy.version,reasons,matchedRuleIds,actorRoles:[...roles],evaluatedAt:new Date().toISOString()}}
    if(rule.effect==="DENY"){reasons.push(rule.reason);return{decision:"BLOCK",organizationId:policy.organizationId,policyId:policy.id,policyVersion:policy.version,reasons,matchedRuleIds,actorRoles:[...roles],evaluatedAt:new Date().toISOString()}}
    if(rule.effect==="REQUIRE_APPROVAL"){ask=true;reasons.push(rule.reason)}
  }
  return{decision:ask?"ASK":"ALLOW",organizationId:policy.organizationId,policyId:policy.id,policyVersion:policy.version,reasons:reasons.length?reasons:["Action satisfies the active enterprise policy; no additional restriction is required."],matchedRuleIds,actorRoles:[...roles],evaluatedAt:new Date().toISOString()};
}

export function combineAuthorityDecisions(intentDecision:{decision:"ALLOW"|"ASK"|"BLOCK"},policyDecision?:EnterprisePolicyDecision|null){
  if(intentDecision.decision==="BLOCK"||policyDecision?.decision==="BLOCK")return"BLOCK" as const;
  if(intentDecision.decision==="ASK"||policyDecision?.decision==="ASK")return"ASK" as const;
  return"ALLOW" as const;
}
