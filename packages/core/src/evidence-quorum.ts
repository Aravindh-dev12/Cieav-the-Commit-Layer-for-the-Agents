import crypto from "node:crypto";
import {
  EvidenceProviderBindingSchema,
  EvidenceQuorumPlanSchema,
  EvidenceQuorumRequirementSchema,
  type ConsequenceMaterialization,
  type EvidenceProviderBinding,
  type EvidenceQuorumPlan,
  type EvidenceQuorumRequirement
} from "@cieav/contracts";

const canonical=(value:unknown):string=>Array.isArray(value)
  ?`[${value.map(canonical).join(",")}]`
  :value&&typeof value==="object"
    ?`{${Object.keys(value as Record<string,unknown>).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(",")}}`
    :JSON.stringify(value)??"undefined";

export const evidenceQuorumDigest=(value:unknown)=>crypto.createHash("sha256").update(canonical(value)).digest("hex");
const riskRank={LOW:0,MEDIUM:1,HIGH:2,CRITICAL:3} as const;
const uniq=(values:string[])=>[...new Set(values)].sort();

export function evidenceRequirementMatches(requirement:EvidenceQuorumRequirement,materialization:ConsequenceMaterialization){
  const r=EvidenceQuorumRequirementSchema.parse(requirement);
  if(!r.enabled)return false;
  if(r.toolIds.length&&!r.toolIds.includes(materialization.toolId))return false;
  if(r.effectClasses.length&&!r.effectClasses.includes(materialization.semanticIdentity.effectClass))return false;
  if(r.minRisk&&riskRank[materialization.risk]<riskRank[r.minRisk])return false;
  return true;
}

export function selectEvidenceQuorumRequirement(materialization:ConsequenceMaterialization,requirements:EvidenceQuorumRequirement[]){
  return requirements
    .map(value=>EvidenceQuorumRequirementSchema.parse(value))
    .filter(value=>evidenceRequirementMatches(value,materialization))
    .sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id))[0];
}

function planDigestBase(plan:Omit<EvidenceQuorumPlan,"id"|"issuedAt"|"expiresAt"|"quorumDigest"|"authority"|"mayMintExecutionAuthority">){
  return {
    version:plan.version,
    consequenceRef:plan.consequenceRef,
    proofObligationDigest:plan.proofObligationDigest,
    requirementRef:plan.requirementRef,
    selectedProviderRefs:plan.selectedProviderRefs,
    selectedProviderVersionDigests:plan.selectedProviderVersionDigests,
    selectedIndependenceDomains:plan.selectedIndependenceDomains,
    requiredEvidenceClasses:plan.requiredEvidenceClasses,
    coveredEvidenceClasses:plan.coveredEvidenceClasses,
    minimumProviders:plan.minimumProviders,
    minimumIndependenceDomains:plan.minimumIndependenceDomains,
    maxEvidenceAgeMs:plan.maxEvidenceAgeMs,
    timeoutOutcome:plan.timeoutOutcome,
    availabilityState:plan.availabilityState,
    unavailableReasons:plan.unavailableReasons
  };
}

function chooseProviders(requirement:EvidenceQuorumRequirement,providers:EvidenceProviderBinding[]){
  const available=providers
    .map(value=>EvidenceProviderBindingSchema.parse(value))
    .filter(value=>value.enabled&&value.health==="AVAILABLE")
    .sort((a,b)=>a.ref.localeCompare(b.ref));
  const selected:EvidenceProviderBinding[]=[];
  const add=(provider:EvidenceProviderBinding|undefined)=>{if(provider&&!selected.some(current=>current.ref===provider.ref))selected.push(provider)};

  for(const evidenceClass of [...requirement.requiredEvidenceClasses].sort()){
    const unusedDomain=available.find(provider=>provider.evidenceClasses.includes(evidenceClass)&&!selected.some(current=>current.independenceDomain===provider.independenceDomain));
    add(unusedDomain??available.find(provider=>provider.evidenceClasses.includes(evidenceClass)));
  }
  while(new Set(selected.map(provider=>provider.independenceDomain)).size<requirement.minimumIndependenceDomains){
    add(available.find(provider=>!selected.some(current=>current.independenceDomain===provider.independenceDomain)));
    if(selected.length===available.length)break;
  }
  for(const provider of available){
    if(selected.length>=requirement.minimumProviders)break;
    add(provider);
  }
  return selected.sort((a,b)=>a.ref.localeCompare(b.ref));
}

