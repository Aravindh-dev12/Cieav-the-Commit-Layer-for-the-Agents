import {describe,expect,it} from "vitest";
import type {AuthorizedOutcomeTrajectory,ConsequenceProgram,IntelligenceState} from "@cieav/contracts/consequence-intelligence";
import {buildBaselineCognitiveProgram,chooseConsequencePath,CONSEQUENCE_INTELLIGENCE_AUTHORITY,CONSEQUENCE_INTELLIGENCE_MAY_MINT_EXECUTION_AUTHORITY,evaluateTrajectoryEligibility} from "./consequence-intelligence.js";

describe("consequence intelligence baseline",()=>{
  it("prefers a scoped, provable and reversible route over a broader risky route",()=>{
    const program:ConsequenceProgram={
      version:"CIEAV_CONSEQUENCE_PROGRAM_V1",programId:"program-001",objective:"Deploy release",desiredState:["release 42 active"],preconditions:[],requiredAuthority:[],proofObligations:[],recoverySemantics:[],unknownPolicy:"STOP_AND_RECONCILE",duplicatePolicy:"IDEMPOTENCY_REQUIRED",risk:"HIGH",authority:false,
      candidatePaths:[
        {pathId:"root-shell",executionProvider:"ssh",operation:"deploy",expectedSuccessProbability:.96,expectedUnknownProbability:.18,authorityCost:1,blastRadius:.95,proofability:.45,reversibility:"UNKNOWN",preconditions:[],proofObligations:[],recoverySemantics:[]},
        {pathId:"deployment-api",executionProvider:"api",operation:"deploy",expectedSuccessProbability:.92,expectedUnknownProbability:.03,authorityCost:.2,blastRadius:.25,proofability:.96,reversibility:"REVERSIBLE",preconditions:[],proofObligations:[],recoverySemantics:[]},
      ],
    };
    expect(chooseConsequencePath(program).path.pathId).toBe("deployment-api");
  });

  it("respects LOCAL_ONLY privacy when scheduling cognition",()=>{
    const state:IntelligenceState={
      version:"CIEAV_INTELLIGENCE_STATE_V1",objective:"Diagnose private incident",epistemicState:[],availableTools:[],availableSkills:[],activeHypotheses:[],uncertainty:.4,proofObligations:[],recoveryRequirements:[],authority:false,mayMintExecutionAuthority:false,
      budget:{privacy:"LOCAL_ONLY"},
      availableEngines:[
        {id:"remote-frontier",kind:"MODEL",provider:"remote",local:false,modalities:[],competenceTags:[],authority:false},
        {id:"local-core",kind:"MODEL",provider:"cieav",local:true,modalities:[],competenceTags:[],authority:false},
      ],
    };
    const plan=buildBaselineCognitiveProgram(state);
    expect(plan.steps.some(s=>s.engineId==="remote-frontier")).toBe(false);
    expect(plan.steps.some(s=>s.engineId==="local-core")).toBe(true);
    expect(plan.authority).toBe(false);
  });

  it("routes qualified model-family specialists only into declared cognitive roles",()=>{
    const engine=(id:string,role:string)=>({id,kind:"MODEL" as const,provider:"cieav-qualified",local:true,modalities:["text"],competenceTags:[`role:${role}`,"qualified-model"],authority:false as const});
    const state:IntelligenceState={version:"CIEAV_INTELLIGENCE_STATE_V1",objective:"Plan a high-consequence change",epistemicState:[],availableTools:[],availableSkills:[],activeHypotheses:[],uncertainty:.4,proofObligations:["prove post-state"],recoveryRequirements:["reconcile unknown"],authority:false,mayMintExecutionAuthority:false,budget:{privacy:"LOCAL_ONLY"},availableEngines:[engine("router","ROUTER"),engine("core","CORE_REASONER"),engine("consequence","CONSEQUENCE_MODEL"),engine("proof-planner","PROOF_PLANNER"),engine("authority-advisor","AUTHORITY_ADVISOR"),engine("recovery","RECOVERY_MODEL"),engine("critic","CRITIC_REWARD"),engine("compiler","SKILL_COMPILER")]};
    const plan=buildBaselineCognitiveProgram(state);
    expect(plan.strategy).toBe("QUALIFIED_MODEL_FAMILY");
    expect(plan.steps.map(s=>[s.stepId,s.engineId])).toEqual(expect.arrayContaining([["route-cognition","router"],["reason","core"],["consequence-model","consequence"],["authority-advice","authority-advisor"],["proof-planner-model","proof-planner"],["recovery-model","recovery"],["critic","critic"]]));
    expect(plan.steps.some(s=>s.engineId==="compiler")).toBe(false);
    expect(plan.authority).toBe(false);
  });

  it("never promotes a specialist-only model into the generic primary reasoner",()=>{
    const state:IntelligenceState={version:"CIEAV_INTELLIGENCE_STATE_V1",objective:"Reason",epistemicState:[],availableTools:[],availableSkills:[],activeHypotheses:[],uncertainty:.4,proofObligations:[],recoveryRequirements:[],authority:false,mayMintExecutionAuthority:false,budget:{privacy:"LOCAL_ONLY"},availableEngines:[{id:"skill-compiler",kind:"MODEL",provider:"cieav",local:true,modalities:["text"],competenceTags:["role:SKILL_COMPILER"],authority:false}]};
    const plan=buildBaselineCognitiveProgram(state);
    expect(plan.strategy).toBe("STOP_NO_ADMISSIBLE_ENGINE");
    expect(plan.steps.some(s=>s.engineId==="skill-compiler")).toBe(false);
  });

  it("preserves UNKNOWN and refuses agentic RL without authority-grade reality binding",()=>{
    const trajectory:AuthorizedOutcomeTrajectory={
      version:"CIEAV_AUTHORIZED_OUTCOME_TRAJECTORY_V2",trajectoryId:"trajectory-001",objective:"Transfer funds",operation:"financial.transfer",exactArgumentsDigest:"0123456789abcdef",executionEvents:[],evidence:[],outcome:"UNKNOWN",recovery:[],cryptographicallyVerified:true,authorityGrade:false,realityBound:false,eligibleAgenticRl:false,redactionProfile:"minimum-v1",authority:false,productionAuthority:false,
    };
    const result=evaluateTrajectoryEligibility(trajectory);
    expect(result.outcome).toBe("UNKNOWN");
    expect(result.eligibleForOutcomeLearning).toBe(true);
    expect(result.eligibleForAgenticRl).toBe(false);
    expect(result.reasons).toContain("unknown_is_training_signal_not_success");
  });

  it("keeps consequence intelligence outside execution authority",()=>{
    expect(CONSEQUENCE_INTELLIGENCE_AUTHORITY).toBe(false);
    expect(CONSEQUENCE_INTELLIGENCE_MAY_MINT_EXECUTION_AUTHORITY).toBe(false);
  });
});
