import {z} from "zod";

const DigestSchema=z.string().regex(/^[0-9a-f]{64}$/);
export const VerifiedSkillSecurityFindingCategorySchema=z.enum([
  "AUTHORITY_BYPASS","APPROVAL_SUPPRESSION","POLICY_BYPASS","PROOF_SUPPRESSION","SECRET_EXFILTRATION","SELF_PROMOTION","REGISTRY_MUTATION","MEMORY_POISONING","INSTRUCTION_OVERRIDE","OBFUSCATION","ARBITRARY_CODE_BOOTSTRAP","PRIVACY_BOUNDARY_BYPASS"
]);
export type VerifiedSkillSecurityFindingCategory=z.infer<typeof VerifiedSkillSecurityFindingCategorySchema>;
export const VerifiedSkillSecuritySeveritySchema=z.enum(["LOW","MEDIUM","HIGH","CRITICAL"]);
export type VerifiedSkillSecuritySeverity=z.infer<typeof VerifiedSkillSecuritySeveritySchema>;

export const VerifiedSkillSecurityFindingSchema=z.object({
  ruleId:z.string().min(1).max(100),
  category:VerifiedSkillSecurityFindingCategorySchema,
  severity:VerifiedSkillSecuritySeveritySchema,
  fieldRef:z.string().min(1).max(500),
  evidenceDigest:DigestSchema,
  summary:z.string().min(1).max(500)
}).strict();
export type VerifiedSkillSecurityFinding=z.infer<typeof VerifiedSkillSecurityFindingSchema>;

export const VerifiedSkillSecurityAssessmentSchema=z.object({
  version:z.literal("CIEAV_VERIFIED_SKILL_SECURITY_ASSESSMENT_V1"),
  scannerVersion:z.literal("CIEAV_VERIFIED_SKILL_SEMANTIC_SCANNER_V1"),
  candidateId:z.string().min(8).max(200),
  candidateDigest:DigestSchema,
  evaluatedAt:z.string().datetime(),
  disposition:z.enum(["PASS","QUARANTINE"]),
  riskScore:z.number().int().min(0).max(100),
  findings:z.array(VerifiedSkillSecurityFindingSchema).max(500),
  assessmentDigest:DigestSchema,
  authority:z.literal(false).default(false),
  productionAuthority:z.literal(false).default(false),
  mayMintExecutionAuthority:z.literal(false).default(false)
}).strict().superRefine((value,ctx)=>{
  const blocking=value.findings.some(item=>item.severity==="HIGH"||item.severity==="CRITICAL");
  if((blocking&&value.disposition!=="QUARANTINE")||(!blocking&&value.disposition!=="PASS"))ctx.addIssue({code:z.ZodIssueCode.custom,path:["disposition"],message:"verified_skill_security_disposition_mismatch"});
});
export type VerifiedSkillSecurityAssessment=z.infer<typeof VerifiedSkillSecurityAssessmentSchema>;
