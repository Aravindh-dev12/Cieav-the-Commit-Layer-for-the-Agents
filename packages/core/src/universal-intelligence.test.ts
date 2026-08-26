import {describe,expect,it} from "vitest";
import type {AuthorizedOutcomeTrajectory,CognitiveCellDescriptor,EpistemicClaim,WorkspaceContribution} from "@cieav/contracts";
import {UniversalIntelligenceRuntime} from "./universal-intelligence.js";

const now="2026-08-22T15:00:00.000Z";
const cell=(overrides:Partial<CognitiveCellDescriptor>={}):CognitiveCellDescriptor=>({
  version:"CIEAV_COGNITIVE_CELL_V1",id:"local-model",type:"MODEL",provider:"local",capabilities:["reason"],inputModalities:["text"],outputModalities:["text"],local:true,privacyBoundary:"LOCAL_ONLY",health:"HEALTHY",lastHeartbeatAt:now,competence:{reason:.9},proofCapabilities:[],authority:false,mayMintExecutionAuthority:false,...overrides,
});
const claim=(overrides:Partial<EpistemicClaim>={}):EpistemicClaim=>({claimId:"claim-state-001",claim:"repository has failing tests",scope:"repo",status:"SUPPORTED",confidence:.9,observedAt:now,supportingEvidence:[{kind:"TEST",source:"vitest",observedAt:now,summary:"tests fail"}],contradictingEvidence:[],invalidationConditions:["tests.changed"],...overrides});
const contribution=(overrides:Partial<WorkspaceContribution>={}):WorkspaceContribution=>({id:"contribution-0001",workspaceId:"workspace-0001",cellId:"local-model",kind:"EVIDENCE",summary:"failure is in receipt store",evidenceRefs:["test:receipt"],confidence:.9,privacy:"LOCAL_ONLY",createdAt:"2026-08-22T15:00:01.000Z",authority:false,...overrides});
const trajectory=(overrides:Partial<AuthorizedOutcomeTrajectory>={}):AuthorizedOutcomeTrajectory=>({version:"CIEAV_AUTHORIZED_OUTCOME_TRAJECTORY_V2",trajectoryId:"trajectory-0001",objective:"repair tests",worldBeforeDigest:"a".repeat(64),worldAfterDigest:"b".repeat(64),operation:"repo.patch",exactArgumentsDigest:"c".repeat(64),executionEvents:["patch applied"],evidence:[{kind:"TEST",source:"vitest",observedAt:"2026-08-22T15:01:00.000Z",summary:"tests pass",digest:"d".repeat(64)}],outcome:"SUCCESS",recovery:[],cryptographicallyVerified:true,authorityGrade:true,realityBound:true,eligibleAgenticRl:true,redactionProfile:"training-v1",authority:false,productionAuthority:false,...overrides});

describe("UniversalIntelligenceRuntime",()=>{
  it("runs cells -> workspace -> cortex -> projected context without authority",()=>{
    const runtime=new UniversalIntelligenceRuntime();
    runtime.registerCell(cell());
    runtime.registerCell(cell({id:"proof-local",type:"PROOF_PROVIDER",provider:"proof",capabilities:["prove"],competence:{prove:.8}}));
    runtime.createWorkspace({workspaceId:"workspace-0001",objective:"repair failing tests",createdAt:now,privacy:"LOCAL_ONLY"});
    runtime.contribute(contribution());
    runtime.upsertClaim(claim());
    const plan=runtime.plan("workspace-0001",{self:{now:"2026-08-22T15:00:10.000Z",privacy:"LOCAL_ONLY"},uncertainty:.4});
    expect(plan.program.steps.map(step=>step.kind)).toEqual(["MODEL","PROVE"]);
    expect(plan.projectedContributions.map(item=>item.id)).toEqual(["contribution-0001"]);
    expect(plan.state.epistemicState[0].claimId).toBe("claim-state-001");
    expect(plan).toMatchObject({authority:false,mayMintExecutionAuthority:false});
  });

  it("keeps local-only evidence away from remote selected cells",()=>{
    const runtime=new UniversalIntelligenceRuntime();
    runtime.registerCell(cell({id:"remote-model",provider:"remote",local:false,privacyBoundary:"REDACTED_REMOTE_ALLOWED"}));
    runtime.createWorkspace({workspaceId:"workspace-0001",objective:"analyze issue",createdAt:now,privacy:"REDACTED_REMOTE_ALLOWED"});
    runtime.contribute(contribution());
    runtime.contribute(contribution({id:"contribution-0002",privacy:"REDACTED_REMOTE_ALLOWED",summary:"redacted failure signature",createdAt:"2026-08-22T15:00:02.000Z"}));
    const plan=runtime.plan("workspace-0001",{self:{now:"2026-08-22T15:00:10.000Z",privacy:"REDACTED_REMOTE_ALLOWED"},uncertainty:.2});
    expect(plan.program.steps[0]).toMatchObject({kind:"MODEL",engineId:"remote-model"});
    expect(plan.projectedContributions.map(item=>item.id)).toEqual(["contribution-0002"]);
  });

  it("ingests only cryptographically verified experience into graph and preserves UNKNOWN",()=>{
    const runtime=new UniversalIntelligenceRuntime();
    const unknown=runtime.ingestVerifiedExperience(trajectory({outcome:"UNKNOWN",eligibleAgenticRl:false}));
    expect(unknown.edge.unknown).toBe(1);
    expect(unknown.learning.outcome).toBe("UNKNOWN");
    expect(unknown.learning.reasons).toContain("unknown_is_training_signal_not_success");
    expect(()=>runtime.ingestVerifiedExperience(trajectory({trajectoryId:"trajectory-bad",cryptographicallyVerified:false}))).toThrow("consequence_graph_requires_cryptographically_verified_trajectory");
  });

  it("produces a non-authoritative organism snapshot",()=>{
    const runtime=new UniversalIntelligenceRuntime();
    runtime.registerCell(cell());
    runtime.createWorkspace({workspaceId:"workspace-0001",objective:"repair",createdAt:now,privacy:"LOCAL_ONLY"});
    const snapshot=runtime.snapshot({now:"2026-08-22T15:00:10.000Z",privacy:"LOCAL_ONLY"});
    expect(snapshot.version).toBe("CIEAV_UNIVERSAL_INTELLIGENCE_RUNTIME_V1");
    expect(snapshot.self.healthyCellIds).toEqual(["local-model"]);
    expect(snapshot).toMatchObject({authority:false,mayMintExecutionAuthority:false});
  });
});
