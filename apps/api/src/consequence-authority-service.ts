import type {
  AlgebraAdmission,
  CanonicalRealityResolution,
  ConsequenceAlgebraPolicy,
  ConsequenceAuthorityEnvelope,
  ConsequenceBundle,
  ConsequenceMaterialization,
  ExecutionProposal,
  FormalAuthorizationDecision,
  RealityQuarantineClosure,
  TrustedToolAuthorizationBinding
} from "@cieav/contracts";
import {mintConsequenceAuthorityEnvelope,verifyConsequenceAuthorityEnvelope} from "@cieav/core/consequence-authority-envelope";
import {digest} from "@cieav/core/execution-fabric";

export type ConsequenceAuthoritySnapshot={
  proposal:ExecutionProposal;
  materialization:ConsequenceMaterialization;
  consequenceBundle:ConsequenceBundle;
  canonicalRealityResolution:CanonicalRealityResolution;
  trustedToolBinding:TrustedToolAuthorizationBinding;
  formalDecision:FormalAuthorizationDecision;
  algebraAdmission:AlgebraAdmission;
  algebraPolicy:ConsequenceAlgebraPolicy;
  quarantineClosures:RealityQuarantineClosure[];
  routeId?:string;
  routeDigest:string;
  adapterArtifactDigest?:string;
  runtimeIdentityDigest?:string;
  ttlSeconds?:number;
  at?:Date;
};

const authorityRelevantQuarantine=(closure:RealityQuarantineClosure,materialization:ConsequenceMaterialization)=>
  closure.status==="OPEN"&&(
    closure.sourceConsequenceRef===materialization.id||
    closure.affectedConsequenceRefs.includes(materialization.id)||
    closure.blockerConsequenceRefs.includes(materialization.id)||
    closure.reconcileCandidateRefs.includes(materialization.id)
  );

export function mintLocalConsequenceAuthority(snapshot:ConsequenceAuthoritySnapshot):ConsequenceAuthorityEnvelope{
  const {proposal,materialization,consequenceBundle,canonicalRealityResolution,trustedToolBinding,formalDecision,algebraAdmission,algebraPolicy}=snapshot;
  if(formalDecision.decision!=="ALLOW")throw new Error("consequence_authority_formal_allow_required");
  if(algebraAdmission.decision!=="ADMIT"||!algebraAdmission.reservation)throw new Error("consequence_authority_algebra_admission_required");
  if(proposal.id!==materialization.id||proposal.id!==algebraAdmission.consequenceRef)throw new Error("consequence_authority_consequence_binding_mismatch");
  if(consequenceBundle.id!==proposal.id||consequenceBundle.taskId!==proposal.taskId||consequenceBundle.intentId!==proposal.intentId)throw new Error("consequence_authority_bundle_identity_mismatch");
  if(consequenceBundle.normalizedArgumentsDigest!==proposal.normalizedArgumentsDigest)throw new Error("consequence_authority_arguments_digest_mismatch");
  if(trustedToolBinding.bindingDigest!==consequenceBundle.trustedToolBindingDigest)throw new Error("consequence_authority_tool_binding_mismatch");
  if(materialization.semanticIdentity.targetRealityRefs.length<1)throw new Error("consequence_authority_reality_ref_required");
  if(!materialization.semanticIdentity.targetRealityRefs.includes(canonicalRealityResolution.canonicalRealityRef))throw new Error("consequence_authority_resolution_materialization_mismatch");
  const primary=consequenceBundle.primaryEffects[0];
  if(!primary||primary.kind!==materialization.semanticIdentity.effectClass||primary.footprint.digest!==materialization.footprint.digest||digest(primary.semanticEffect)!==digest(materialization.semanticEffect)||!primary.realityAddresses.some(address=>address.digest===materialization.realityAddress.digest))throw new Error("consequence_authority_bundle_materialization_mismatch");
  const relevantClosures=snapshot.quarantineClosures.filter(closure=>authorityRelevantQuarantine(closure,materialization));
  if(relevantClosures.some(closure=>closure.blockerConsequenceRefs.includes(materialization.id)||closure.reconcileCandidateRefs.includes(materialization.id)))throw new Error("consequence_authority_quarantine_blocked");
  const routeId=snapshot.routeId??`${proposal.protocol}:${proposal.toolId}:${proposal.operation}`;
  const route={
    routeId,
    toolId:proposal.toolId,
    protocol:proposal.protocol,
    operation:proposal.operation,
    target:proposal.target??null,
    normalizedArgumentsDigest:proposal.normalizedArgumentsDigest,
    trustedToolBindingDigest:trustedToolBinding.bindingDigest,
    canonicalRealityResolutionDigest:canonicalRealityResolution.resolutionDigest,
    routeDigest:snapshot.routeDigest,
    ...(snapshot.adapterArtifactDigest?{adapterArtifactDigest:snapshot.adapterArtifactDigest}:{}),
    ...(snapshot.runtimeIdentityDigest?{runtimeIdentityDigest:snapshot.runtimeIdentityDigest}:{}),
    authority:false as const,
    mayMintExecutionAuthority:false as const
  };
  return mintConsequenceAuthorityEnvelope({
    consequenceRef:materialization.id,
    semanticIdentityDigest:materialization.semanticIdentity.digest,
    bundleDigest:consequenceBundle.bundleDigest,
    canonicalRealityRefs:materialization.semanticIdentity.targetRealityRefs,
    permittedEffectClasses:[proposal.semanticEffect.kind],
    permittedBudgetDeltas:materialization.footprint.budgetDeltas,
    invariantWitnesses:algebraAdmission.invariantWitnesses,
    reservation:algebraAdmission.reservation,
    proofPlan:algebraAdmission.proofPlanReservation??null,
    quarantineClosureDigests:relevantClosures.map(closure=>closure.closureDigest),
    authorityPolicy:{
      formalAuthorizationGraphDigest:formalDecision.graphDigest,
      formalAuthorizationDecisionDigest:digest(formalDecision),
      consequenceAlgebraPolicyDigest:digest(algebraPolicy)
    },
    trustedToolBindingDigest:trustedToolBinding.bindingDigest,
    canonicalRealityResolutionDigest:canonicalRealityResolution.resolutionDigest,
    permittedRoutes:[route],
    ttlSeconds:snapshot.ttlSeconds,
    at:snapshot.at
  });
}

export function assertLocalConsequenceAuthorityCurrent(
  envelope:ConsequenceAuthorityEnvelope,
  snapshot:ConsequenceAuthoritySnapshot,
  at=new Date()
){
  const current=mintLocalConsequenceAuthority({...snapshot,at:new Date(envelope.issuedAt),ttlSeconds:Math.max(5,Math.ceil((Date.parse(envelope.expiresAt)-Date.parse(envelope.issuedAt))/1000))});
  const verified=verifyConsequenceAuthorityEnvelope(envelope,at);
  if(current.semanticIdentityDigest!==verified.semanticIdentityDigest||current.bundleDigest!==verified.bundleDigest||current.invariantWitnessDigest!==verified.invariantWitnessDigest||current.reservationDigest!==verified.reservationDigest||current.proofPlanDigest!==verified.proofPlanDigest||current.quarantineSnapshotDigest!==verified.quarantineSnapshotDigest||current.authorityPolicyDigest!==verified.authorityPolicyDigest||current.trustedToolBindingDigest!==verified.trustedToolBindingDigest||current.canonicalRealityResolutionDigest!==verified.canonicalRealityResolutionDigest||digest(current.permittedRoutes)!==digest(verified.permittedRoutes))throw new Error("consequence_authority_snapshot_drift");
  return verified;
}
