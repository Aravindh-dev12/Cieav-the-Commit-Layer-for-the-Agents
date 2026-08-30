import {
  CanonicalRealityResolutionSchema,
  ConsequenceMaterializationSchema,
  type CanonicalRealityResolution,
  type ConsequenceMaterialization,
  type ExecutionProposal
} from "@cieav/contracts";
import {consequenceAlgebraDigest,makeConsequenceFootprint,makeSemanticEffectIdentity,materializeExecutionProposal} from "./consequence-algebra.js";

const replaceRef=(values:string[],previous:string,next:string)=>values.map(value=>value===previous?next:value);

export function materializeResolvedExecutionProposal(proposal:ExecutionProposal,rawResolution:CanonicalRealityResolution):ConsequenceMaterialization{
  const resolution=CanonicalRealityResolutionSchema.parse(rawResolution);
  if(resolution.authority!==false||resolution.mayMintExecutionAuthority!==false)throw new Error("canonical_reality_resolution_authority_violation");
  const expectedAuthorityDomain=`device:${proposal.scopeDeviceId}`;
  if(resolution.address.authorityDomain!==expectedAuthorityDomain)throw new Error("canonical_reality_resolution_authority_domain_mismatch");
  const base=materializeExecutionProposal(proposal),previousRef=base.realityAddress.addressDigest,nextRef=resolution.canonicalRealityRef;
  const footprint=makeConsequenceFootprint({
    readSet:replaceRef(base.footprint.readSet,previousRef,nextRef),
    writeSet:replaceRef(base.footprint.writeSet,previousRef,nextRef),
    createSet:replaceRef(base.footprint.createSet,previousRef,nextRef),
    deleteSet:replaceRef(base.footprint.deleteSet,previousRef,nextRef),
    grantSet:replaceRef(base.footprint.grantSet,previousRef,nextRef),
    revokeSet:replaceRef(base.footprint.revokeSet,previousRef,nextRef),
    authorityUse:base.footprint.authorityUse,
    credentialUse:base.footprint.credentialUse,
    budgetDeltas:base.footprint.budgetDeltas,
    privacyExternalities:base.footprint.privacyExternalities,
    proofDependencies:base.footprint.proofDependencies,
    invariantsTouched:base.footprint.invariantsTouched,
    ...(base.footprint.spatial?{spatial:base.footprint.spatial}:{}),
    ...(base.footprint.temporal?{temporal:base.footprint.temporal}:{})
  });
  const normalizedSemanticEffect={...proposal.semanticEffect,target:resolution.address.stableId};
  const semanticIdentity=makeSemanticEffectIdentity({
    effectClass:proposal.semanticEffect.kind,
    targetRealityRefs:[nextRef],
    transitionShape:normalizedSemanticEffect,
    normalizedDeltaDigest:consequenceAlgebraDigest({semanticEffect:normalizedSemanticEffect,realityRef:nextRef}),
    invariantContextDigest:consequenceAlgebraDigest({invariantsTouched:footprint.invariantsTouched,budgetDimensions:Object.keys(footprint.budgetDeltas).sort()}),
    authorityDomain:resolution.address.authorityDomain,
    resolverId:resolution.address.resolverId,
    resolverVersion:resolution.address.resolverVersion
  });
  return ConsequenceMaterializationSchema.parse({...base,realityAddress:resolution.address,semanticIdentity,footprint,authority:false});
}
