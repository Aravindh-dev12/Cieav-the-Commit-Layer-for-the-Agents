import crypto from "node:crypto";
import {AuthorizedOutcomeTrajectorySchema,IntelligenceMetabolismContextSchema,IntelligenceMetabolismDecisionSchema,type AuthorizedOutcomeTrajectory,type IntelligenceMetabolismContext,type IntelligenceMetabolismDecision,type IntelligenceMetabolismSink} from "@cieav/contracts";

const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value as Record<string,unknown>).sort().map(key=>`${JSON.stringify(key)}:${canonical((value as Record<string,unknown>)[key])}`).join(",")}}`:JSON.stringify(value)??"undefined";
export const intelligenceMetabolismDigest=(value:unknown)=>crypto.createHash("sha256").update(canonical(value)).digest("hex");

export function decideIntelligenceMetabolism(raw:AuthorizedOutcomeTrajectory,contextRaw:Partial<IntelligenceMetabolismContext>={},decidedAt=new Date().toISOString()):IntelligenceMetabolismDecision{
  const trajectory=AuthorizedOutcomeTrajectorySchema.parse(raw),context=IntelligenceMetabolismContextSchema.parse(contextRaw),policy=context.policy,reasons:string[]=[],sinks=new Set<IntelligenceMetabolismSink>();
  const trustedEpisode=trajectory.cryptographicallyVerified&&Boolean(trajectory.redactionProfile.trim());
  if(!trajectory.cryptographicallyVerified)reasons.push("cryptographic_verification_required");
  if(!trajectory.redactionProfile.trim())reasons.push("redaction_profile_required");
  if(!trustedEpisode){sinks.add("NONE");return IntelligenceMetabolismDecisionSchema.parse({version:"CIEAV_INTELLIGENCE_METABOLISM_DECISION_V1",trajectoryId:trajectory.trajectoryId,trajectoryDigest:intelligenceMetabolismDigest(trajectory),decidedAt,outcome:trajectory.outcome,trustedEpisode:false,sinks:["NONE"],reasons,modelTrainingEligible:false,skillCompilationEligible:false,automaticConsolidationAllowed:false,authority:false,productionAuthority:false,mayMintExecutionAuthority:false,mayPromoteModel:false,mayActivateSkill:false})}

  sinks.add("EPISODIC_MEMORY");
  if(trajectory.realityBound)sinks.add("WORLD_MODEL_OBSERVATION");else reasons.push("world_model_requires_reality_bound_trajectory");
  const consentOk=!policy.requireConsentForModelDataset||Boolean(trajectory.consentScope?.trim());
  if(!consentOk)reasons.push("model_dataset_consent_required");

  let modelTrainingEligible=false,skillCompilationEligible=false;
  if(trajectory.outcome==="UNKNOWN"){
    if(policy.preserveVerifiedUnknown){sinks.add("CALIBRATION_DATASET");sinks.add("RECONCILIATION_QUEUE")}
    reasons.push("unknown_preserved_not_rewarded_as_success");
  }else if(trajectory.outcome==="FAILURE"){
    if(policy.preserveVerifiedFailure)sinks.add("RECOVERY_DATASET");
    if(consentOk){sinks.add("MODEL_DATASET");modelTrainingEligible=true}
    reasons.push("failure_available_for_recovery_learning_not_skill_compilation");
  }else{
    if(consentOk){sinks.add("MODEL_DATASET");modelTrainingEligible=true}
    const cleanRecurring=context.transitionSuccesses>=policy.minRecurringSuccessesForConsolidation&&context.transitionFailures===0&&context.transitionUnknown===0;
    if(cleanRecurring)sinks.add("CONSOLIDATION_CANDIDATE");else reasons.push("consolidation_requires_repeated_clean_successes");
    const skillReady=context.transitionSuccesses>=policy.minRecurringSuccessesForSkillCandidate&&context.transitionFailures===0&&context.transitionUnknown===0&&trajectory.authorityGrade&&trajectory.realityBound&&trajectory.eligibleAgenticRl;
    if(skillReady){sinks.add("SKILL_CANDIDATE");skillCompilationEligible=true}else reasons.push("skill_candidate_requires_repeated_clean_authority_grade_reality_bound_success");
  }

  return IntelligenceMetabolismDecisionSchema.parse({
    version:"CIEAV_INTELLIGENCE_METABOLISM_DECISION_V1",trajectoryId:trajectory.trajectoryId,trajectoryDigest:intelligenceMetabolismDigest(trajectory),decidedAt,outcome:trajectory.outcome,trustedEpisode,sinks:[...sinks].sort(),reasons:[...new Set(reasons)],modelTrainingEligible,skillCompilationEligible,automaticConsolidationAllowed:false,authority:false,productionAuthority:false,mayMintExecutionAuthority:false,mayPromoteModel:false,mayActivateSkill:false
  });
}

export const INTELLIGENCE_METABOLISM_AUTHORITY=false as const;
export const INTELLIGENCE_METABOLISM_MAY_MINT_EXECUTION_AUTHORITY=false as const;
