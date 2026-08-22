import {describe,expect,it} from "vitest";
import type {AuthorizedOutcomeTrajectory} from "@cieav/contracts";
import {ConsequenceGraph,consequenceTransitionKey,trajectoryToGraphObservation} from "./consequence-graph.js";

const evidence={kind:"API",source:"test",observedAt:"2026-08-22T11:00:00.000Z",summary:"Observed post-state",digest:"a".repeat(64)};
const base=(overrides:Partial<AuthorizedOutcomeTrajectory>={}):AuthorizedOutcomeTrajectory=>({
  version:"CIEAV_AUTHORIZED_OUTCOME_TRAJECTORY_V2",
  trajectoryId:`trajectory-${Math.random().toString(16).slice(2)}`,
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
    expect(()=>trajectoryToGraphObservation(base({cryptographicallyVerified:false}))).toThrow(/cryptographically verified/i);
  });

  it("preserves SUCCESS FAILURE and UNKNOWN independently",()=>{
    const graph=new ConsequenceGraph();
    graph.ingest(base({outcome:"SUCCESS"}));
    graph.ingest(base({outcome:"FAILURE"}));
    graph.ingest(base({outcome:"UNKNOWN"}));
    const edge=graph.edge(consequenceTransitionKey(base()))!;
    expect(edge.observations).toBe(3);
    expect(edge.success).toBe(1);
    expect(edge.failure).toBe(1);
    expect(edge.unknown).toBe(1);
    expect(edge.successRate).toBeCloseTo(1/3);
    expect(edge.failureRate).toBeCloseTo(1/3);
    expect(edge.unknownRate).toBeCloseTo(1/3);
    expect(edge.authority).toBe(false);
    expect(edge.mayMintExecutionAuthority).toBe(false);
  });

  it("tracks authority-grade and reality-bound coverage without granting authority",()=>{
    const graph=new ConsequenceGraph();
    graph.ingest(base());
    graph.ingest(base({authorityGrade:false,realityBound:false,eligibleAgenticRl:false}));
    const edge=graph.edges()[0];
    expect(edge.authorityGradeCoverage).toBe(.5);
    expect(edge.realityBoundCoverage).toBe(.5);
    expect(edge.proofability).toBe(1);
    expect(graph.snapshot().authority).toBe(false);
  });

  it("prefers well-proven successful transitions over uncertain alternatives",()=>{
    const graph=new ConsequenceGraph();
    graph.ingest(base({worldAfterDigest:"1".repeat(64),outcome:"SUCCESS"}));
    graph.ingest(base({worldAfterDigest:"1".repeat(64),outcome:"SUCCESS"}));
    graph.ingest(base({worldAfterDigest:"2".repeat(64),outcome:"UNKNOWN",evidence:[],authorityGrade:false,realityBound:false,eligibleAgenticRl:false}));
    expect(graph.bestObservedEdge("deploy.release")?.worldAfterDigests).toEqual(["1".repeat(64)]);
  });
});
