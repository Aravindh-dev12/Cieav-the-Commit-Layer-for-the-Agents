import crypto from "node:crypto";
import type {ExecutionProposal,ExecutionTicket,FederatedTool} from "@cieav/contracts/execution-fabric";
import {digest} from "@cieav/core/execution-fabric";
import type {CieavExecutionFabricStore} from "./execution-fabric.js";
import type {CieavControlPlaneStore} from "./control-plane.js";
import type {CieavCredentialAuthority} from "./credential-authority.js";
import {loadTrustedHttpFamilyAdaptersSync} from "./trusted-http-adapter.js";
import {loadTrustedOAuthHttpAdaptersSync} from "./trusted-oauth-http-adapter.js";
import {loadTrustedMcpStdioAdaptersSync} from "./trusted-mcp-adapter.js";
import {loadTrustedMcpHttpAdaptersSync} from "./trusted-mcp-http-adapter.js";
import {loadTrustedA2aTaskAdaptersSync} from "./trusted-a2a-adapter.js";

export type ToolProtocol=FederatedTool["protocol"];
export type AdapterEvidenceSeed={kind:string;source:string;summary:string;externalRef?:string};
export type AdapterExecutionResult={attemptedAt:string;transport:"ACCEPTED"|"REJECTED"|"UNKNOWN";externalRef?:string;evidenceSeeds:AdapterEvidenceSeed[];metadata?:Record<string,string|number|boolean|null>};
export type TrustedDispatchContext={ticket:ExecutionTicket;proposal:ExecutionProposal;tool:FederatedTool;normalizedArguments:unknown};
export interface CieavExecutionAdapter{
  readonly protocol:ToolProtocol;
  /** Deterministic, side-effect-free adapter selection when multiple adapters share a protocol. */
  supports?(context:TrustedDispatchContext):boolean;
  /** Fail-closed readiness validation that runs before one-use authority is consumed. */
  preflight?(context:TrustedDispatchContext):Promise<void>|void;
  execute(context:TrustedDispatchContext):Promise<AdapterExecutionResult>;
}

