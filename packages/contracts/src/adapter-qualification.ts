import {z} from "zod";
import {ToolProtocolSchema} from "./execution-fabric.js";

const DigestSchema=z.string().regex(/^[0-9a-f]{64}$/);
const RefSchema=z.string().min(1).max(2000);

export const AdapterArtifactKindSchema=z.enum(["SOURCE","EXECUTABLE","CONTAINER","NATIVE_BRIDGE","MANAGED_RUNTIME"]);
export const AdapterArtifactIdentitySchema=z.object({
  kind:AdapterArtifactKindSchema,
  digest:DigestSchema,
  provenanceRefs:z.array(RefSchema).max(100).default([]),
  authority:z.literal(false).default(false)
}).strict();
export type AdapterArtifactIdentity=z.infer<typeof AdapterArtifactIdentitySchema>;

export const TrustedSemanticCompilerIdentitySchema=z.object({
  id:z.string().min(1).max(240),
  version:z.string().min(1).max(120),
  digest:DigestSchema,
  authority:z.literal(false).default(false)
}).strict();
export type TrustedSemanticCompilerIdentity=z.infer<typeof TrustedSemanticCompilerIdentitySchema>;

export const QualifiedResolverBindingSchema=z.object({
  id:z.string().min(1).max(240),
  version:z.string().min(1).max(120),
  manifestDigest:DigestSchema,
  authority:z.literal(false).default(false)
}).strict();
export type QualifiedResolverBinding=z.infer<typeof QualifiedResolverBindingSchema>;

export const QualifiedRuntimeIdentitySchema=z.object({
  runtimeKinds:z.array(z.enum(["PROCESS","CONTAINER","BROWSER_HOST","DESKTOP_HOST","DEVICE","ROBOT","MANAGED_SERVICE"])).min(1).max(20),
  requiredAttestationClasses:z.array(z.string().min(1).max(240)).max(50).default([]),
  runtimeDigest:DigestSchema.optional(),
  authority:z.literal(false).default(false)
}).strict();
export type QualifiedRuntimeIdentity=z.infer<typeof QualifiedRuntimeIdentitySchema>;

export const QualifiedProofBindingSchema=z.object({
  quorumRequirementRef:z.string().uuid().optional(),
  proofContractRef:RefSchema,
  providerClasses:z.array(z.string().min(1).max(240)).min(1).max(50),
  proofContractDigest:DigestSchema,
  authority:z.literal(false).default(false)
}).strict();
export type QualifiedProofBinding=z.infer<typeof QualifiedProofBindingSchema>;

export const QualifiedRecoveryBindingSchema=z.object({
  recoveryContractRef:RefSchema,
  recoveryContractDigest:DigestSchema,
  reconciliationSupported:z.boolean(),
  compensationSupported:z.boolean(),
  authority:z.literal(false).default(false)
}).strict();
export type QualifiedRecoveryBinding=z.infer<typeof QualifiedRecoveryBindingSchema>;

export const CommitPointQualificationSchema=z.object({
  class:z.enum(["LOCAL_ATOMIC","REMOTE_REQUEST","BROWSER_INPUT","DESKTOP_INPUT","PROCESS_START","DEVICE_COMMAND","CONTINUING_EFFECT"]),
  preflightSideEffectFree:z.boolean(),
  oneUseAuthoritySpentImmediatelyBeforeEffect:z.boolean(),
  ambiguousAfterBoundaryBecomesUnknown:z.literal(true),
  qualificationEvidenceRefs:z.array(RefSchema).min(1).max(100),
  authority:z.literal(false).default(false)
}).strict();
export type CommitPointQualification=z.infer<typeof CommitPointQualificationSchema>;

export const QualifiedToolManifestSchema=z.object({
  version:z.literal("CIEAV_QUALIFIED_TOOL_MANIFEST_V1"),
  toolId:z.string().min(1).max(240),
  protocols:z.array(ToolProtocolSchema).min(1).max(20),
  effectClasses:z.array(z.string().min(1).max(200)).min(1).max(100),
  trustedToolContractDigest:DigestSchema,
  semanticCompiler:TrustedSemanticCompilerIdentitySchema,
  canonicalResolver:QualifiedResolverBindingSchema,
  adapterArtifact:AdapterArtifactIdentitySchema,
  runtimeIdentity:QualifiedRuntimeIdentitySchema,
  credentialClasses:z.array(z.string().min(1).max(240)).max(50).default([]),
  proof:QualifiedProofBindingSchema,
  recovery:QualifiedRecoveryBindingSchema,
  commitPoint:CommitPointQualificationSchema,
  offlineCapability:z.enum(["FULL","LOCAL_ONLY","NONE"]),
  qualificationEvidenceRefs:z.array(RefSchema).min(1).max(200),
  qualificationEpoch:z.string().uuid().optional(),
  qualificationState:z.enum(["DRAFT","QUALIFIED","SUSPENDED","REVOKED"]),
  productionQualified:z.boolean(),
  manifestDigest:DigestSchema,
  authority:z.literal(false).default(false),
  mayMintExecutionAuthority:z.literal(false).default(false)
}).strict().superRefine((value,ctx)=>{
  if(new Set(value.protocols).size!==value.protocols.length)ctx.addIssue({code:z.ZodIssueCode.custom,path:["protocols"],message:"duplicate qualified protocol"});
  if(new Set(value.effectClasses).size!==value.effectClasses.length)ctx.addIssue({code:z.ZodIssueCode.custom,path:["effectClasses"],message:"duplicate qualified effect class"});
  if(value.productionQualified!==(value.qualificationState==="QUALIFIED"))ctx.addIssue({code:z.ZodIssueCode.custom,path:["productionQualified"],message:"productionQualified must exactly match QUALIFIED state"});
  if(value.productionQualified&&(!value.commitPoint.preflightSideEffectFree||!value.commitPoint.oneUseAuthoritySpentImmediatelyBeforeEffect))ctx.addIssue({code:z.ZodIssueCode.custom,path:["commitPoint"],message:"production qualification requires side-effect-free preflight and exact commit-point authority spend"});
});
export type QualifiedToolManifest=z.infer<typeof QualifiedToolManifestSchema>;

export const AdapterQualificationReportSchema=z.object({
  version:z.literal("CIEAV_ADAPTER_QUALIFICATION_REPORT_V1"),
  manifestDigest:DigestSchema,
  qualified:z.boolean(),
  checkedAt:z.string().datetime(),
  checks:z.array(z.object({id:z.string().min(1).max(240),result:z.enum(["PASS","FAIL"]),evidenceRefs:z.array(RefSchema).max(100).default([]),reason:z.string().min(1).max(1000)}).strict()).min(1).max(200),
  reportDigest:DigestSchema,
  authority:z.literal(false).default(false),
  mayMintExecutionAuthority:z.literal(false).default(false)
}).strict();
export type AdapterQualificationReport=z.infer<typeof AdapterQualificationReportSchema>;
