import {z} from "zod";
import {CognitiveProgramSchema} from "./consequence-intelligence.js";

const DigestSchema=z.string().regex(/^[0-9a-f]{64}$/);

export const VerifiedSkillCandidateSchema=z.object({
  version:z.literal("CIEAV_VERIFIED_SKILL_CANDIDATE_V1"),
  id:z.string().min(8).max(200),
  name:z.string().min(1).max(200),
  capability:z.string().min(1).max(160),
  operation:z.string().min(1).max(300),
  program:CognitiveProgramSchema,
  argumentPolicy:z.discriminatedUnion("mode",[
    z.object({mode:z.literal("EXACT_DIGEST"),exactArgumentsDigest:DigestSchema}).strict(),
    z.object({mode:z.literal("SCHEMA_DIGEST"),argumentSchemaDigest:DigestSchema}).strict()
  ]),
  evidenceTrajectoryIds:z.array(z.string().min(8).max(200)).min(1).max(1000),
  compiler:z.literal("CIEAV_VERIFIED_SKILL_COMPILER_V1"),
  createdAt:z.string().datetime(),
  authority:z.literal(false).default(false),
  productionAuthority:z.literal(false).default(false),
  mayMintExecutionAuthority:z.literal(false).default(false)
}).strict();
export type VerifiedSkillCandidate=z.infer<typeof VerifiedSkillCandidateSchema>;

export const VerifiedSkillQualificationThresholdsSchema=z.object({
  minSamples:z.number().int().min(3).max(1000).default(3),
  minSuccessRate:z.number().min(0).max(1).default(1),
  maxFailureRate:z.number().min(0).max(1).default(0),
  maxUnknownRate:z.number().min(0).max(1).default(0),
  minAuthorityGradeCoverage:z.number().min(0).max(1).default(1),
  minRealityBoundCoverage:z.number().min(0).max(1).default(1),
  minCryptographicCoverage:z.number().min(0).max(1).default(1),
  minProofCoverage:z.number().min(0).max(1).default(1)
}).strict();
export type VerifiedSkillQualificationThresholds=z.infer<typeof VerifiedSkillQualificationThresholdsSchema>;

export const VerifiedSkillQualificationSchema=z.object({
  version:z.literal("CIEAV_VERIFIED_SKILL_QUALIFICATION_V1"),
  candidateId:z.string().min(8).max(200),
  evaluatedAt:z.string().datetime(),
  thresholds:VerifiedSkillQualificationThresholdsSchema,
  metrics:z.object({
    samples:z.number().int().nonnegative(),
    successes:z.number().int().nonnegative(),
    failures:z.number().int().nonnegative(),
    unknown:z.number().int().nonnegative(),
    successRate:z.number().min(0).max(1),
    failureRate:z.number().min(0).max(1),
    unknownRate:z.number().min(0).max(1),
    authorityGradeCoverage:z.number().min(0).max(1),
    realityBoundCoverage:z.number().min(0).max(1),
    cryptographicCoverage:z.number().min(0).max(1),
    proofCoverage:z.number().min(0).max(1)
  }).strict(),
  passed:z.boolean(),
  reasons:z.array(z.string().min(1).max(500)).max(100),
  evidenceDigest:DigestSchema,
  authority:z.literal(false).default(false),
  productionAuthority:z.literal(false).default(false),
  mayMintExecutionAuthority:z.literal(false).default(false)
}).strict();
export type VerifiedSkillQualification=z.infer<typeof VerifiedSkillQualificationSchema>;

export const VerifiedSkillArtifactSchema=z.object({
  version:z.literal("CIEAV_VERIFIED_SKILL_V1"),
  id:z.string().min(8).max(200),
  candidate:VerifiedSkillCandidateSchema,
  qualification:VerifiedSkillQualificationSchema,
  state:z.enum(["QUALIFIED","ACTIVE","REVOKED"]),
  qualifiedAt:z.string().datetime(),
  activatedAt:z.string().datetime().optional(),
  activationApprovalRef:z.string().min(8).max(500).optional(),
  activatedBy:z.string().min(1).max(300).optional(),
  revokedAt:z.string().datetime().optional(),
  revocationReason:z.string().min(1).max(1000).optional(),
  authority:z.literal(false).default(false),
  productionAuthority:z.literal(false).default(false),
  mayMintExecutionAuthority:z.literal(false).default(false)
}).superRefine((skill,ctx)=>{
  if(!skill.qualification.passed)ctx.addIssue({code:z.ZodIssueCode.custom,path:["qualification","passed"],message:"verified_skill_requires_passed_qualification"});
  if(skill.qualification.candidateId!==skill.candidate.id)ctx.addIssue({code:z.ZodIssueCode.custom,path:["qualification","candidateId"],message:"verified_skill_candidate_qualification_mismatch"});
  if(skill.state==="ACTIVE"&&(!skill.activatedAt||!skill.activationApprovalRef||!skill.activatedBy))ctx.addIssue({code:z.ZodIssueCode.custom,path:["state"],message:"active_verified_skill_requires_explicit_activation_approval"});
  if(skill.state==="REVOKED"&&(!skill.revokedAt||!skill.revocationReason))ctx.addIssue({code:z.ZodIssueCode.custom,path:["state"],message:"revoked_verified_skill_requires_reason"});
}).strict();
export type VerifiedSkillArtifact=z.infer<typeof VerifiedSkillArtifactSchema>;