export class CieavExecutionRouter{
  private readonly adapters=new Map<ToolProtocol,CieavExecutionAdapter[]>();
  constructor(private readonly fabric:CieavExecutionFabricStore,adapters:CieavExecutionAdapter[]=[],private readonly controlPlane?:CieavControlPlaneStore,private readonly credentialAuthority?:CieavCredentialAuthority){
    const stateDir=process.env.CIEAV_STATE_DIR?.trim()||process.env.LATCH_STATE_DIR?.trim();
    const initial=adapters.length?adapters:(stateDir?[...loadTrustedHttpFamilyAdaptersSync(stateDir,process.env),...(credentialAuthority?loadTrustedOAuthHttpAdaptersSync(stateDir,credentialAuthority,process.env):[]),...loadTrustedMcpStdioAdaptersSync(stateDir,process.env),...loadTrustedMcpHttpAdaptersSync(stateDir,process.env),...loadTrustedA2aTaskAdaptersSync(stateDir,process.env)]:[]);
    for(const adapter of initial)this.register(adapter);
  }
  register(adapter:CieavExecutionAdapter){const list=this.adapters.get(adapter.protocol)??[];if(list.includes(adapter))throw new Error(`execution_adapter_already_registered:${adapter.protocol}`);list.push(adapter);this.adapters.set(adapter.protocol,list)}
  registeredProtocols(){return[...this.adapters.keys()].sort()}
  private selectAdapter(context:TrustedDispatchContext){
    const candidates=this.adapters.get(context.tool.protocol)??[];
    if(candidates.length===0)throw new Error(`execution_adapter_unavailable:${context.tool.protocol}`);
    if(candidates.length===1){const adapter=candidates[0]!;if(adapter.supports&&!adapter.supports(context))throw new Error(`execution_adapter_unavailable:${context.tool.protocol}`);return adapter}
    const matching=candidates.filter(adapter=>adapter.supports?.(context)===true);
    if(matching.length===1)return matching[0]!;
    if(matching.length>1)throw new Error(`execution_adapter_ambiguous:${context.tool.protocol}`);
    const fallbacks=candidates.filter(adapter=>adapter.supports===undefined);
    if(fallbacks.length===1)return fallbacks[0]!;
    if(fallbacks.length>1)throw new Error(`execution_adapter_ambiguous:${context.tool.protocol}`);
    throw new Error(`execution_adapter_unavailable:${context.tool.protocol}`);
  }
  async dispatch(ticketId:string,normalizedArguments:unknown):Promise<{dispatch:TrustedDispatchContext;result:AdapterExecutionResult}>{
    const inspected=await this.fabric.inspectTicket(ticketId),preflightContext={...inspected,normalizedArguments};
    const adapter=this.selectAdapter(preflightContext);
    await adapter.preflight?.(preflightContext);
    let consumedMandateId:string|undefined;
    if(this.controlPlane){const posture=await this.controlPlane.getPosture();if(posture.mode==="MANDATORY"){if(!posture.ready)throw new Error("mandatory_interposition_not_ready");const mandate=(await this.controlPlane.listMandates()).find(m=>m.proposalId===inspected.proposal.id&&m.status==="ISSUED");if(!mandate)throw new Error("operation_mandate_required_for_mandatory_dispatch");const consumed=await this.controlPlane.consumeMandate(mandate.id,inspected.proposal,normalizedArguments);consumedMandateId=consumed.id}}
    const dispatch=await this.fabric.consumeTicket(ticketId,normalizedArguments);
    try{
      const result=await adapter.execute(dispatch);
      if(!result||!result.attemptedAt||!Number.isFinite(Date.parse(result.attemptedAt))||!Array.isArray(result.evidenceSeeds))throw new Error("execution_adapter_invalid_result");
      await this.fabric.recordExecutionAttempt(ticketId,result.transport,`Adapter ${adapter.protocol} reported ${result.transport}.`,{externalRef:result.externalRef??null,evidenceSeeds:result.evidenceSeeds,metadata:result.metadata??{}});
      if(consumedMandateId&&this.controlPlane){const mandate=(await this.controlPlane.listMandates()).find(m=>m.id===consumedMandateId);if(!mandate)throw new Error("consumed_operation_mandate_missing");await this.controlPlane.recordAttempt({id:crypto.randomUUID(),version:1,mandateId:mandate.id,executionTicketId:dispatch.ticket.id,taskId:dispatch.proposal.taskId,intentId:dispatch.proposal.intentId,routeDigest:mandate.routeDigest,normalizedArgumentsDigest:mandate.normalizedArgumentsDigest,attemptedAt:result.attemptedAt,transportResultDigest:digest({transport:result.transport,externalRef:result.externalRef??null,evidenceSeeds:result.evidenceSeeds,metadata:result.metadata??{}}),transportAccepted:result.transport==="ACCEPTED",settlement:result.transport==="UNKNOWN"?"UNKNOWN":"PENDING"})}
      return{dispatch,result};
    }catch(err:any){
      await this.fabric.recordExecutionAttempt(ticketId,"UNKNOWN","Downstream adapter outcome is indeterminate; semantic effect quarantined pending reconciliation.",{errorName:String(err?.name??"Error"),errorMessage:String(err?.message??err).slice(0,1000)});
      if(consumedMandateId&&this.controlPlane){const mandate=(await this.controlPlane.listMandates()).find(m=>m.id===consumedMandateId);if(mandate)try{await this.controlPlane.recordAttempt({id:crypto.randomUUID(),version:1,mandateId:mandate.id,executionTicketId:dispatch.ticket.id,taskId:dispatch.proposal.taskId,intentId:dispatch.proposal.intentId,routeDigest:mandate.routeDigest,normalizedArgumentsDigest:mandate.normalizedArgumentsDigest,attemptedAt:new Date().toISOString(),transportResultDigest:digest({transport:"UNKNOWN",errorName:String(err?.name??"Error"),errorMessage:String(err?.message??err).slice(0,1000)}),transportAccepted:false,settlement:"UNKNOWN"})}catch{}}
      throw new Error(`execution_adapter_outcome_unknown:${String(err?.message??err)}`);
    }
  }
}
