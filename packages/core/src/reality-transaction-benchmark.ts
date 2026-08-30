import crypto from "node:crypto";
import {
  RealityTransactionBenchmarkReportSchema,
  RealityTransactionBenchmarkScenarioResultSchema,
  type RealityTransactionBenchmarkReport,
  type RealityTransactionBenchmarkScenarioKind,
  type RealityTransactionBenchmarkScenarioResult
} from "@cieav/contracts";

const canonical=(value:unknown):string=>Array.isArray(value)
  ?`[${value.map(canonical).join(",")}]`
  :value&&typeof value==="object"
    ?`{${Object.keys(value as Record<string,unknown>).sort().map(key=>`${JSON.stringify(key)}:${canonical((value as Record<string,unknown>)[key])}`).join(",")}}`
    :JSON.stringify(value)??"undefined";
export const realityTransactionBenchmarkDigest=(value:unknown)=>crypto.createHash("sha256").update(canonical(value)).digest("hex");
const uniq=(values:string[])=>[...new Set(values)].sort();

export const REQUIRED_REALITY_TRANSACTION_BENCHMARK_SCENARIOS:RealityTransactionBenchmarkScenarioKind[]=[
  "HETEROGENEOUS_EQUIVALENCE",
  "CROSS_ROUTE_CONFLICT",
  "UNKNOWN_QUARANTINE",
  "AGGREGATE_ANTI_FRAGMENTATION",
  "EVIDENCE_QUORUM",
  "MULTI_AXIS_SETTLEMENT",
  "DURABLE_RESTART",
  "OFFLINE_RECONNECT"
];

export function realityTransactionBenchmarkScenario(input:Omit<RealityTransactionBenchmarkScenarioResult,"id"|"version"|"detailsDigest"|"authority"|"mayMintExecutionAuthority">):RealityTransactionBenchmarkScenarioResult{
  const details={
    kind:input.kind,
    passed:input.passed,
    runtimeClass:input.runtimeClass,
    routeEvidence:input.routeEvidence,
    canonicalRealityRefs:uniq(input.canonicalRealityRefs),
    consequenceRefs:uniq(input.consequenceRefs),
    settlementStates:[...input.settlementStates],
    evidenceRefs:uniq(input.evidenceRefs),
    unresolvedBlockers:uniq(input.unresolvedBlockers),
    startedAt:input.startedAt,
    completedAt:input.completedAt
  };
  return RealityTransactionBenchmarkScenarioResultSchema.parse({
    id:crypto.randomUUID(),
    version:"CIEAV_REALITY_TRANSACTION_BENCHMARK_SCENARIO_V1",
    ...details,
    detailsDigest:realityTransactionBenchmarkDigest(details),
    authority:false,
    mayMintExecutionAuthority:false
  });
}

export function buildRealityTransactionBenchmarkReport(input:{
  gitCommitSha?:string;
  platform:string;
  arch:string;
  runtimeVersion:string;
  runnerRef:string;
  scenarios:RealityTransactionBenchmarkScenarioResult[];
  requiredScenarioKinds?:RealityTransactionBenchmarkScenarioKind[];
  unresolvedBlockers?:string[];
  startedAt?:string;
  completedAt?:string;
}):RealityTransactionBenchmarkReport{
  const requiredScenarioKinds=input.requiredScenarioKinds??REQUIRED_REALITY_TRANSACTION_BENCHMARK_SCENARIOS;
  const scenarios=input.scenarios.map(value=>RealityTransactionBenchmarkScenarioResultSchema.parse(value));
  const byKind=new Map(scenarios.map(scenario=>[scenario.kind,scenario] as const));
  const allRequiredScenariosPassed=requiredScenarioKinds.every(kind=>byKind.get(kind)?.passed===true);
  const routeProtocols=uniq(scenarios.flatMap(scenario=>scenario.routeEvidence.map(route=>route.protocol)));
  const runtimeClasses=uniq(scenarios.map(scenario=>scenario.runtimeClass)) as RealityTransactionBenchmarkReport["runtimeClasses"];
  const unresolvedBlockers=uniq([...(input.unresolvedBlockers??[]),...scenarios.flatMap(scenario=>scenario.unresolvedBlockers)]);
  const liveOnly=scenarios.every(scenario=>scenario.runtimeClass!=="SIMULATED");
  const liveExecutionEvidence=scenarios.filter(scenario=>scenario.routeEvidence.length>0).every(scenario=>scenario.routeEvidence.some(route=>route.liveSideEffectObserved));
  const productionQualified=allRequiredScenariosPassed&&routeProtocols.length>=2&&liveOnly&&liveExecutionEvidence&&unresolvedBlockers.length===0;
  const unsigned={
    version:"CIEAV_REALITY_TRANSACTION_BENCHMARK_REPORT_V1" as const,
    benchmarkId:crypto.randomUUID(),
    ...(input.gitCommitSha?{gitCommitSha:input.gitCommitSha}:{}),
    platform:input.platform,
    arch:input.arch,
    runtimeVersion:input.runtimeVersion,
    runnerRef:input.runnerRef,
    requiredScenarioKinds,
    scenarios,
    routeProtocols,
    runtimeClasses,
    allRequiredScenariosPassed,
    productionQualified,
    unresolvedBlockers,
    startedAt:input.startedAt??scenarios.map(scenario=>scenario.startedAt).sort()[0]??new Date().toISOString(),
    completedAt:input.completedAt??scenarios.map(scenario=>scenario.completedAt).sort().at(-1)??new Date().toISOString(),
    authority:false as const,
    mayMintExecutionAuthority:false as const
  };
  return RealityTransactionBenchmarkReportSchema.parse({...unsigned,reportDigest:realityTransactionBenchmarkDigest(unsigned)});
}

export function verifyRealityTransactionBenchmarkReport(raw:RealityTransactionBenchmarkReport){
  const report=RealityTransactionBenchmarkReportSchema.parse(raw),{reportDigest,...unsigned}=report;
  if(realityTransactionBenchmarkDigest(unsigned)!==reportDigest)throw new Error("reality_transaction_benchmark_report_integrity_mismatch");
  for(const scenario of report.scenarios){
    const {id:_,version:__,detailsDigest,authority:___,mayMintExecutionAuthority:____,...details}=scenario;
    if(realityTransactionBenchmarkDigest(details)!==detailsDigest)throw new Error(`reality_transaction_benchmark_scenario_integrity_mismatch:${scenario.kind}`);
  }
  const rebuilt=buildRealityTransactionBenchmarkReport({
    ...(report.gitCommitSha?{gitCommitSha:report.gitCommitSha}:{}),
    platform:report.platform,
    arch:report.arch,
    runtimeVersion:report.runtimeVersion,
    runnerRef:report.runnerRef,
    scenarios:report.scenarios,
    requiredScenarioKinds:report.requiredScenarioKinds,
    unresolvedBlockers:report.unresolvedBlockers,
    startedAt:report.startedAt,
    completedAt:report.completedAt
  });
  if(rebuilt.allRequiredScenariosPassed!==report.allRequiredScenariosPassed||rebuilt.productionQualified!==report.productionQualified||canonical(rebuilt.routeProtocols)!==canonical(report.routeProtocols)||canonical(rebuilt.runtimeClasses)!==canonical(report.runtimeClasses))throw new Error("reality_transaction_benchmark_qualification_mismatch");
  return true;
}

export const REALITY_TRANSACTION_BENCHMARK_AUTHORITY=false as const;
export const REALITY_TRANSACTION_BENCHMARK_MAY_MINT_EXECUTION_AUTHORITY=false as const;
