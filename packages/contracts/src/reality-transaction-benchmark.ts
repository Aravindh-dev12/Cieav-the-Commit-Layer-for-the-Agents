import {z} from "zod";

const DigestSchema=z.string().regex(/^[0-9a-f]{64}$/);
const RefSchema=z.string().min(1).max(1200);

export const RealityTransactionBenchmarkRuntimeClassSchema=z.enum(["SIMULATED","LOCAL_LIVE","REMOTE_LIVE"]);
export type RealityTransactionBenchmarkRuntimeClass=z.infer<typeof RealityTransactionBenchmarkRuntimeClassSchema>;

export const RealityTransactionBenchmarkScenarioKindSchema=z.enum([
  "HETEROGENEOUS_EQUIVALENCE",
  "CROSS_ROUTE_CONFLICT",
  "UNKNOWN_QUARANTINE",
  "AGGREGATE_ANTI_FRAGMENTATION",
  "EVIDENCE_QUORUM",
  "MULTI_AXIS_SETTLEMENT",
  "DURABLE_RESTART",
  "OFFLINE_RECONNECT",
  "SUPPLY_CHAIN_DRIFT",
  "CAUSAL_RECALL"
]);
export type RealityTransactionBenchmarkScenarioKind=z.infer<typeof RealityTransactionBenchmarkScenarioKindSchema>;

export const RealityTransactionBenchmarkRouteEvidenceSchema=z.object({
  routeRef:RefSchema,
  protocol:z.string().min(1).max(80),
  adapterRef:RefSchema,
  adapterManifestDigest:DigestSchema,
  runtimeArtifactDigest:DigestSchema,
  runtimeClass:RealityTransactionBenchmarkRuntimeClassSchema,
  liveSideEffectObserved:z.boolean(),
  evidenceRefs:z.array(RefSchema).min(1).max(100),
  authority:z.literal(false).default(false)
});
export type RealityTransactionBenchmarkRouteEvidence=z.infer<typeof RealityTransactionBenchmarkRouteEvidenceSchema>;

export const RealityTransactionBenchmarkScenarioResultSchema=z.object({
  id:z.string().uuid(),
  version:z.literal("CIEAV_REALITY_TRANSACTION_BENCHMARK_SCENARIO_V1"),
  kind:RealityTransactionBenchmarkScenarioKindSchema,
  passed:z.boolean(),
  runtimeClass:RealityTransactionBenchmarkRuntimeClassSchema,
  routeEvidence:z.array(RealityTransactionBenchmarkRouteEvidenceSchema).max(20).default([]),
  canonicalRealityRefs:z.array(DigestSchema).max(100).default([]),
  consequenceRefs:z.array(z.string().uuid()).max(100).default([]),
  settlementStates:z.array(z.enum(["SUCCESS","FAILURE","UNKNOWN"])).max(20).default([]),
  evidenceRefs:z.array(RefSchema).min(1).max(200),
  unresolvedBlockers:z.array(z.string().min(1).max(1000)).max(100).default([]),
  detailsDigest:DigestSchema,
  startedAt:z.string().datetime(),
  completedAt:z.string().datetime(),
  authority:z.literal(false).default(false),
  mayMintExecutionAuthority:z.literal(false).default(false)
});
export type RealityTransactionBenchmarkScenarioResult=z.infer<typeof RealityTransactionBenchmarkScenarioResultSchema>;

export const RealityTransactionBenchmarkReportSchema=z.object({
  version:z.literal("CIEAV_REALITY_TRANSACTION_BENCHMARK_REPORT_V1"),
  benchmarkId:z.string().uuid(),
  gitCommitSha:z.string().regex(/^[0-9a-f]{40}$/).optional(),
  platform:z.string().min(1).max(120),
  arch:z.string().min(1).max(120),
  runtimeVersion:z.string().min(1).max(200),
  runnerRef:z.string().min(1).max(300),
  requiredScenarioKinds:z.array(RealityTransactionBenchmarkScenarioKindSchema).min(1).max(20),
  scenarios:z.array(RealityTransactionBenchmarkScenarioResultSchema).min(1).max(100),
  routeProtocols:z.array(z.string().min(1).max(80)).max(50),
  runtimeClasses:z.array(RealityTransactionBenchmarkRuntimeClassSchema).max(3),
  allRequiredScenariosPassed:z.boolean(),
  productionQualified:z.boolean(),
  unresolvedBlockers:z.array(z.string().min(1).max(1000)).max(200).default([]),
  startedAt:z.string().datetime(),
  completedAt:z.string().datetime(),
  reportDigest:DigestSchema,
  authority:z.literal(false).default(false),
  mayMintExecutionAuthority:z.literal(false).default(false)
}).superRefine((report,ctx)=>{
  if(report.productionQualified&&!report.allRequiredScenariosPassed)ctx.addIssue({code:z.ZodIssueCode.custom,path:["productionQualified"],message:"production qualification requires every required scenario to pass"});
  if(report.productionQualified&&report.unresolvedBlockers.length)ctx.addIssue({code:z.ZodIssueCode.custom,path:["unresolvedBlockers"],message:"production qualification cannot contain unresolved blockers"});
  if(report.productionQualified&&report.routeProtocols.length<2)ctx.addIssue({code:z.ZodIssueCode.custom,path:["routeProtocols"],message:"production qualification requires heterogeneous route protocols"});
  if(report.productionQualified&&report.runtimeClasses.includes("SIMULATED"))ctx.addIssue({code:z.ZodIssueCode.custom,path:["runtimeClasses"],message:"production qualification cannot rely on simulated scenarios"});
});
export type RealityTransactionBenchmarkReport=z.infer<typeof RealityTransactionBenchmarkReportSchema>;
