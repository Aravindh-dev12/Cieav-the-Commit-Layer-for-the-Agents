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

const REVERSIBILITY_SCORE:Record<ConsequencePath["reversibility"],number>={
  REVERSIBLE:1,
  DELAYABLE:.85,
  COMPENSABLE:.65,
  IRREVERSIBLE:.15,
  UNKNOWN:0,
};

export type RankedConsequencePath={path:ConsequencePath;score:number;reasons:string[]};

/**
 * Deterministic, authority-free baseline for choosing between already-proposed paths.
 * This function never executes a path and never mints authority.
 */
export function rankConsequencePaths(input:ConsequenceProgram):RankedConsequencePath[]{
  const program=ConsequenceProgramSchema.parse(input);
  return program.candidatePaths.map(path=>{
    const reversibility=REVERSIBILITY_SCORE[path.reversibility];
    const score=
      .34*path.expectedSuccessProbability+
      .24*path.proofability+
      .14*reversibility-
      .12*path.expectedUnknownProbability-
      .09*path.authorityCost-
      .07*path.blastRadius;
    const reasons=[
      `success=${path.expectedSuccessProbability.toFixed(3)}`,
      `proofability=${path.proofability.toFixed(3)}`,
      `unknown=${path.expectedUnknownProbability.toFixed(3)}`,
      `authorityCost=${path.authorityCost.toFixed(3)}`,
      `blastRadius=${path.blastRadius.toFixed(3)}`,
      `reversibility=${path.reversibility}`,
    ];
    return{path,score:Number(score.toFixed(9)),reasons};
  }).sort((a,b)=>b.score-a.score||a.path.pathId.localeCompare(b.path.pathId));
}

export function chooseConsequencePath(input:ConsequenceProgram):RankedConsequencePath{
  const ranked=rankConsequencePaths(input);
  if(!ranked.length)throw new Error("consequence_program_has_no_candidate_paths");
  return ranked[0]!;
}

function engineByKind(engines:CognitiveEngine[],kind:CognitiveEngine["kind"],localOnly=false){
  return engines.find(e=>e.kind===kind&&(!localOnly||e.local));
}

/**
 * Minimal deterministic scheduler used before a learned router is qualified.
 * The output is a cognitive program only. It has authority=false by contract.
 */
export function buildBaselineCognitiveProgram(input:IntelligenceState):CognitiveProgram{
  const state=IntelligenceStateSchema.parse(input);
  const localOnly=state.budget.privacy==="LOCAL_ONLY";
  const skill=engineByKind(state.availableEngines,"SKILL",localOnly);
  const model=engineByKind(state.availableEngines,"MODEL",localOnly);
  const retriever=engineByKind(state.availableEngines,"RETRIEVER",localOnly);
  const simulator=engineByKind(state.availableEngines,"SIMULATOR",localOnly);
  const proof=engineByKind(state.availableEngines,"PROOF_PROVIDER",localOnly);
  const human=engineByKind(state.availableEngines,"HUMAN",false);
  const steps:CognitiveProgram["steps"]=[];

  if(retriever)steps.push({stepId:"retrieve",kind:"RETRIEVE",engineId:retriever.id,purpose:"Retrieve relevant verified consequence knowledge and current evidence."});

  if(skill&&state.uncertainty<=.15){
    steps.push({stepId:"skill",kind:"SKILL",engineId:skill.id,purpose:"Use a previously qualified deterministic skill candidate for the objective."});
  }else if(model){
    steps.push({stepId:"reason",kind:"MODEL",engineId:model.id,purpose:"Produce a consequence-aware plan without execution authority."});
  }else{
    steps.push({stepId:"stop-no-cognition",kind:"STOP",purpose:"No admissible cognitive engine is available under the current privacy constraints."});
    return CognitiveProgramSchema.parse({version:"CIEAV_COGNITIVE_PROGRAM_V1",strategy:"STOP_NO_ADMISSIBLE_ENGINE",steps,authority:false});
  }

  if(simulator&&state.uncertainty>=.35)steps.push({stepId:"simulate",kind:"SIMULATE",engineId:simulator.id,purpose:"Evaluate candidate consequences before authority is requested."});
  if(proof)steps.push({stepId:"proof-plan",kind:"PROVE",engineId:proof.id,purpose:"Construct independent proof obligations for the expected consequence."});

  if(state.uncertainty>=.75){
    if(human)steps.push({stepId:"human",kind:"HUMAN",engineId:human.id,purpose:"Escalate because uncertainty exceeds the autonomous planning threshold."});
    else steps.push({stepId:"stop-uncertain",kind:"STOP",purpose:"Stop because uncertainty is high and no human escalation engine is available."});
  }

  return CognitiveProgramSchema.parse({
    version:"CIEAV_COGNITIVE_PROGRAM_V1",
    strategy:skill&&state.uncertainty<=.15?"QUALIFIED_SKILL_FIRST":"EVIDENCE_AWARE_REASONING",
    steps,
    authority:false,
  });
}

export type TrajectoryEligibility={
  eligibleForOutcomeLearning:boolean;
  eligibleForAgenticRl:boolean;
  reasons:string[];
  outcome:AuthorizedOutcomeTrajectory["outcome"];
};

/**
 * Learning eligibility is deterministic. UNKNOWN is preserved as a valid outcome
 * signal and is never rewritten to SUCCESS.
 */
export function evaluateTrajectoryEligibility(input:AuthorizedOutcomeTrajectory):TrajectoryEligibility{
  const t=AuthorizedOutcomeTrajectorySchema.parse(input);
  const reasons:string[]=[];
  const outcomeLearning=t.cryptographicallyVerified&&Boolean(t.redactionProfile);
  if(!t.cryptographicallyVerified)reasons.push("cryptographic_verification_required");
  if(!t.redactionProfile)reasons.push("redaction_profile_required");
  const agenticRl=outcomeLearning&&t.authorityGrade&&t.realityBound&&t.eligibleAgenticRl;
  if(!t.authorityGrade)reasons.push("authority_grade_required_for_agentic_rl");
  if(!t.realityBound)reasons.push("reality_binding_required_for_agentic_rl");
  if(!t.eligibleAgenticRl)reasons.push("trajectory_not_marked_agentic_rl_eligible");
  if(t.outcome==="UNKNOWN")reasons.push("unknown_is_training_signal_not_success");
  return{eligibleForOutcomeLearning:outcomeLearning,eligibleForAgenticRl:agenticRl,reasons,outcome:t.outcome};
}

export const CONSEQUENCE_INTELLIGENCE_AUTHORITY=false as const;
export const CONSEQUENCE_INTELLIGENCE_MAY_MINT_EXECUTION_AUTHORITY=false as const;
