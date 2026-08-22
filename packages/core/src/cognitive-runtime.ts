import type {
  CognitiveCellDescriptor,
  CognitiveCellPrivacy,
  GlobalWorkspace,
  SelfModel,
  WorkspaceContribution,
} from "@cieav/contracts";

const parseTime=(value:string)=>{const n=Date.parse(value);if(!Number.isFinite(n))throw new Error("invalid_cognitive_timestamp");return n};
const privacyRank:Record<CognitiveCellPrivacy,number>={LOCAL_ONLY:0,REDACTED_REMOTE_ALLOWED:1,REMOTE_ALLOWED:2};

export type SelfModelInput={
  now:string;
  privacy:CognitiveCellPrivacy;
  staleAfterMs?:number;
  activeObjectives?:string[];
  activeCommitmentRefs?:string[];
  uncertainty?:number;
};

export class CognitiveCellRegistry{
  private readonly cells=new Map<string,CognitiveCellDescriptor>();

  register(cell:CognitiveCellDescriptor){
    if(cell.authority!==false||cell.mayMintExecutionAuthority!==false)throw new Error("cognitive_cell_must_have_zero_authority");
    if(this.cells.has(cell.id))throw new Error(`duplicate_cognitive_cell:${cell.id}`);
    this.cells.set(cell.id,structuredClone(cell));
    return this.get(cell.id)!;
  }

  upsert(cell:CognitiveCellDescriptor){
    if(cell.authority!==false||cell.mayMintExecutionAuthority!==false)throw new Error("cognitive_cell_must_have_zero_authority");
    const current=this.cells.get(cell.id);
    if(current&&parseTime(cell.lastHeartbeatAt)<parseTime(current.lastHeartbeatAt))throw new Error(`stale_cognitive_cell_update:${cell.id}`);
    this.cells.set(cell.id,structuredClone(cell));
    return this.get(cell.id)!;
  }

  heartbeat(id:string,health:CognitiveCellDescriptor["health"],at:string){
    const current=this.cells.get(id);if(!current)throw new Error(`cognitive_cell_not_found:${id}`);
    if(current.health==="REVOKED")throw new Error(`cognitive_cell_revoked:${id}`);
    if(parseTime(at)<parseTime(current.lastHeartbeatAt))throw new Error(`stale_cognitive_cell_update:${id}`);
    const next={...current,health,lastHeartbeatAt:at};this.cells.set(id,next);return structuredClone(next);
  }

  revoke(id:string,at:string){
    const current=this.cells.get(id);if(!current)throw new Error(`cognitive_cell_not_found:${id}`);
    if(parseTime(at)<parseTime(current.lastHeartbeatAt))throw new Error(`stale_cognitive_cell_update:${id}`);
    const next={...current,health:"REVOKED" as const,lastHeartbeatAt:at};this.cells.set(id,next);return structuredClone(next);
  }

  remove(id:string){return this.cells.delete(id)}
  get(id:string){const value=this.cells.get(id);return value?structuredClone(value):null}
  list(){return[...this.cells.values()].map(cell=>structuredClone(cell)).sort((a,b)=>a.id.localeCompare(b.id))}

  available(input:{now:string;staleAfterMs?:number;privacy:CognitiveCellPrivacy}){
    const now=parseTime(input.now),staleAfter=Math.max(1,input.staleAfterMs??60_000);
    return this.list().filter(cell=>{
      if(cell.health!=="HEALTHY"&&cell.health!=="DEGRADED")return false;
      if(now-parseTime(cell.lastHeartbeatAt)>staleAfter)return false;
      if(input.privacy==="LOCAL_ONLY"&&!cell.local)return false;
      return privacyRank[cell.privacyBoundary]<=privacyRank[input.privacy];
    });
  }

  selfModel(input:SelfModelInput):SelfModel{
    const cells=this.list();
    const available=this.available({now:input.now,privacy:input.privacy,staleAfterMs:input.staleAfterMs});
    const capabilities=[...new Set(available.flatMap(cell=>cell.capabilities))].sort();
    const uncertainty=Math.max(0,Math.min(1,Number.isFinite(input.uncertainty??0)?input.uncertainty??0:1));
    return{
      version:"CIEAV_SELF_MODEL_V1",
      generatedAt:input.now,
      cells,
      healthyCellIds:available.map(cell=>cell.id),
      availableCapabilities:capabilities,
      activeObjectives:[...(input.activeObjectives??[])],
      activeCommitmentRefs:[...(input.activeCommitmentRefs??[])],
      privacy:input.privacy,
      uncertainty,
      authority:false,
      mayMintExecutionAuthority:false,
    };
  }
}

export class GlobalIntelligenceWorkspace{
  private readonly contributions=new Map<string,WorkspaceContribution>();
  private state:GlobalWorkspace;

  constructor(input:{workspaceId:string;objective:string;createdAt:string;privacy:CognitiveCellPrivacy}){
    this.state={version:"CIEAV_GLOBAL_WORKSPACE_V1",workspaceId:input.workspaceId,objective:input.objective,createdAt:input.createdAt,updatedAt:input.createdAt,privacy:input.privacy,contributionIds:[],authority:false,mayMintExecutionAuthority:false};
  }

  add(contribution:WorkspaceContribution){
    if(contribution.authority!==false)throw new Error("workspace_contribution_must_have_zero_authority");
    if(contribution.workspaceId!==this.state.workspaceId)throw new Error("workspace_id_mismatch");
    if(this.contributions.has(contribution.id))throw new Error(`duplicate_workspace_contribution:${contribution.id}`);
    if(privacyRank[contribution.privacy]>privacyRank[this.state.privacy])throw new Error("workspace_privacy_violation");
    if(parseTime(contribution.createdAt)<parseTime(this.state.createdAt))throw new Error("workspace_contribution_predates_workspace");
    this.contributions.set(contribution.id,structuredClone(contribution));
    this.state={...this.state,updatedAt:contribution.createdAt,contributionIds:[...this.state.contributionIds,contribution.id]};
    return structuredClone(contribution);
  }

  list(){return this.state.contributionIds.map(id=>structuredClone(this.contributions.get(id)!))}

  projectForCell(cell:CognitiveCellDescriptor){
    if(cell.health==="REVOKED"||cell.health==="UNHEALTHY")throw new Error(`workspace_cell_unavailable:${cell.id}`);
    const maxPrivacy: CognitiveCellPrivacy = cell.local?"REMOTE_ALLOWED":cell.privacyBoundary;
    return this.list().filter(item=>privacyRank[item.privacy]<=privacyRank[maxPrivacy]);
  }

  snapshot(){return structuredClone(this.state)}
}
