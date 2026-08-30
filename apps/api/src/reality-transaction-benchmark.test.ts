import {describe,expect,it} from "vitest";
import {REQUIRED_REALITY_TRANSACTION_BENCHMARK_SCENARIOS,verifyRealityTransactionBenchmarkReport} from "@cieav/core";
import {runLocalRealityTransactionBenchmark} from "./reality-transaction-benchmark.js";

describe("CIEAV M14 heterogeneous Reality Transaction benchmark",()=>{
  it("runs required scenarios with live local heterogeneous routes and emits a verified qualification report",async()=>{
    const report=await runLocalRealityTransactionBenchmark({gitCommitSha:"0".repeat(40),runnerRef:"vitest-local"});
    expect(verifyRealityTransactionBenchmarkReport(report)).toBe(true);
    expect(report.requiredScenarioKinds).toEqual(REQUIRED_REALITY_TRANSACTION_BENCHMARK_SCENARIOS);
    expect(report.allRequiredScenariosPassed).toBe(true);
    expect(report.productionQualified).toBe(true);
    expect(report.routeProtocols).toContain("HTTP");
    expect(report.routeProtocols).toContain("FILESYSTEM");
    expect(report.runtimeClasses).toEqual(["LOCAL_LIVE"]);
    expect(report.scenarios).toHaveLength(REQUIRED_REALITY_TRANSACTION_BENCHMARK_SCENARIOS.length);
    expect(report.scenarios.every(scenario=>scenario.passed&&scenario.authority===false&&scenario.mayMintExecutionAuthority===false)).toBe(true);
    expect(report.scenarios.find(scenario=>scenario.kind==="UNKNOWN_QUARANTINE")?.settlementStates).toContain("UNKNOWN");
    expect(report.scenarios.find(scenario=>scenario.kind==="OFFLINE_RECONNECT")?.settlementStates).toContain("UNKNOWN");
  },60_000);
});
