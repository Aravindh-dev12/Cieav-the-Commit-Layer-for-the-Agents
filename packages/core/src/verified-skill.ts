import crypto from "node:crypto";
import {
  AuthorizedOutcomeTrajectorySchema,
  VerifiedSkillArtifactSchema,
  VerifiedSkillArtifactV2Schema,
  VerifiedSkillCandidateSchema,
  VerifiedSkillQualificationSchema,
  VerifiedSkillQualificationThresholdsSchema,
  VerifiedSkillQualificationV2Schema,
  VerifiedSkillQualificationV2ThresholdsSchema,
  VerifiedSkillValidationCaseSchema,
  type AuthorizedOutcomeTrajectory,
  type CognitiveProgram,
  type VerifiedSkillArtifact,
  type VerifiedSkillArtifactV2,
  type VerifiedSkillCandidate,
  type VerifiedSkillQualification,
  type VerifiedSkillQualificationThresholds,
  type VerifiedSkillQualificationV2,
  type VerifiedSkillQualificationV2Thresholds,
  type VerifiedSkillValidationCase
} from "@cieav/contracts";

export const canonicalVerifiedSkillValue=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonicalVerifiedSkillValue).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value as Record<string,unknown>).sort().map(key=>`${JSON.stringify(key)}:${canonicalVerifiedSkillValue((value as Record<string,unknown>)[key])}`).join(",")}}`:JSON.stringify(value)??"undefined";
export const verifiedSkillDigest=(value:unknown)=>crypto.createHash("sha256").update(canonicalVerifiedSkillValue(value)).digest("hex");
const ratio=(n:number,d:number)=>d?n/d:0;
const outcomeScore=(outcome:"SUCCESS"|"FAILURE"|"UNKNOWN")=>outcome==="SUCCESS"?1:outcome==="FAILURE"?-1:0;
const mean=(values:number[])=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:0;

export type CompileVerifiedSkillInput={
  id:string;name:string;capability:string;program:CognitiveProgram;trajectories:AuthorizedOutcomeTrajectory[];createdAt:string;
  routing?:{description:string;keywords:string[]};
  argumentPolicy?:{mode:"EXACT_DIGEST";exactArgumentsDigest:string}|{mode:"SCHEMA_DIGEST";argumentSchemaDigest:string};
};

export function compileVerifiedSkillCandidate(input:CompileVerifiedSkillInput):VerifiedSkillCandidate{
  if(!input.trajectories.length)throw new Error("verified_skill_candidate_requires_evidence");
  const trajectories=input.trajectories.map(t=>AuthorizedOutcomeTrajectorySchema.parse(t));
  const ids=new Set(trajectories.map(t=>t.trajectoryId));if(ids.size!==trajectories.length)throw new Error("verified_skill_candidate_duplicate_trajectory_id");
  const operations=new Set(trajectories.map(t=>t.operation));if(operations.size!==1)throw new Error("verified_skill_candidate_requires_single_operation");
  const operation=trajectories[0]!.operation;
  let argumentPolicy=input.argumentPolicy;
  if(!argumentPolicy){const digests=new Set(trajectories.map(t=>t.exactArgumentsDigest));if(digests.size!==1)throw new Error("verified_skill_candidate_requires_explicit_argument_schema_for_variable_arguments");argumentPolicy={mode:"EXACT_DIGEST",exactArgumentsDigest:trajectories[0]!.exactArgumentsDigest}}
  return VerifiedSkillCandidateSchema.parse({version:"CIEAV_VERIFIED_SKILL_CANDIDATE_V1",id:input.id,name:input.name,capability:input.capability,operation,program:input.program,...(input.routing?{routing:input.routing}:{}),argumentPolicy,evidenceTrajectoryIds:[...ids].sort(),compiler:"CIEAV_VERIFIED_SKILL_COMPILER_V1",createdAt:input.createdAt,authority:false,productionAuthority:false,mayMintExecutionAuthority:false});
}

export function qualifyVerifiedSkill(candidateRaw:VerifiedSkillCandidate,trajectoryRaw:AuthorizedOutcomeTrajectory[],thresholdOverrides:Partial<VerifiedSkillQualificationThresholds>={},evaluatedAt=new Date().toISOString()):VerifiedSkillQualification{
  const candidate=VerifiedSkillCandidateSchema.parse(candidateRaw),thresholds=VerifiedSkillQualificationThresholdsSchema.parse(thresholdOverrides),trajectories=trajectoryRaw.map(t=>AuthorizedOutcomeTrajectorySchema.parse(t)),reasons:string[]=[];
  const ids=new Set(trajectories.map(t=>t.trajectoryId));
  if(ids.size!==trajectories.length)reasons.push("duplicate_trajectory_id");
  const expectedIds=[...candidate.evidenceTrajectoryIds].sort(),actualIds=[...ids].sort();if(canonicalVerifiedSkillValue(expectedIds)!==canonicalVerifiedSkillValue(actualIds))reasons.push("candidate_evidence_set_mismatch");
  if(trajectories.some(t=>t.operation!==candidate.operation))reasons.push("candidate_operation_mismatch");
  if(candidate.argumentPolicy.mode==="EXACT_DIGEST"&&trajectories.some(t=>t.exactArgumentsDigest!==candidate.argumentPolicy.exactArgumentsDigest))reasons.push("candidate_exact_arguments_mismatch");
  if(candidate.argumentPolicy.mode==="SCHEMA_DIGEST")reasons.push("schema_argument_policy_requires_external_deterministic_qualification");

  const samples=trajectories.length,successes=trajectories.filter(t=>t.outcome==="SUCCESS").length,failures=trajectories.filter(t=>t.outcome==="FAILURE").length,unknown=trajectories.filter(t=>t.outcome==="UNKNOWN").length;
  const metrics={samples,successes,failures,unknown,successRate:ratio(successes,samples),failureRate:ratio(failures,samples),unknownRate:ratio(unknown,samples),authorityGradeCoverage:ratio(trajectories.filter(t=>t.authorityGrade).length,samples),realityBoundCoverage:ratio(trajectories.filter(t=>t.realityBound).length,samples),cryptographicCoverage:ratio(trajectories.filter(t=>t.cryptographicallyVerified).length,samples),proofCoverage:ratio(trajectories.filter(t=>t.evidence.length>0).length,samples)};
  if(metrics.samples<thresholds.minSamples)reasons.push(`samples ${metrics.samples} < ${thresholds.minSamples}`);
  if(metrics.successRate<thresholds.minSuccessRate)reasons.push(`successRate ${metrics.successRate.toFixed(4)} < ${thresholds.minSuccessRate}`);
  if(metrics.failureRate>thresholds.maxFailureRate)reasons.push(`failureRate ${metrics.failureRate.toFixed(4)} > ${thresholds.maxFailureRate}`);
  if(metrics.unknownRate>thresholds.maxUnknownRate)reasons.push(`unknownRate ${metrics.unknownRate.toFixed(4)} > ${thresholds.maxUnknownRate}`);
  if(metrics.authorityGradeCoverage<thresholds.minAuthorityGradeCoverage)reasons.push(`authorityGradeCoverage ${metrics.authorityGradeCoverage.toFixed(4)} < ${thresholds.minAuthorityGradeCoverage}`);
  if(metrics.realityBoundCoverage<thresholds.minRealityBoundCoverage)reasons.push(`realityBoundCoverage ${metrics.realityBoundCoverage.toFixed(4)} < ${thresholds.minRealityBoundCoverage}`);
  if(metrics.cryptographicCoverage<thresholds.minCryptographicCoverage)reasons.push(`cryptographicCoverage ${metrics.cryptographicCoverage.toFixed(4)} < ${thresholds.minCryptographicCoverage}`);
  if(metrics.proofCoverage<thresholds.minProofCoverage)reasons.push(`proofCoverage ${metrics.proofCoverage.toFixed(4)} < ${thresholds.minProofCoverage}`);
  const evidenceDigest=verifiedSkillDigest(trajectories.slice().sort((a,b)=>a.trajectoryId.localeCompare(b.trajectoryId)).map(t=>({trajectoryId:t.trajectoryId,operation:t.operation,exactArgumentsDigest:t.exactArgumentsDigest,outcome:t.outcome,cryptographicallyVerified:t.cryptographicallyVerified,authorityGrade:t.authorityGrade,realityBound:t.realityBound,evidence:t.evidence.map(e=>e.digest??verifiedSkillDigest(e))})));
  return VerifiedSkillQualificationSchema.parse({version:"CIEAV_VERIFIED_SKILL_QUALIFICATION_V1",candidateId:candidate.id,evaluatedAt,thresholds,metrics,passed:reasons.length===0,reasons:[...new Set(reasons)],evidenceDigest,authority:false,productionAuthority:false,mayMintExecutionAuthority:false});
}

/** Legacy artifact creation. V1 artifacts are not eligible for production runtime projection. */
export function createQualifiedVerifiedSkill(candidateRaw:VerifiedSkillCandidate,qualificationRaw:VerifiedSkillQualification,qualifiedAt=new Date().toISOString()):VerifiedSkillArtifact{
  const candidate=VerifiedSkillCandidateSchema.parse(candidateRaw),qualification=VerifiedSkillQualificationSchema.parse(qualificationRaw);
  if(!qualification.passed)throw new Error("verified_skill_qualification_did_not_pass");
  if(qualification.candidateId!==candidate.id)throw new Error("verified_skill_candidate_qualification_mismatch");
  const id=`skill:${verifiedSkillDigest({candidateId:candidate.id}).slice(0,40)}`;
  return VerifiedSkillArtifactSchema.parse({version:"CIEAV_VERIFIED_SKILL_V1",id,candidate,qualification,state:"QUALIFIED",qualifiedAt,authority:false,productionAuthority:false,mayMintExecutionAuthority:false});
}

/** Legacy activation is retained for compatibility but V1 ACTIVE artifacts are not production-runtime admissible. */
export function activateVerifiedSkill(skillRaw:VerifiedSkillArtifact,input:{approvalRef:string;activatedBy:string;activatedAt?:string}):VerifiedSkillArtifact{
  const skill=VerifiedSkillArtifactSchema.parse(skillRaw);if(skill.state!=="QUALIFIED")throw new Error("verified_skill_not_qualified_for_activation");
  if(!input.approvalRef.trim()||!input.activatedBy.trim())throw new Error("verified_skill_activation_requires_explicit_approval");
  return VerifiedSkillArtifactSchema.parse({...skill,state:"ACTIVE",activatedAt:input.activatedAt??new Date().toISOString(),activationApprovalRef:input.approvalRef.trim(),activatedBy:input.activatedBy.trim(),authority:false,productionAuthority:false,mayMintExecutionAuthority:false});
}

export function revokeVerifiedSkill(skillRaw:VerifiedSkillArtifact,input:{reason:string;revokedAt?:string}):VerifiedSkillArtifact{
  const skill=VerifiedSkillArtifactSchema.parse(skillRaw);if(skill.state==="REVOKED")return skill;if(!input.reason.trim())throw new Error("verified_skill_revocation_reason_required");
  return VerifiedSkillArtifactSchema.parse({...skill,state:"REVOKED",revokedAt:input.revokedAt??new Date().toISOString(),revocationReason:input.reason.trim(),authority:false,productionAuthority:false,mayMintExecutionAuthority:false});
}

export function qualifyVerifiedSkillV2(candidateRaw:VerifiedSkillCandidate,sourceQualificationRaw:VerifiedSkillQualification,caseRaw:VerifiedSkillValidationCase[],thresholdOverrides:Partial<VerifiedSkillQualificationV2Thresholds>={},evaluatedAt=new Date().toISOString()):VerifiedSkillQualificationV2{
  const candidate=VerifiedSkillCandidateSchema.parse(candidateRaw),sourceQualification=VerifiedSkillQualificationSchema.parse(sourceQualificationRaw),thresholds=VerifiedSkillQualificationV2ThresholdsSchema.parse(thresholdOverrides),cases=caseRaw.map(item=>VerifiedSkillValidationCaseSchema.parse(item)),reasons:string[]=[];
  const candidateDigest=verifiedSkillDigest(candidate);
  if(!sourceQualification.passed)reasons.push("source_qualification_required");
  if(sourceQualification.candidateId!==candidate.id)reasons.push("source_qualification_candidate_mismatch");
  if(thresholds.requireRoutingMetadata&&!candidate.routing)reasons.push("verified_skill_routing_metadata_required");
  if(new Set(cases.map(item=>item.caseId)).size!==cases.length)reasons.push("duplicate_validation_case_id");
  const sourceIds=new Set(candidate.evidenceTrajectoryIds);
  for(const item of cases){
    if(item.candidateDigest!==candidateDigest)reasons.push(`validation_candidate_digest_mismatch:${item.caseId}`);
    if(item.derivedFromTrajectoryIds.some(id=>sourceIds.has(id)))reasons.push(`validation_case_not_held_out:${item.caseId}`);
  }
  const baselineSuccesses=cases.filter(item=>item.baselineOutcome==="SUCCESS").length,skillSuccesses=cases.filter(item=>item.skillOutcome==="SUCCESS").length,skillFailures=cases.filter(item=>item.skillOutcome==="FAILURE").length,skillUnknown=cases.filter(item=>item.skillOutcome==="UNKNOWN").length;
  const repairs=cases.filter(item=>item.baselineOutcome!=="SUCCESS"&&item.skillOutcome==="SUCCESS").length,regressions=cases.filter(item=>item.baselineOutcome==="SUCCESS"&&item.skillOutcome!=="SUCCESS").length;
  const outcomeDelta=mean(cases.map(item=>outcomeScore(item.skillOutcome)-outcomeScore(item.baselineOutcome)));
  const stepPairs=cases.filter(item=>item.baselineSteps!==undefined&&item.skillSteps!==undefined),tokenPairs=cases.filter(item=>item.baselineTokens!==undefined&&item.skillTokens!==undefined);
  const metrics={validationCases:cases.length,baselineSuccesses,skillSuccesses,skillFailures,skillUnknown,repairs,regressions,baselineSuccessRate:ratio(baselineSuccesses,cases.length),skillSuccessRate:ratio(skillSuccesses,cases.length),skillFailureRate:ratio(skillFailures,cases.length),skillUnknownRate:ratio(skillUnknown,cases.length),outcomeDelta,...(stepPairs.length?{meanStepReduction:mean(stepPairs.map(item=>item.baselineSteps!-item.skillSteps!))}:{}),...(tokenPairs.length?{meanTokenReduction:mean(tokenPairs.map(item=>item.baselineTokens!-item.skillTokens!))}:{})};
  if(metrics.validationCases<thresholds.minValidationCases)reasons.push(`validationCases ${metrics.validationCases} < ${thresholds.minValidationCases}`);
  if(metrics.skillSuccessRate<thresholds.minSkillSuccessRate)reasons.push(`skillSuccessRate ${metrics.skillSuccessRate.toFixed(4)} < ${thresholds.minSkillSuccessRate}`);
  if(metrics.skillFailureRate>thresholds.maxSkillFailureRate)reasons.push(`skillFailureRate ${metrics.skillFailureRate.toFixed(4)} > ${thresholds.maxSkillFailureRate}`);
  if(metrics.skillUnknownRate>thresholds.maxSkillUnknownRate)reasons.push(`skillUnknownRate ${metrics.skillUnknownRate.toFixed(4)} > ${thresholds.maxSkillUnknownRate}`);
  if(metrics.regressions>thresholds.maxRegressions)reasons.push(`regressions ${metrics.regressions} > ${thresholds.maxRegressions}`);
  if(metrics.outcomeDelta<thresholds.minOutcomeDelta)reasons.push(`outcomeDelta ${metrics.outcomeDelta.toFixed(4)} < ${thresholds.minOutcomeDelta}`);
  const validationDigest=verifiedSkillDigest(cases.slice().sort((a,b)=>a.caseId.localeCompare(b.caseId)));
  return VerifiedSkillQualificationV2Schema.parse({version:"CIEAV_VERIFIED_SKILL_QUALIFICATION_V2",candidateId:candidate.id,candidateDigest,evaluatedAt,sourceQualification,thresholds,metrics,passed:reasons.length===0,reasons:[...new Set(reasons)],validationDigest,authority:false,productionAuthority:false,mayMintExecutionAuthority:false});
}

export function createQualifiedVerifiedSkillV2(candidateRaw:VerifiedSkillCandidate,qualificationRaw:VerifiedSkillQualificationV2,qualifiedAt=new Date().toISOString()):VerifiedSkillArtifactV2{
  const candidate=VerifiedSkillCandidateSchema.parse(candidateRaw),qualification=VerifiedSkillQualificationV2Schema.parse(qualificationRaw),candidateDigest=verifiedSkillDigest(candidate);
  if(!qualification.passed)throw new Error("verified_skill_v2_qualification_did_not_pass");
  if(qualification.candidateId!==candidate.id||qualification.candidateDigest!==candidateDigest)throw new Error("verified_skill_v2_candidate_qualification_mismatch");
  const id=`skillv2:${verifiedSkillDigest({candidateId:candidate.id,candidateDigest,validationDigest:qualification.validationDigest}).slice(0,40)}`;
  return VerifiedSkillArtifactV2Schema.parse({version:"CIEAV_VERIFIED_SKILL_V2",id,candidate,qualification,state:"QUALIFIED",qualifiedAt,authority:false,productionAuthority:false,mayMintExecutionAuthority:false});
}

export function activateVerifiedSkillV2(skillRaw:VerifiedSkillArtifactV2,input:{approvalRef:string;activatedBy:string;activatedAt?:string}):VerifiedSkillArtifactV2{
  const skill=VerifiedSkillArtifactV2Schema.parse(skillRaw);if(skill.state!=="QUALIFIED")throw new Error("verified_skill_v2_not_qualified_for_activation");
  if(!input.approvalRef.trim()||!input.activatedBy.trim())throw new Error("verified_skill_v2_activation_requires_explicit_approval");
  return VerifiedSkillArtifactV2Schema.parse({...skill,state:"ACTIVE",activatedAt:input.activatedAt??new Date().toISOString(),activationApprovalRef:input.approvalRef.trim(),activatedBy:input.activatedBy.trim(),authority:false,productionAuthority:false,mayMintExecutionAuthority:false});
}

export function revokeVerifiedSkillV2(skillRaw:VerifiedSkillArtifactV2,input:{reason:string;revokedAt?:string}):VerifiedSkillArtifactV2{
  const skill=VerifiedSkillArtifactV2Schema.parse(skillRaw);if(skill.state==="REVOKED")return skill;if(!input.reason.trim())throw new Error("verified_skill_v2_revocation_reason_required");
  return VerifiedSkillArtifactV2Schema.parse({...skill,state:"REVOKED",revokedAt:input.revokedAt??new Date().toISOString(),revocationReason:input.reason.trim(),authority:false,productionAuthority:false,mayMintExecutionAuthority:false});
}

export const VERIFIED_SKILL_AUTHORITY=false as const;
export const VERIFIED_SKILL_MAY_MINT_EXECUTION_AUTHORITY=false as const;
