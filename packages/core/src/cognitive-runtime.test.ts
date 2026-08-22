import {describe,expect,it} from "vitest";
import type {CognitiveCellDescriptor,WorkspaceContribution} from "@cieav/contracts";
import {CognitiveCellRegistry,GlobalIntelligenceWorkspace} from "./cognitive-runtime.js";

const at="2026-08-22T14:00:00.000Z";
const cell=(overrides:Partial<CognitiveCellDescriptor>={}):CognitiveCellDescriptor=>({
  version:"CIEAV_COGNITIVE_CELL_V1",
  id:"local-core",
  type:"MODEL",
  provider:"cieav-local",
  capabilities:["reason","code"],
  inputModalities:["text"],
  outputModalities:["text"],
  local:true,
  privacyBoundary:"LOCAL_ONLY",
  health:"HEALTHY",
  lastHeartbeatAt:at,
  competence:{reason:.8,code:.9},
  proofCapabilities:[],
  authority:false,
  mayMintExecutionAuthority:false,
  ...overrides,
});
const contribution=(overrides:Partial<WorkspaceContribution>={}):WorkspaceContribution=>({
  id:"contrib-12345678",
  workspaceId:"workspace-12345678",
  cellId:"local-core",
  kind:"EVIDENCE",
  summary:"Local repository observation",
  evidenceRefs:["evidence:1"],
  confidence:.9,
  privacy:"LOCAL_ONLY",
  createdAt:"2026-08-22T14:00:01.000Z",
  authority:false,
  ...overrides,
});

describe("CognitiveCellRegistry",()=>{
  it("builds a live non-authoritative self model from healthy cells",()=>{
    const registry=new CognitiveCellRegistry();
    registry.register(cell());
    registry.register(cell({id:"remote-frontier",provider:"frontier",local:false,privacyBoundary:"REDACTED_REMOTE_ALLOWED",capabilities:["reason"],lastHeartbeatAt:at}));
    const self=registry.selfModel({now:"2026-08-22T14:00:10.000Z",privacy:"REDACTED_REMOTE_ALLOWED",uncertainty:.2});
    expect(self.healthyCellIds).toEqual(["local-core","remote-frontier"]);
    expect(self.availableCapabilities).toEqual(["code","reason"]);
    expect(self).toMatchObject({authority:false,mayMintExecutionAuthority:false});
  });

  it("excludes remote cells for LOCAL_ONLY work and excludes stale/revoked cells",()=>{
    const registry=new CognitiveCellRegistry();
    registry.register(cell());
    registry.register(cell({id:"remote",provider:"remote",local:false,privacyBoundary:"REDACTED_REMOTE_ALLOWED"}));
    registry.register(cell({id:"stale",lastHeartbeatAt:"2026-08-22T13:00:00.000Z"}));
    registry.register(cell({id:"revoked"}));
    registry.revoke("revoked","2026-08-22T14:00:02.000Z");
    const available=registry.available({now:"2026-08-22T14:00:10.000Z",privacy:"LOCAL_ONLY",staleAfterMs:60_000});
    expect(available.map(x=>x.id)).toEqual(["local-core"]);
  });

  it("rejects stale updates and impossible remote LOCAL_ONLY cells",()=>{
    const registry=new CognitiveCellRegistry();
    registry.register(cell());
    expect(()=>registry.upsert(cell({lastHeartbeatAt:"2026-08-22T13:59:59.000Z"}))).toThrow(/stale_cognitive_cell_update/);
    expect(()=>registry.register(cell({id:"bad-remote",local:false,privacyBoundary:"LOCAL_ONLY"}))).toThrow(/remote_cell_cannot_claim_local_only/);
  });
});

describe("GlobalIntelligenceWorkspace",()=>{
  it("preserves provenance and keeps LOCAL_ONLY contributions away from remote cells",()=>{
    const workspace=new GlobalIntelligenceWorkspace({workspaceId:"workspace-12345678",objective:"repair repository",createdAt:at,privacy:"REDACTED_REMOTE_ALLOWED"});
    workspace.add(contribution());
    workspace.add(contribution({id:"contrib-remote-1234",privacy:"REDACTED_REMOTE_ALLOWED",summary:"Redacted error signature",createdAt:"2026-08-22T14:00:02.000Z"}));
    const remote=cell({id:"remote-frontier",provider:"frontier",local:false,privacyBoundary:"REDACTED_REMOTE_ALLOWED"});
    expect(workspace.projectForCell(remote).map(x=>x.id)).toEqual(["contrib-remote-1234"]);
    expect(workspace.projectForCell(cell()).map(x=>x.id)).toEqual(["contrib-12345678","contrib-remote-1234"]);
    expect(workspace.snapshot()).toMatchObject({authority:false,mayMintExecutionAuthority:false});
  });

  it("rejects mismatched workspace contributions and unavailable cells",()=>{
    const workspace=new GlobalIntelligenceWorkspace({workspaceId:"workspace-12345678",objective:"repair repository",createdAt:at,privacy:"REMOTE_ALLOWED"});
    expect(()=>workspace.add(contribution({workspaceId:"workspace-other"}))).toThrow(/workspace_id_mismatch/);
    workspace.add(contribution());
    expect(()=>workspace.projectForCell(cell({id:"revoked",health:"REVOKED"}))).toThrow(/workspace_cell_unavailable/);
  });
});
