import {describe,expect,it} from "vitest";
import type {AuthorizedOutcomeTrajectory} from "@cieav/contracts";
import {ConsequenceGraph,consequenceTransitionKey,trajectoryToGraphObservation} from "./consequence-graph.js";

const evidence={kind:"API",source:"test",observedAt:"2026-08-22T11:00:00.000Z",summary:"Observed post-state",digest:"a".repeat(64)};
let sequence=0;
const base=(overrides:Partial<AuthorizedOutcomeTrajectory>={}):AuthorizedOutcomeTrajectory=>({
  version:"CIEAV_AUTHORIZED_OUTCOME_TRAJECTORY_V2",
  trajectoryId:`trajectory-${String(++sequence).padStart(8,"0")}`,
  objective:"deploy release",
  worldBeforeDigest:"b".repeat(64),
  worldAfterDigest:"c".repeat(64),
  operation:"deploy.release",
  exactArgumentsDigest:"d".repeat(64),
  executionEvents:[],
  evidence:[evidence],
  outcome:"SUCCESS",
  recovery:[],
  cryptographicallyVerified:true,
  authorityGrade:true,
  realityBound:true,
  eligibleAgenticRl:true,
  redactionProfile:"training-v1",
  authority:false,
  productionAuthority:false,
  ...overrides,
});

describe("ConsequenceGraph",()=>{
  it("rejects unverified trajectories",()=>{
    expect(()=>trajectoryToGraphObservation(base({cryptographicallyVerified:false}))).toThrow("consequence_graph_requires_cryptographically_verified_trajectory");
  });

  it("groups different post-states under the same pre-execution decision context",()=>{
    const graph=new ConsequenceGraph();
    graph.ingest(base({outcome:"SUCCESS",worldAfterDigest:"1".repeat(64)}));
    graph.ingest(base({outcome:"FAILURE",worldAfterDigest:"2".repeat(64)}));
    graph.ingest(base({outcome:"UNKNOWN",worldAfterDigest:"3".repeat(64)}));
    const edge=graph.edge(consequenceTransitionKey(base()))!;
    expect(edge.observations).toBe(3);
    expect(edge.success).toBe(1);
    expect(edge.failure).toBe(1);
    expect(edge.unknown).toBe(1);
    expect(edge.successRate).toBeCloseTo(1/3);
    expect(edge.failureRate).toBeCloseTo(1/3);
    expect(edge.unknownRate).toBeCloseTo(1/3);
    expect(edge.worldAfterDigests).toEqual(["1".repeat(64),"2".repeat(64),"3".repeat(64)]);
    expect(edge.authority).toBe(false);
    expect(edge.mayMintExecutionAuthority).toBe(false);
  });

  it("tracks authority-grade and reality-bound coverage without granting authority",()=>{
    const graph=new ConsequenceGraph();
    graph.ingest(base());
    graph.ingest(base({authorityGrade:false,realityBound:false,eligibleAgenticRl:false}));
    const edge=graph.edges()[0]!;
    expect(edge.authorityGradeCoverage).toBe(.5);
    expect(edge.realityBoundCoverage).toBe(.5);
    expect(edge.proofability).toBe(1);
    expect(graph.snapshot().authority).toBe(false);
  });

  it("distinguishes materially different exact operations/arguments",()=>{
    const graph=new ConsequenceGraph();
    graph.ingest(base({exactArgumentsDigest:"1".repeat(64),outcome:"SUCCESS"}));
    graph.ingest(base({exactArgumentsDigest:"1".repeat(64),outcome:"SUCCESS"}));
    graph.ingest(base({exactArgumentsDigest:"2".repeat(64),outcome:"UNKNOWN",evidence:[],authorityGrade:false,realityBound:false,eligibleAgenticRl:false}));
    const best=graph.bestObservedEdge("deploy.release")!;
    expect(best.exactArgumentsDigest).toBe("1".repeat(64));
    expect(best.successRate).toBe(1);
  });

  it("makes identical trajectory replay idempotent in the same process",()=>{
    const graph=new ConsequenceGraph(),trajectory=base({trajectoryId:"trajectory-idempotent-0001"});
    const first=graph.ingest(trajectory),second=graph.ingest(structuredClone(trajectory));
    expect(first.observations).toBe(1);
    expect(second.observations).toBe(1);
    expect(graph.snapshot().observations).toBe(1);
    expect(graph.snapshot().ingestedTrajectories).toBe(1);
  });

  it("rejects changed content under an already-ingested trajectory id",()=>{
    const graph=new ConsequenceGraph(),trajectory=base({trajectoryId:"trajectory-tamper-0001"});
    graph.ingest(trajectory);
    expect(()=>graph.ingest({...trajectory,outcome:"FAILURE"})).toThrow("consequence_graph_trajectory_id_content_mismatch");
    expect(graph.snapshot().observations).toBe(1);
  });

  it("persists the trajectory replay ledger across restart",()=>{
    const graph=new ConsequenceGraph(),trajectory=base({trajectoryId:"trajectory-restart-0001"});
    graph.ingest(trajectory);
    const persisted=graph.persistedState();
    expect(persisted.ingestedTrajectories).toHaveLength(1);
    const restored=new ConsequenceGraph();restored.restore(persisted);
    expect(restored.ingest(trajectory).observations).toBe(1);
    expect(restored.snapshot().observations).toBe(1);
    expect(()=>restored.ingest({...trajectory,objective:"changed objective"})).toThrow("consequence_graph_trajectory_id_content_mismatch");
  });

  it("restores legacy V1 graph state that predates the replay ledger",()=>{
    const graph=new ConsequenceGraph(),trajectory=base({trajectoryId:"trajectory-legacy-source"});
    graph.ingest(trajectory);
    const persisted=graph.persistedState();
    const legacy={version:persisted.version,edges:persisted.edges,authority:false as const,mayMintExecutionAuthority:false as const};
    const restored=new ConsequenceGraph();
    restored.restore(legacy);
    expect(restored.snapshot().observations).toBe(1);
    expect(restored.snapshot().ingestedTrajectories).toBe(0);
  });
});
