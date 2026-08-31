import {
  CanonicalRealityResolutionSchema,
  ConsequenceMaterializationSchema,
  type CanonicalRealityResolution,
  type ConsequenceMaterialization,
  type ExecutionProposal
} from "@cieav/contracts";
import {consequenceAlgebraDigest,makeConsequenceFootprint,makeSemanticEffectIdentity,materializeExecutionProposal} from "./consequence-algebra.js";

const canonical=(value:unknown):string=>Array.isArray(value)
  ? `[${value.map(canonical).join(",")}]`
  : value&&typeof value==="object"
    ? `{${Object.keys(value as Record<string,unknown>).sort().map(key=>`${JSON.stringify(key)}:${canonical((value as Record<string,unknown>)[key])}`).join(",")}}`
    : JSON.stringify(value)??"undefined";

const replaceRef=(values:string[],previous:string,next:string)=>values.map(value=>value===previous?next:value);
const replaceInvariantRef=(values:string[],previous:string,next:string)=>values.map(value=>value===`resource:${previous}`?`resource:${next}`:value);

export function materializeResolvedExecutionProposal(proposal:ExecutionProposal,rawResolution:CanonicalRealityResolution):ConsequenceMaterialization{
  const resolution=CanonicalRealityResolutionSchema.parse(rawResolution);
  if(resolution.authority!==false||resolution.mayMintExecutionAuthority!==false)throw new Error("canonical_reality_resolution_authority_violation");
  const expectedAuthorityDomain=`device:${proposal.scopeDeviceId}`;
  if(resolution.address.authorityDomain!==expectedAuthorityDomain)throw new Error("canonical_reality_resolution_authority_domain_mismatch");

  const base=materializeExecutionProposal(proposal),previousRef=base.semanticIdentity.targetRealityRefs[0],nextRef=resolution.canonicalRealityRef;
  if(!previousRef)throw new Error("canonical_reality_previous_ref_required");
  const footprint=makeConsequenceFootprint({
    version:"CIEAV_CONSEQUENCE_FOOTPRINT_V1",
    realityRead:replaceRef(base.footprint.realityRead,previousRef,nextRef),
    realityWrite:replaceRef(base.footprint.realityWrite,previousRef,nextRef),
    create:replaceRef(base.footprint.create,previousRef,nextRef),
    delete:replaceRef(base.footprint.delete,previousRef,nextRef),
    grant:replaceRef(base.footprint.grant,previousRef,nextRef),
    revoke:replaceRef(base.footprint.revoke,previousRef,nextRef),
    authorityUse:base.footprint.authorityUse,
    credentialUse:base.footprint.credentialUse,
    budgetDeltas:base.footprint.budgetDeltas,
    privacyExternalities:base.footprint.privacyExternalities,
    proofDependencies:base.footprint.proofDependencies,
    invariantsTouched:replaceInvariantRef(base.footprint.invariantsTouched,previousRef,nextRef),
    ...(base.footprint.spatialRegion?{spatialRegion:base.footprint.spatialRegion}:{}),
    ...(base.footprint.temporalWindow?{temporalWindow:base.footprint.temporalWindow}:{})
  });

  const normalizedSemanticEffect={
    ...proposal.semanticEffect,
    target:resolution.address.stableId,
    objectRef:proposal.semanticEffect.objectRef??resolution.address.stableId
  };
  const transitionShape=canonical(normalizedSemanticEffect);
  const semanticIdentity=makeSemanticEffectIdentity({
    version:"CIEAV_SEMANTIC_EFFECT_IDENTITY_V1",
    effectClass:proposal.semanticEffect.kind,
    targetRealityRefs:[nextRef],
    transitionShape,
    normalizedDeltaDigest:consequenceAlgebraDigest({semanticEffect:normalizedSemanticEffect,realityRef:nextRef}),
    invariantContextDigest:consequenceAlgebraDigest({scopeDeviceId:proposal.scopeDeviceId,risk:proposal.risk,continuingAuthority:proposal.continuingAuthority??null,invariantsTouched:footprint.invariantsTouched,budgetDimensions:Object.keys(footprint.budgetDeltas).sort()}),
    equivalenceScope:resolution.address.authorityDomain,
    resolverId:resolution.address.resolverId,
    resolverVersion:resolution.address.resolverVersion
  });

  return ConsequenceMaterializationSchema.parse({
    ...base,
    semanticEffect:normalizedSemanticEffect,
    realityAddress:resolution.address,
    semanticIdentity,
    footprint,
    authority:false
  });
}
