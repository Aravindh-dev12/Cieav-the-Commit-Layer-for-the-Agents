import {VerifiedSkillCandidateSchema,VerifiedSkillValidationCaseSchema,VerifiedSkillValidationEvidenceBundleSchema,type VerifiedSkillCandidate,type VerifiedSkillValidationCase,type VerifiedSkillValidationEvidenceBundle} from "@cieav/contracts";
import {verifiedSkillDigest,verifiedSkillValidationCaseDigest} from "./verified-skill.js";

export function buildVerifiedSkillValidationEvidenceBundle(candidateRaw:VerifiedSkillCandidate,caseRaw:VerifiedSkillValidationCase[],createdAt=new Date().toISOString()):VerifiedSkillValidationEvidenceBundle{
  const candidate=VerifiedSkillCandidateSchema.parse(candidateRaw),candidateDigest=verifiedSkillDigest(candidate),cases=caseRaw.map(item=>VerifiedSkillValidationCaseSchema.parse(item));
  if(cases.length<3)throw new Error("verified_skill_validation_evidence_requires_three_cases");
  if(new Set(cases.map(item=>item.caseId)).size!==cases.length)throw new Error("duplicate_validation_case_id");
  if(new Set(cases.map(item=>item.caseDigest)).size!==cases.length)throw new Error("duplicate_validation_case_digest");
  const sourceIds=new Set(candidate.evidenceTrajectoryIds);
  for(const item of cases){
    if(item.caseDigest!==verifiedSkillValidationCaseDigest(item))throw new Error(`validation_case_digest_mismatch:${item.caseId}`);
    if(item.candidateDigest!==candidateDigest)throw new Error(`validation_candidate_digest_mismatch:${item.caseId}`);
    if(item.derivedFromTrajectoryIds.some(id=>sourceIds.has(id)))throw new Error(`validation_case_not_held_out:${item.caseId}`);
  }
  const ordered=cases.slice().sort((a,b)=>a.caseId.localeCompare(b.caseId)),validationDigest=verifiedSkillDigest(ordered);
  return VerifiedSkillValidationEvidenceBundleSchema.parse({version:"CIEAV_VERIFIED_SKILL_VALIDATION_EVIDENCE_V1",candidateId:candidate.id,candidateDigest,cases:ordered,validationDigest,createdAt,authority:false,productionAuthority:false,mayMintExecutionAuthority:false});
}

export function verifyVerifiedSkillValidationEvidenceBundle(candidateRaw:VerifiedSkillCandidate,raw:VerifiedSkillValidationEvidenceBundle):VerifiedSkillValidationEvidenceBundle{
  const candidate=VerifiedSkillCandidateSchema.parse(candidateRaw),bundle=VerifiedSkillValidationEvidenceBundleSchema.parse(raw),rebuilt=buildVerifiedSkillValidationEvidenceBundle(candidate,bundle.cases,bundle.createdAt);
  if(bundle.candidateId!==rebuilt.candidateId||bundle.candidateDigest!==rebuilt.candidateDigest||bundle.validationDigest!==rebuilt.validationDigest)throw new Error("verified_skill_validation_evidence_bundle_binding_mismatch");
  return rebuilt;
}

export const VERIFIED_SKILL_VALIDATION_EVIDENCE_AUTHORITY=false as const;
export const VERIFIED_SKILL_VALIDATION_EVIDENCE_MAY_MINT_EXECUTION_AUTHORITY=false as const;
