import {
  AuthorizedOutcomeTrajectorySchema,
  CognitiveProgramSchema,
  ConsequenceProgramSchema,
  IntelligenceStateSchema,
  type AuthorizedOutcomeTrajectory,
  type CognitiveEngine,
  type CognitiveProgram,
  type ConsequencePath,
  type ConsequenceProgram,
  type IntelligenceState,
} from "@cieav/contracts/consequence-intelligence";

const REVERSIBILITY_SCORE:Record<ConsequencePath["reversibility"],number>={REVERSIBLE:1,DELAYABLE:.85,COMPENSABLE:.65,IRREVERSIBLE:.15,UNKNOWN:0};
export type RankedConsequencePath={path:ConsequencePath;score:number;reasons:string[]};

/** Deterministic, authority-free baseline for choosing between already-proposed paths. */
export function rankConsequencePaths(input:ConsequenceProgram):RankedConsequencePath[]{
  const program=ConsequenceProgramSchema.parse(input);
  return program.candidatePaths.map(path=>{
    const reversibility=REVERSIBILITY_SCORE[path.reversibility];
    const score=.34*path.expectedSuccessProbability+.24*path.proofability+.14*reversibility-.12*path.expectedUnknownProbability-.09*path.authorityCost-.07*path.blastRadius;
    const reasons=[`success=${path.expectedSuccessProbability.toFixed(3)}`,`proofability=${path.proofability.toFixed(3)}`,`unknown=${path.expectedUnknownProbability.toFixed(3)}`,`authorityCost=${path.authorityCost.toFixed(3)}`,`blastRadius=${path.blastRadius.toFixed(3)}`,`reversibility=${path.reversibility}`];
    return{path,score:Number(score.toFixed(9)),reasons};
  }).sort((a,b)=>b.score-a.score||a.path.pathId.localeCompare(b.path.pathId));
}

export function chooseConsequencePath(input:ConsequenceProgram):RankedConsequencePath{const ranked=rankConsequencePaths(input);if(!ranked.length)throw new Error("consequence_program_has_no_candidate_paths");return ranked[0]!}
function engineByKind(engines:CognitiveEngine[],kind:CognitiveEngine["kind"],localOnly=false){return engines.find(e=>e.kind===kind&&(!localOnly||e.local))}
function models(engines:CognitiveEngine[],localOnly:boolean){return engines.filter(e=>e.kind==="MODEL"&&(!localOnly||e.local))}
function modelByRole(engines:CognitiveEngine[],role:string,localOnly:boolean){const tag=`role:${role}`;return models(engines,localOnly).find(e=>e.competenceTags.includes(tag))}
function genericModel(engines:CognitiveEngine[],localOnly:boolean){return models(engines,localOnly).find(e=>!e.competenceTags.some(tag=>tag.startsWith("role:")))}

/**
 * Deterministic authority-free cognitive scheduler. Qualified specialist models
 * may advise only within their declared role. The scheduler itself retains
 * routing control and no model/agent/skill can mint execution authority.
 */
