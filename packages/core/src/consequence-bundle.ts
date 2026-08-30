import crypto from "node:crypto";
import {
  ConsequenceBundleSchema,
  type ConsequenceBundle,
  type ConsequenceMaterialization,
  type ExecutionProposal,
  type TrustedToolAuthorizationBinding
} from "@cieav/contracts";
import {assertTrustedToolAuthorizationBindingIntegrity} from "./execution-fabric.js";

const canonical=(value:unknown):string=>Array.isArray(value)
  ? `[${value.map(canonical).join(",")}]`
  : value&&typeof value==="object"
    ? `{${Object.keys(value as Record<string,unknown>).sort().map(key=>`${JSON.stringify(key)}:${canonical((value as Record<string,unknown>)[key])}`).join(",")}}`
    : JSON.stringify(value)??"undefined";

export const consequenceBundleDigest=(value:unknown)=>crypto.createHash("sha256").update(canonical(value)).digest("hex");
export const CONSEQUENCE_BUNDLE_COMPILER_ID="cieav.execution-proposal.consequence-bundle";
export const CONSEQUENCE_BUNDLE_COMPILER_VERSION="1";
export const CONSEQUENCE_BUNDLE_COMPILER_DIGEST=consequenceBundleDigest({
  id:CONSEQUENCE_BUNDLE_COMPILER_ID,
  version:CONSEQUENCE_BUNDLE_COMPILER_VERSION,
  semantics:"ExecutionProposal + trusted tool binding + deterministic ConsequenceMaterialization -> zero-authority ConsequenceBundleV1"
});

const primaryEffectId=(proposalId:string)=>`${proposalId}:primary`;
const budgetUnit=(dimension:string)=>dimension.startsWith("money:")?dimension.slice("money:".length)||"unit":"unit";

function assertCompilerInput(proposal:ExecutionProposal,binding:TrustedToolAuthorizationBinding,materialization:ConsequenceMaterialization){
  assertTrustedToolAuthorizationBindingIntegrity(binding);
  if(!binding.productionQualified||binding.authority!==false||binding.mayMintExecutionAuthority!==false)throw new Error("consequence_bundle_trusted_tool_binding_not_qualified");
  if(binding.toolId!==proposal.toolId||binding.protocol!==proposal.protocol||binding.operation!==proposal.operation)throw new Error("consequence_bundle_trusted_tool_binding_mismatch");
  if(materialization.id!==proposal.id||materialization.taskId!==proposal.taskId||materialization.intentId!==proposal.intentId||materialization.scopeDeviceId!==proposal.scopeDeviceId)throw new Error("consequence_bundle_materialization_identity_mismatch");
  if(materialization.toolId!==proposal.toolId||materialization.operation!==proposal.operation||materialization.routeProtocol!==proposal.protocol)throw new Error("consequence_bundle_materialization_route_mismatch");
  if(materialization.normalizedArgumentsDigest!==proposal.normalizedArgumentsDigest)throw new Error("consequence_bundle_materialization_arguments_mismatch");
  if(materialization.semanticEffect.kind!==proposal.semanticEffect.kind||materialization.semanticIdentity.effectClass!==proposal.semanticEffect.kind)throw new Error("consequence_bundle_materialization_effect_mismatch");
  if(materialization.authority!==false)throw new Error("consequence_bundle_materialization_authority_violation");
}

export function compileExecutionConsequenceBundle(
  proposal:ExecutionProposal,
  binding:TrustedToolAuthorizationBinding,
  materialization:ConsequenceMaterialization
):ConsequenceBundle{
  assertCompilerInput(proposal,binding,materialization);
  const effectId=primaryEffectId(proposal.id);
  const primaryEffect={
    id:effectId,
    role:"PRIMARY" as const,
    kind:proposal.semanticEffect.kind,
    semanticEffect:proposal.semanticEffect,
    realityAddresses:[materialization.realityAddress],
    footprint:materialization.footprint,
    dependsOn:[],
    authority:false as const
  };
  const budgetDeltas=Object.entries(materialization.footprint.budgetDeltas).sort(([a],[b])=>a.localeCompare(b)).map(([dimension,delta])=>({
    dimension,
    delta,
    unit:budgetUnit(dimension),
    scopeRef:`intent:${proposal.intentId}`,
    authority:false as const
  }));
  const authorityUses=materialization.footprint.authorityUse.slice().sort().map(authorityRef=>({
    authorityRef,
    scopeRef:`consequence:${proposal.id}`,
    operation:proposal.operation,
    consumes:true,
    authority:false as const
  }));
  const proofRequirements=[{
    id:`${proposal.id}:proof`,
    effectIds:[effectId],
    evidenceClass:"BOUND_PROOF_OBLIGATION",
    independentOfActor:true,
    providerRefs:[],
    onUnavailable:"UNKNOWN" as const,
    authority:false as const
  }];
  const unsigned={
    version:"CIEAV_CONSEQUENCE_BUNDLE_V1" as const,
    id:proposal.id,
    invocationRef:`execution-proposal:${proposal.id}`,
    taskId:proposal.taskId,
    intentId:proposal.intentId,
    scopeDeviceId:proposal.scopeDeviceId,
    principalRef:proposal.subjectId,
    toolId:proposal.toolId,
    operation:proposal.operation,
    normalizedArgumentsDigest:proposal.normalizedArgumentsDigest,
    trustedToolBindingDigest:binding.bindingDigest,
    compilerId:CONSEQUENCE_BUNDLE_COMPILER_ID,
    compilerVersion:CONSEQUENCE_BUNDLE_COMPILER_VERSION,
    compilerDigest:CONSEQUENCE_BUNDLE_COMPILER_DIGEST,
    primaryEffects:[primaryEffect],
    secondaryEffects:[],
    conditionalEffects:[],
    deferredEffects:[],
    privacyExternalities:[],
    budgetDeltas,
    authorityUses,
    proofRequirements,
    recoveryEdges:[],
    atomicityGroups:[],
    createdAt:proposal.createdAt,
    authority:false as const,
    mayMintExecutionAuthority:false as const
  };
  return ConsequenceBundleSchema.parse({...unsigned,bundleDigest:consequenceBundleDigest(unsigned)});
}

export function verifyConsequenceBundleDigest(bundle:ConsequenceBundle):boolean{
  const parsed=ConsequenceBundleSchema.parse(bundle),{bundleDigest,...unsigned}=parsed;
  return consequenceBundleDigest(unsigned)===bundleDigest&&parsed.authority===false&&parsed.mayMintExecutionAuthority===false;
}