export function planEvidenceQuorum(
  materialization:ConsequenceMaterialization,
  providers:EvidenceProviderBinding[],
  requirement:EvidenceQuorumRequirement,
  ttlSeconds=60,
  at=new Date()
):EvidenceQuorumPlan{
  const r=EvidenceQuorumRequirementSchema.parse(requirement),selected=chooseProviders(r,providers),domains=uniq(selected.map(provider=>provider.independenceDomain)),covered=uniq(selected.flatMap(provider=>provider.evidenceClasses));
  const reasons:string[]=[];
  if(selected.length<r.minimumProviders)reasons.push(`evidence_provider_quorum_shortfall:${selected.length}/${r.minimumProviders}`);
  if(domains.length<r.minimumIndependenceDomains)reasons.push(`evidence_independence_quorum_shortfall:${domains.length}/${r.minimumIndependenceDomains}`);
  for(const evidenceClass of r.requiredEvidenceClasses)if(!covered.includes(evidenceClass))reasons.push(`required_evidence_class_unavailable:${evidenceClass}`);
  const ttl=Math.max(5,Math.min(3600,Math.floor(ttlSeconds))),availabilityState=reasons.length?"UNSATISFIABLE" as const:"SATISFIABLE" as const;
  const base={
    version:"CIEAV_EVIDENCE_QUORUM_PLAN_V1" as const,
    consequenceRef:materialization.id,
    proofObligationDigest:materialization.proofObligationDigest,
    requirementRef:r.id,
    selectedProviderRefs:selected.map(provider=>provider.ref),
    selectedProviderVersionDigests:Object.fromEntries(selected.map(provider=>[provider.ref,provider.versionDigest])),
    selectedIndependenceDomains:domains,
    requiredEvidenceClasses:uniq(r.requiredEvidenceClasses),
    coveredEvidenceClasses:covered,
    minimumProviders:r.minimumProviders,
    minimumIndependenceDomains:r.minimumIndependenceDomains,
    maxEvidenceAgeMs:r.maxEvidenceAgeMs,
    timeoutOutcome:"UNKNOWN" as const,
    availabilityState,
    unavailableReasons:reasons
  };
  return EvidenceQuorumPlanSchema.parse({
    id:crypto.randomUUID(),
    ...base,
    quorumDigest:evidenceQuorumDigest(planDigestBase(base)),
    issuedAt:at.toISOString(),
    expiresAt:new Date(at.getTime()+ttl*1000).toISOString(),
    authority:false,
    mayMintExecutionAuthority:false
  });
}

export function assertEvidenceQuorumPlanValid(plan:EvidenceQuorumPlan,providers:EvidenceProviderBinding[],at=new Date()){
  const p=EvidenceQuorumPlanSchema.parse(plan);
  const {id:_,issuedAt:__,expiresAt:___,quorumDigest:____,authority:_____,mayMintExecutionAuthority:______,...digestBase}=p;
  if(evidenceQuorumDigest(planDigestBase(digestBase))!==p.quorumDigest)throw new Error("evidence_quorum_plan_integrity_mismatch");
  if(Date.parse(p.expiresAt)<=at.getTime())throw new Error("evidence_quorum_plan_expired");
  if(p.availabilityState!=="SATISFIABLE")throw new Error("evidence_quorum_unsatisfiable");
  const registry=new Map(providers.map(value=>{const provider=EvidenceProviderBindingSchema.parse(value);return[provider.ref,provider] as const}));
  const selected=p.selectedProviderRefs.map(ref=>registry.get(ref));
  if(selected.some(provider=>!provider||!provider.enabled||provider.health!=="AVAILABLE"))throw new Error("evidence_quorum_provider_unavailable");
  for(const provider of selected as EvidenceProviderBinding[]){
    if(p.selectedProviderVersionDigests[provider.ref]!==provider.versionDigest)throw new Error(`evidence_quorum_provider_version_drift:${provider.ref}`);
  }
  const domains=uniq((selected as EvidenceProviderBinding[]).map(provider=>provider.independenceDomain));
  if(domains.length<p.minimumIndependenceDomains)throw new Error("evidence_quorum_independence_shortfall");
  if(selected.length<p.minimumProviders)throw new Error("evidence_quorum_provider_shortfall");
  const covered=uniq((selected as EvidenceProviderBinding[]).flatMap(provider=>provider.evidenceClasses));
  for(const evidenceClass of p.requiredEvidenceClasses)if(!covered.includes(evidenceClass))throw new Error(`evidence_quorum_evidence_class_missing:${evidenceClass}`);
  return true;
}

export const EVIDENCE_QUORUM_AUTHORITY=false as const;
export const EVIDENCE_QUORUM_MAY_MINT_EXECUTION_AUTHORITY=false as const;