export function buildBaselineCognitiveProgram(input:IntelligenceState):CognitiveProgram{
  const state=IntelligenceStateSchema.parse(input),localOnly=state.budget.privacy==="LOCAL_ONLY";
  const skill=engineByKind(state.availableEngines,"SKILL",localOnly),agent=engineByKind(state.availableEngines,"AGENT",localOnly),retriever=engineByKind(state.availableEngines,"RETRIEVER",localOnly),simulator=engineByKind(state.availableEngines,"SIMULATOR",localOnly),proof=engineByKind(state.availableEngines,"PROOF_PROVIDER",localOnly),human=engineByKind(state.availableEngines,"HUMAN",false),router=modelByRole(state.availableEngines,"ROUTER",localOnly),coreReasoner=modelByRole(state.availableEngines,"CORE_REASONER",localOnly),consequenceModel=modelByRole(state.availableEngines,"CONSEQUENCE_MODEL",localOnly),proofPlanner=modelByRole(state.availableEngines,"PROOF_PLANNER",localOnly),authorityAdvisor=modelByRole(state.availableEngines,"AUTHORITY_ADVISOR",localOnly),recoveryModel=modelByRole(state.availableEngines,"RECOVERY_MODEL",localOnly),critic=modelByRole(state.availableEngines,"CRITIC_REWARD",localOnly),fallbackModel=genericModel(state.availableEngines,localOnly),steps:CognitiveProgram["steps"]=[];
  if(retriever)steps.push({stepId:"retrieve",kind:"RETRIEVE",engineId:retriever.id,purpose:"Retrieve relevant verified consequence knowledge and current evidence."});

  let primary:"SKILL"|"MODEL"|"AGENT"|null=null,usedQualifiedFamily=false;
  if(skill&&state.uncertainty<=.15){primary="SKILL";steps.push({stepId:"skill",kind:"SKILL",engineId:skill.id,purpose:"Use a previously qualified deterministic skill candidate for the objective."})}
  else if(coreReasoner||fallbackModel){
    primary="MODEL";const model=coreReasoner??fallbackModel!;usedQualifiedFamily=Boolean(coreReasoner);
    if(router){usedQualifiedFamily=true;steps.push({stepId:"route-cognition",kind:"MODEL",engineId:router.id,purpose:"Produce an authority-free routing recommendation; deterministic CIEAV scheduling retains control."})}
    steps.push({stepId:"reason",kind:"MODEL",engineId:model.id,purpose:coreReasoner?"Use the qualified Core Reasoner to produce a consequence-aware plan without execution authority.":"Produce a consequence-aware plan without execution authority."});
  }
  else if(agent){primary="AGENT";steps.push({stepId:"delegate-cognition",kind:"AGENT",engineId:agent.id,purpose:"Delegate bounded reasoning to an external agent Cognitive Cell without granting execution authority."})}
  else{steps.push({stepId:"stop-no-cognition",kind:"STOP",purpose:"No admissible primary cognitive engine is available under the current privacy constraints."});return CognitiveProgramSchema.parse({version:"CIEAV_COGNITIVE_PROGRAM_V1",strategy:"STOP_NO_ADMISSIBLE_ENGINE",steps,authority:false})}

  if(primary==="MODEL"){
    if(consequenceModel){usedQualifiedFamily=true;steps.push({stepId:"consequence-model",kind:"MODEL",engineId:consequenceModel.id,purpose:"Estimate downstream consequence, reversibility, duplicate and UNKNOWN risks without execution authority."})}
    if(authorityAdvisor){usedQualifiedFamily=true;steps.push({stepId:"authority-advice",kind:"MODEL",engineId:authorityAdvisor.id,purpose:"Advise on least-authority requirements only; this model cannot issue permits, credentials or tickets."})}
    if(proofPlanner){usedQualifiedFamily=true;steps.push({stepId:"proof-planner-model",kind:"MODEL",engineId:proofPlanner.id,purpose:"Plan independent post-state evidence and UNKNOWN reconciliation without settling its own output."})}
  }
  if(simulator&&state.uncertainty>=.35)steps.push({stepId:"simulate",kind:"SIMULATE",engineId:simulator.id,purpose:"Evaluate candidate consequences before authority is requested."});
  if(proof)steps.push({stepId:"proof-plan",kind:"PROVE",engineId:proof.id,purpose:"Construct independent proof obligations for the expected consequence."});
  if(primary==="MODEL"&&recoveryModel&&state.recoveryRequirements.length){usedQualifiedFamily=true;steps.push({stepId:"recovery-model",kind:"MODEL",engineId:recoveryModel.id,purpose:"Plan bounded recovery and reconciliation for declared recovery requirements without execution authority."})}
  if(primary==="MODEL"&&critic){usedQualifiedFamily=true;steps.push({stepId:"critic",kind:"MODEL",engineId:critic.id,purpose:"Critique the cognitive plan and calibration only; the critic cannot authorize or promote itself."})}
  if(state.uncertainty>=.75){if(human)steps.push({stepId:"human",kind:"HUMAN",engineId:human.id,purpose:"Escalate because uncertainty exceeds the autonomous planning threshold."});else steps.push({stepId:"stop-uncertain",kind:"STOP",purpose:"Stop because uncertainty is high and no human escalation engine is available."})}

  const strategy=primary==="SKILL"?"QUALIFIED_SKILL_FIRST":primary==="AGENT"?"BOUNDED_AGENT_DELEGATION":usedQualifiedFamily?"QUALIFIED_MODEL_FAMILY":"EVIDENCE_AWARE_REASONING";
  return CognitiveProgramSchema.parse({version:"CIEAV_COGNITIVE_PROGRAM_V1",strategy,steps,authority:false});
}

export type TrajectoryEligibility={eligibleForOutcomeLearning:boolean;eligibleForAgenticRl:boolean;reasons:string[];outcome:AuthorizedOutcomeTrajectory["outcome"]};
/** Learning eligibility is deterministic. UNKNOWN is never rewritten to SUCCESS. */
export function evaluateTrajectoryEligibility(input:AuthorizedOutcomeTrajectory):TrajectoryEligibility{
  const t=AuthorizedOutcomeTrajectorySchema.parse(input),reasons:string[]=[],outcomeLearning=t.cryptographicallyVerified&&Boolean(t.redactionProfile);
  if(!t.cryptographicallyVerified)reasons.push("cryptographic_verification_required");if(!t.redactionProfile)reasons.push("redaction_profile_required");
  const agenticRl=outcomeLearning&&t.authorityGrade&&t.realityBound&&t.eligibleAgenticRl;
  if(!t.authorityGrade)reasons.push("authority_grade_required_for_agentic_rl");if(!t.realityBound)reasons.push("reality_binding_required_for_agentic_rl");if(!t.eligibleAgenticRl)reasons.push("trajectory_not_marked_agentic_rl_eligible");if(t.outcome==="UNKNOWN")reasons.push("unknown_is_training_signal_not_success");
  return{eligibleForOutcomeLearning:outcomeLearning,eligibleForAgenticRl:agenticRl,reasons,outcome:t.outcome};
}

export const CONSEQUENCE_INTELLIGENCE_AUTHORITY=false as const;
export const CONSEQUENCE_INTELLIGENCE_MAY_MINT_EXECUTION_AUTHORITY=false as const;
