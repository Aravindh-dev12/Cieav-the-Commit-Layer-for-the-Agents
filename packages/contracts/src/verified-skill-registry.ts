import {z} from "zod";
import {CognitiveCellPrivacySchema} from "./cognitive-runtime.js";
import {VerifiedSkillArtifactV2Schema} from "./verified-skill.js";

const DigestSchema=z.string().regex(/^[0-9a-f]{64}$/);

export const VerifiedSkillProvenanceSchema=z.object({
  version:z.literal("CIEAV_VERIFIED_SKILL_PROVENANCE_V1"),
  predicateType:z.literal("https://cieav.org/attestations/verified-skill-provenance/v1"),
  builderId:z.string().min(1).max(300),
  buildType:z.enum(["CIEAV_LOCAL_COMPILER","CIEAV_SANDBOX_COMPILER","IMPORTED_SIGNED_ARTIFACT"]),
  sourceRefs:z.array(z.object({uri:z.string().min(1).max(2000),digest:DigestSchema}).strict()).min(1).max(100),
  compilerVersion:z.string().min(1).max(100),
  subjectDigest:DigestSchema,
  candidateDigest:DigestSchema,
  sourceQualificationDigest:DigestSchema,
  validationDigest:DigestSchema,
  createdAt:z.string().datetime(),
  externalAttestationRef:z.string().min(1).max(2000).optional(),
  externalAttestationDigest:DigestSchema.optional(),
  authority:z.literal(false).default(false),
  productionAuthority:z.literal(false).default(false),
  mayMintExecutionAuthority:z.literal(false).default(false)
}).strict().superRefine((value,ctx)=>{
  if(Boolean(value.externalAttestationRef)!==Boolean(value.externalAttestationDigest))ctx.addIssue({code:z.ZodIssueCode.custom,path:["externalAttestationRef"],message:"external_attestation_reference_and_digest_must_be_paired"});
});
export type VerifiedSkillProvenance=z.infer<typeof VerifiedSkillProvenanceSchema>;

export const VerifiedSkillDependencyLockEntrySchema=z.object({
  cellId:z.string().min(1).max(200),
  identityRef:z.string().min(1).max(300).optional(),
  provider:z.string().min(1).max(200),
  local:z.boolean(),
  privacyBoundary:CognitiveCellPrivacySchema,
  capabilitiesDigest:DigestSchema,
  lockedAt:z.string().datetime()
}).strict();
export type VerifiedSkillDependencyLockEntry=z.infer<typeof VerifiedSkillDependencyLockEntrySchema>;

/**
 * The qualified artifact is immutable. Deployment lifecycle lives in the
 * registry record so provenance always names the same content-addressed subject.
 */
const VerifiedSkillRegistryRecordObjectSchema=z.object({
  version:z.literal("CIEAV_VERIFIED_SKILL_REGISTRY_RECORD_V1"),
  skillId:z.string().min(8).max(200),
  artifact:VerifiedSkillArtifactV2Schema,
  artifactDigest:DigestSchema,
  provenance:VerifiedSkillProvenanceSchema,
  dependencyLock:z.array(VerifiedSkillDependencyLockEntrySchema).max(100),
  registryState:z.enum(["QUALIFIED","ACTIVE","QUARANTINED","REVOKED"]),
  generation:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  createdAt:z.string().datetime(),
  updatedAt:z.string().datetime(),
  activatedAt:z.string().datetime().optional(),
  activationApprovalRef:z.string().min(8).max(500).optional(),
  activatedBy:z.string().min(1).max(300).optional(),
  quarantineReason:z.string().min(1).max(1000).optional(),
  revokedAt:z.string().datetime().optional(),
  revocationReason:z.string().min(1).max(1000).optional(),
  authority:z.literal(false).default(false),
  productionAuthority:z.literal(false).default(false),
  mayMintExecutionAuthority:z.literal(false).default(false)
}).strict();
export const VerifiedSkillRegistryRecordSchema=VerifiedSkillRegistryRecordObjectSchema.superRefine((record,ctx)=>{
  if(record.skillId!==record.artifact.id)ctx.addIssue({code:z.ZodIssueCode.custom,path:["skillId"],message:"verified_skill_registry_skill_id_mismatch"});
  if(record.artifact.state!=="QUALIFIED")ctx.addIssue({code:z.ZodIssueCode.custom,path:["artifact","state"],message:"verified_skill_registry_artifact_must_remain_qualified_and_immutable"});
  if(record.registryState==="ACTIVE"&&(!record.activatedAt||!record.activationApprovalRef||!record.activatedBy))ctx.addIssue({code:z.ZodIssueCode.custom,path:["registryState"],message:"active_registry_record_requires_explicit_activation"});
  if(record.registryState==="QUARANTINED"&&!record.quarantineReason)ctx.addIssue({code:z.ZodIssueCode.custom,path:["quarantineReason"],message:"quarantined_skill_requires_reason"});
  if(record.registryState==="REVOKED"&&(!record.revokedAt||!record.revocationReason))ctx.addIssue({code:z.ZodIssueCode.custom,path:["registryState"],message:"revoked_registry_record_requires_reason"});
});
export type VerifiedSkillRegistryRecord=z.infer<typeof VerifiedSkillRegistryRecordSchema>;

export const VerifiedSkillRegistryPersistedStateSchema=z.object({
  version:z.literal("CIEAV_VERIFIED_SKILL_REGISTRY_STATE_V1"),
  generation:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  previousSnapshotDigest:DigestSchema.optional(),
  records:z.array(VerifiedSkillRegistryRecordSchema).max(10000),
  updatedAt:z.string().datetime(),
  authority:z.literal(false).default(false),
  productionAuthority:z.literal(false).default(false),
  mayMintExecutionAuthority:z.literal(false).default(false)
}).strict();
export type VerifiedSkillRegistryPersistedState=z.infer<typeof VerifiedSkillRegistryPersistedStateSchema>;

export const VerifiedSkillRegistryHeadSchema=z.object({
  version:z.literal("CIEAV_VERIFIED_SKILL_REGISTRY_HEAD_V1"),
  generation:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  snapshotDigest:DigestSchema,
  updatedAt:z.string().datetime()
}).strict();
export type VerifiedSkillRegistryHead=z.infer<typeof VerifiedSkillRegistryHeadSchema>;
