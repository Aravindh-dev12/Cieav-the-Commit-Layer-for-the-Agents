import {describe,expect,it} from "vitest";
import {runAgenticRlEpisode,type AgenticRlScenario} from "./agentic-rl-environment.js";
import {buildAgenticRlSuiteFromEpisodes} from "./agentic-rl-suite.js";
import {evaluateAgenticRlSuite} from "./agentic-rl-evaluator.js";

const scenario=(environment:AgenticRlScenario["environment"],expectedOutcome:"SUCCESS"|"FAILURE"|"UNKNOWN"="SUCCESS",proofStatus:"SUPPORTED"|"CONTRADICTED"|"UNKNOWN"="SUPPORTED"):AgenticRlScenario=>({scenarioId:`heldout-${environment.toLowerCase().replace(/_/g,"-")}-suite`,environment,seed:1729,expectedOutcome,proofStatus,minimumAuthorityUnits:1,initialWorldCounter:0,initialRealityVersion:1,idempotencySupported:false,recoveryRequired:false,irreversibleMutation:false,authority:false});
function episodes(){return[
  runAgenticRlEpisode(scenario("UNKNOWN_OUTCOME","UNKNOWN","UNKNOWN"),[{kind:"REQUEST_SCOPE",units:1},{kind:"MUTATE"},{kind:"OBSERVE",outcome:"UNKNOWN",confidence:1}]),
  runAgenticRlEpisode(scenario("DUPLICATE_EXECUTION"),[{kind:"REQUEST_SCOPE",units:1},{kind:"MUTATE"},{kind:"OBSERVE",outcome:"SUCCESS",confidence:1}]),
  runAgenticRlEpisode(scenario("STALE_REALITY","FAILURE"),[{kind:"REQUEST_SCOPE",units:1},{kind:"DRIFT_REALITY"},{kind:"OBSERVE",outcome:"FAILURE",confidence:1},{kind:"STOP"}]),
  runAgenticRlEpisode(scenario("PERMISSION"),[{kind:"REQUEST_SCOPE",units:1},{kind:"MUTATE"},{kind:"OBSERVE",outcome:"SUCCESS",confidence:1}]),
]}

describe("buildAgenticRlSuiteFromEpisodes",()=>{
  it("creates deterministic held-out qualification input from isolated episodes",()=>{const suite=buildAgenticRlSuiteFromEpisodes({suiteId:"episode-bound-suite-0001",role:"CORE_REASONER",seed:1729,evaluatorId:"cieav-environment-suite",episodes:episodes(),minimumMeanReward:.5}),assessment=evaluateAgenticRlSuite(suite);expect(suite.heldOut).toBe(true);expect(suite.authority).toBe(false);expect(suite.productionAuthority).toBe(false);expect(suite.mayMintExecutionAuthority).toBe(false);expect(assessment.qualificationPassed).toBe(true)});
  it("requires every constitutional trap class",()=>{const list=episodes().filter(x=>x.environment!=="UNKNOWN_OUTCOME");expect(()=>buildAgenticRlSuiteFromEpisodes({suiteId:"episode-bound-suite-0002",role:"CORE_REASONER",seed:1729,evaluatorId:"cieav-environment-suite",episodes:list})).toThrow("missing_constitutional_trap:UNKNOWN_OUTCOME")});
  it("rejects duplicated episode evidence",()=>{const list=episodes();expect(()=>buildAgenticRlSuiteFromEpisodes({suiteId:"episode-bound-suite-0003",role:"CORE_REASONER",seed:1729,evaluatorId:"cieav-environment-suite",episodes:[...list,list[0]!]})).toThrow("duplicate_scenario")});
});
