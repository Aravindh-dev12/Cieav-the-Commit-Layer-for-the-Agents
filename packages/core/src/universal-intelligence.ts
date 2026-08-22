import type {
  AuthorizedOutcomeTrajectory,
  CognitiveCellDescriptor,
  CognitiveCellPrivacy,
  CognitiveProgram,
  EpistemicClaim,
  EpistemicEvidence,
  IntelligenceState,
  UniversalIntelligencePersistedState,
  WorkspaceContribution,
} from "@cieav/contracts";
import {CognitiveCellRegistry,GlobalIntelligenceWorkspace} from "./cognitive-runtime.js";
import {buildCortexProgram,type CortexInput} from "./cortex.js";
import {EpistemicState} from "./epistemic-state.js";
import {ConsequenceGraph,type ConsequenceGraphEdge} from "./consequence-graph.js";
import {LearningProviderRegistry,ProofProviderRegistry} from "./provider-runtime.js";
import {evaluateTrajectoryEligibility,type TrajectoryEligibility} from "./consequence-intelligence.js";

export type UniversalWorkspaceHandle={workspaceId:string;objective:string;privacy:CognitiveCellPrivacy};
export type UniversalPlanResult={state:IntelligenceState;program:CognitiveProgram;workspace:ReturnType<GlobalIntelligenceWorkspace["snapshot"]>;projectedContributions:WorkspaceContribution[];authority:false;mayMintExecutionAuthority:false};
export type VerifiedExperienceResult={edge:ConsequenceGraphEdge;learning:TrajectoryEligibility;authority:false;mayMintExecutionAuthority:false};

/**
 * UniversalIntelligenceRuntime composes CIEAV's non-authoritative intelligence
 * organs. It can reason about capabilities, beliefs, evidence and verified
 * experience, but it deliberately has no dependency on permit/ticket/credential
 * minting. Execution authority remains outside this runtime.
 */
export class UniversalIntelligenceRuntime{
  readonly cells=new CognitiveCellRegistry();
  readonly epistemic=new EpistemicState();
  readonly consequenceGraph=new ConsequenceGraph();
  readonly proofProviders=new ProofProviderRegistry();
  readonly learningProviders=new LearningProviderRegistry();
  private readonly workspaces=new Map<string,GlobalIntelligenceWorkspace>();

  registerCell(cell:CognitiveCellDescriptor){return this.cells.register(cell)}
  upsertCell(cell:CognitiveCellDescriptor){return this.cells.upsert(cell)}

  createWorkspace(input:{workspaceId:string;objective:string;createdAt:string;privacy:CognitiveCellPrivacy}):UniversalWorkspaceHandle{
    if(this.workspaces.has(input.workspaceId))throw new Error(`duplicate_workspace:${input.workspaceId}`);
    const workspace=new GlobalIntelligenceWorkspace(input);this.workspaces.set(input.workspaceId,workspace);
    return{workspaceId:input.workspaceId,objective:input.objective,privacy:input.privacy};
  }
  workspace(workspaceId:string){return this.workspaces.get(workspaceId)??null}
  contribute(contribution:WorkspaceContribution){const workspace=this.workspaces.get(contribution.workspaceId);if(!workspace)throw new Error(`workspace_not_found:${contribution.workspaceId}`);return workspace.add(contribution)}

  upsertClaim(claim:EpistemicClaim){return this.epistemic.upsert(claim)}
  addClaimEvidence(claimId:string,kind:"SUPPORT"|"CONTRADICT",evidence:EpistemicEvidence){return this.epistemic.addEvidence(claimId,kind,evidence)}
  invalidateClaims(condition:string,observedAt:string){return this.epistemic.invalidate(condition,observedAt)}

