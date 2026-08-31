import crypto from "node:crypto";
import {
  ConsequenceAuthorityEnvelopeSchema,
  type ConsequenceAuthorityEnvelope,
  type ConsequenceAuthorityRoute
} from "@cieav/contracts/consequence-authority-envelope";

const canonical=(value:unknown):string=>Array.isArray(value)
  ?`[${value.map(canonical).join(",")}]`
  :value&&typeof value==="object"
    ?`{${Object.keys(value as Record<string,unknown>).sort().map(key=>`${JSON.stringify(key)}:${canonical((value as Record<string,unknown>)[key])}`).join(",")}}`
    :JSON.stringify(value)??"undefined";

export const consequenceAuthorityEnvelopeDigest=(value:unknown)=>crypto.createHash("sha256").update(canonical(value)).digest("hex");
const uniq=(values:string[])=>[...new Set(values)].sort();

export type ConsequenceAuthorityEnvelopeInput={
  consequenceRef:string;
  semanticIdentityDigest:string;
  bundleDigest:string;
  canonicalRealityRefs:string[];
  permittedEffectClasses:ConsequenceAuthorityEnvelope["permittedEffectClasses"];
  permittedBudgetDeltas:Record<string,number>;
  invariantWitnesses:unknown[];
  reservation:unknown;
  proofPlan?:unknown|null;
  quarantineClosureDigests:string[];
  authorityPolicy:unknown;
  trustedToolBindingDigest:string;
  canonicalRealityResolutionDigest:string;
  permittedRoutes:ConsequenceAuthorityRoute[];
  ttlSeconds?:number;
  at?:Date;
};

function envelopeDigestBase(envelope:Omit<ConsequenceAuthorityEnvelope,"envelopeDigest">){return envelope}

export function mintConsequenceAuthorityEnvelope(input:ConsequenceAuthorityEnvelopeInput):ConsequenceAuthorityEnvelope{
  if(!input.canonicalRealityRefs.length)throw new Error("consequence_authority_canonical_reality_required");
  if(!input.permittedEffectClasses.length)throw new Error("consequence_authority_effect_class_required");
  if(!input.permittedRoutes.length)throw new Error("consequence_authority_route_required");
  const at=input.at??new Date(),ttl=Math.max(5,Math.min(3600,Math.floor(input.ttlSeconds??30)));
  const base:Omit<ConsequenceAuthorityEnvelope,"envelopeDigest">={
    id:crypto.randomUUID(),
    version:"CIEAV_CONSEQUENCE_AUTHORITY_ENVELOPE_V1",
    consequenceRef:input.consequenceRef,
    semanticIdentityDigest:input.semanticIdentityDigest,
    bundleDigest:input.bundleDigest,
    canonicalRealityRefs:uniq(input.canonicalRealityRefs),
    permittedEffectClasses:[...new Set(input.permittedEffectClasses)].sort() as ConsequenceAuthorityEnvelope["permittedEffectClasses"],
    permittedBudgetDeltas:Object.fromEntries(Object.entries(input.permittedBudgetDeltas).sort(([a],[b])=>a.localeCompare(b))),
    invariantWitnessDigest:consequenceAuthorityEnvelopeDigest(input.invariantWitnesses),
    reservationDigest:consequenceAuthorityEnvelopeDigest(input.reservation),
    proofPlanDigest:input.proofPlan?consequenceAuthorityEnvelopeDigest(input.proofPlan):null,
    quarantineClosureDigests:uniq(input.quarantineClosureDigests),
    quarantineSnapshotDigest:consequenceAuthorityEnvelopeDigest(uniq(input.quarantineClosureDigests)),
    authorityPolicyDigest:consequenceAuthorityEnvelopeDigest(input.authorityPolicy),
    trustedToolBindingDigest:input.trustedToolBindingDigest,
    canonicalRealityResolutionDigest:input.canonicalRealityResolutionDigest,
    permittedRoutes:input.permittedRoutes
      .map<ConsequenceAuthorityRoute>(route=>({...route,authority:false as const,mayMintExecutionAuthority:false as const}))
      .sort((a,b)=>a.routeId.localeCompare(b.routeId)),
    issuedAt:at.toISOString(),
    expiresAt:new Date(at.getTime()+ttl*1000).toISOString(),
    oneUse:true,
    authority:true,
    authorityClass:"CONSEQUENCE_BOUND_EXECUTION",
    mayMintExecutionAuthority:false
  };
  return ConsequenceAuthorityEnvelopeSchema.parse({...base,envelopeDigest:consequenceAuthorityEnvelopeDigest(envelopeDigestBase(base))});
}

export function verifyConsequenceAuthorityEnvelope(envelope:ConsequenceAuthorityEnvelope,at=new Date()){
  const parsed=ConsequenceAuthorityEnvelopeSchema.parse(envelope),{envelopeDigest,...base}=parsed;
  if(consequenceAuthorityEnvelopeDigest(envelopeDigestBase(base))!==envelopeDigest)throw new Error("consequence_authority_envelope_integrity_mismatch");
  if(Date.parse(parsed.expiresAt)<=at.getTime())throw new Error("consequence_authority_envelope_expired");
  if(parsed.authority!==true||parsed.authorityClass!=="CONSEQUENCE_BOUND_EXECUTION"||parsed.mayMintExecutionAuthority!==false||parsed.oneUse!==true)throw new Error("consequence_authority_envelope_authority_invariant_mismatch");
  return parsed;
}

export function assertConsequenceAuthorityRoute(envelope:ConsequenceAuthorityEnvelope,route:{routeId:string;routeDigest:string;toolId:string;protocol:string;operation:string;normalizedArgumentsDigest:string;trustedToolBindingDigest:string;canonicalRealityResolutionDigest:string}){
  const parsed=verifyConsequenceAuthorityEnvelope(envelope),match=parsed.permittedRoutes.find(candidate=>candidate.routeId===route.routeId);
  if(!match)throw new Error("consequence_authority_route_not_permitted");
  if(match.routeDigest!==route.routeDigest||match.toolId!==route.toolId||match.protocol!==route.protocol||match.operation!==route.operation||match.normalizedArgumentsDigest!==route.normalizedArgumentsDigest||match.trustedToolBindingDigest!==route.trustedToolBindingDigest||match.canonicalRealityResolutionDigest!==route.canonicalRealityResolutionDigest)throw new Error("consequence_authority_route_binding_mismatch");
  return match;
}

export const CONSEQUENCE_AUTHORITY_ENVELOPE_MAY_MINT_AUTHORITY=false as const;
