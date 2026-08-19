export * from "./policy.js";
export * from "./redaction.js";
export * from "./commitment.js";
export * from "./agent-task.js";
export * from "./intent-reality.js";

import type {ActionContext,ActionManifest,Reversibility,RiskLevel} from "@cieav/contracts";

export const POLICY_VERSION="cieav-deterministic-v1";
const riskRank:Record<RiskLevel,number>={LOW:0,MEDIUM:1,HIGH:2,CRITICAL:3};
const revRank:Record<Reversibility,number>={REVERSIBLE:0,DELAYABLE:1,COMPENSABLE:2,IRREVERSIBLE:3,UNKNOWN:4};
export function stricterRisk(a:RiskLevel,b:RiskLevel):RiskLevel{return riskRank[a]>=riskRank[b]?a:b}
export function stricterReversibility(a:Reversibility,b:Reversibility):Reversibility{return revRank[a]>=revRank[b]?a:b}

export function heuristicManifest(c:ActionContext):ActionManifest{
  const text=[c.title,c.element.text,c.element.ariaLabel,c.element.declaredSummary,c.form?.submitterText,c.nearbyText].filter(Boolean).join(" ").toLowerCase();
  const dataCategories=[...new Set((c.form?.fields??[]).map(f=>f.dataCategory).filter((x):x is NonNullable<typeof x>=>Boolean(x)))];
  if((c.form?.fileNames.length??0)>0&&!dataCategories.includes("FILE"))dataCategories.push("FILE");if(!dataCategories.length)dataCategories.push("NONE");
  let actionType=c.element.declaredActionType||"web.action",risk:RiskLevel="MEDIUM",reversibility:Reversibility=c.element.declaredReversibility||"UNKNOWN";
  const financial=dataCategories.includes("FINANCIAL")||text.includes("pay")||text.includes("purchase")||text.includes("checkout")||text.includes("transfer");
  const credential=dataCategories.includes("CREDENTIAL")||text.includes("password")||text.includes("passcode")||text.includes("security code");
  const deletion=text.includes("delete")||text.includes("erase");const sharing=text.includes("publish")||text.includes("share")||text.includes("grant access")||dataCategories.includes("FILE");
  if(!c.element.declaredActionType){if(financial)actionType="financial.commit";else if(credential)actionType="credential.submit";else if(deletion)actionType="data.delete";else if(sharing)actionType="data.share";else if(c.element.href)actionType="navigation.open"}
  if(credential){risk="CRITICAL";reversibility="UNKNOWN"}else if(financial){risk="CRITICAL";if(reversibility==="UNKNOWN")reversibility="COMPENSABLE"}else if(deletion||sharing){risk="HIGH";if(sharing&&reversibility==="UNKNOWN")reversibility="COMPENSABLE"}else if(actionType==="navigation.open"){risk="LOW";if(reversibility==="UNKNOWN")reversibility="REVERSIBLE"}
  const summary=(c.element.declaredSummary||c.form?.submitterText||c.element.text||"Perform browser action").slice(0,500);let target:string|undefined;try{target=new URL(c.url).hostname}catch{}
  return{requestId:c.requestId,actionType,summary,actor:"You",...(target?{target}:{}),recipients:[],dataCategories,effects:[`If committed, ${summary}.`],reversibility,undo:{kind:"NONE"},risk,confidence:c.element.declaredActionType?.length?.8:.68,modelUsed:false,warnings:reversibility==="UNKNOWN"?["CIEAV has not verified a reliable reversal path."]:[],evidence:["Deterministic browser-action classification."],policyVersion:POLICY_VERSION};
}

export function shouldUseModel(c:ActionContext,m:ActionManifest){return m.risk!=="LOW"||m.reversibility==="UNKNOWN"||m.confidence<.8||!c.element.declaredActionType}
export function mergeWithModel(a:ActionManifest,b:ActionManifest):ActionManifest{return{...a,actionType:a.actionType==="web.action"?b.actionType:a.actionType,risk:stricterRisk(a.risk,b.risk),reversibility:stricterReversibility(a.reversibility,b.reversibility),recipients:[...new Set([...a.recipients,...b.recipients])].slice(0,20),dataCategories:[...new Set([...a.dataCategories,...b.dataCategories])].slice(0,20),effects:[...new Set([...a.effects,...b.effects])].slice(0,20),warnings:[...new Set([...a.warnings,...b.warnings])].slice(0,20),evidence:[...new Set([...a.evidence,...b.evidence])].slice(0,20),confidence:Math.max(a.confidence,b.confidence),modelUsed:true,policyVersion:POLICY_VERSION}}