  plan(workspaceId:string,input:Omit<CortexInput,"objective"|"epistemicState">):UniversalPlanResult{
    const workspace=this.workspaces.get(workspaceId);if(!workspace)throw new Error(`workspace_not_found:${workspaceId}`);
    const snapshot=workspace.snapshot(),cortex=buildCortexProgram(this.cells,{...input,objective:snapshot.objective,epistemicState:this.epistemic.list()});
    const selectedEngineIds=new Set(cortex.program.steps.map(step=>step.engineId).filter((id):id is string=>Boolean(id)));
    const selectedCells=cortex.state.availableEngines.filter(engine=>selectedEngineIds.has(engine.id)).map(engine=>this.cells.get(engine.id)).filter((cell):cell is CognitiveCellDescriptor=>Boolean(cell));
    const visible=new Map<string,WorkspaceContribution>();
    for(const cell of selectedCells)for(const contribution of workspace.projectForCell(cell))visible.set(contribution.id,contribution);
    return{state:cortex.state,program:cortex.program,workspace:snapshot,projectedContributions:[...visible.values()].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id)),authority:false,mayMintExecutionAuthority:false};
  }

  ingestVerifiedExperience(trajectory:AuthorizedOutcomeTrajectory):VerifiedExperienceResult{
    const learning=evaluateTrajectoryEligibility(trajectory),edge=this.consequenceGraph.ingest(trajectory);
    return{edge,learning,authority:false,mayMintExecutionAuthority:false};
  }

  exportPersistedState(updatedAt=new Date().toISOString()):UniversalIntelligencePersistedState{
    return{
      version:"CIEAV_UNIVERSAL_INTELLIGENCE_STATE_V1",
      updatedAt,
      cells:this.cells.list(),
      claims:this.epistemic.list(),
      workspaces:[...this.workspaces.values()].map(workspace=>({workspace:workspace.snapshot(),contributions:workspace.list()})).sort((a,b)=>a.workspace.workspaceId.localeCompare(b.workspace.workspaceId)),
      consequenceGraph:this.consequenceGraph.persistedState(),
      authority:false,
      mayMintExecutionAuthority:false,
    };
  }

  restorePersistedState(state:UniversalIntelligencePersistedState){
    if(this.cells.list().length||this.epistemic.list().length||this.workspaces.size||this.consequenceGraph.edges().length)throw new Error("universal_intelligence_restore_requires_empty_runtime");
    if(state.authority!==false||state.mayMintExecutionAuthority!==false)throw new Error("persisted_intelligence_state_claimed_authority");
    for(const cell of state.cells)this.cells.register(cell);
    for(const claim of state.claims)this.epistemic.upsert(claim);
    for(const item of state.workspaces){
      const ws=item.workspace;
      this.createWorkspace({workspaceId:ws.workspaceId,objective:ws.objective,createdAt:ws.createdAt,privacy:ws.privacy});
      for(const contribution of [...item.contributions].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id)))this.contribute(contribution);
      const restored=this.workspace(ws.workspaceId)?.snapshot();
      if(!restored||restored.updatedAt!==ws.updatedAt||restored.contributionIds.join("\0")!==ws.contributionIds.join("\0"))throw new Error(`workspace_restore_integrity_mismatch:${ws.workspaceId}`);
    }
    this.consequenceGraph.restore(state.consequenceGraph);
  }

  snapshot(input:{now:string;privacy:CognitiveCellPrivacy;staleAfterMs?:number}){
    return{version:"CIEAV_UNIVERSAL_INTELLIGENCE_RUNTIME_V1" as const,self:this.cells.selfModel({now:input.now,privacy:input.privacy,staleAfterMs:input.staleAfterMs}),epistemic:this.epistemic.snapshot(),consequenceGraph:this.consequenceGraph.snapshot(),workspaces:[...this.workspaces.values()].map(workspace=>workspace.snapshot()).sort((a,b)=>a.workspaceId.localeCompare(b.workspaceId)),proofProviders:this.proofProviders.list(),learningProviders:this.learningProviders.list(),authority:false as const,mayMintExecutionAuthority:false as const};
  }
}

export const UNIVERSAL_INTELLIGENCE_AUTHORITY=false as const;
export const UNIVERSAL_INTELLIGENCE_MAY_MINT_EXECUTION_AUTHORITY=false as const;
