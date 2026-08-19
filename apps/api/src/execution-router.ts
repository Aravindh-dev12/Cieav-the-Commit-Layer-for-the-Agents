import crypto from "node:crypto";
import type {ExecutionProposal,ExecutionTicket,FederatedTool} from "@cieav/contracts/execution-fabric";
import {digest} from "@cieav/core/execution-fabric";
import type {CieavExecutionFabricStore} from "./execution-fabric.js";
import type {CieavControlPlaneStore} from "./control-plane.js";
import {loadTrustedHttpFamilyAdaptersSync} from "./trusted-http-adapter.js";

export type ToolProtocol=FederatedTool["protocol"];
export type AdapterEvidenceSeed={kind:string;source:string;summary:string;externalRef?:string};
export type AdapterExecutionResult={
  attemptedAt:string;
  transport:"ACCEPTED"|"REJECTED"|"UNKNOWN";
  externalRef?:string;
  evidenceSeeds:AdapterEvidenceSeed[];
  metadata?:Record<string,string|number|boolean|null>;
};
export type TrustedDispatchContext={ticket:ExecutionTicket;proposal:ExecutionProposal;tool:FederatedTool;normalizedArguments:unknown};

export interface CieavExecutionAdapter{
  readonly protocol:ToolProtocol;
  /** Fail-closed readiness validation that runs before any one-use authority is consumed. */
  preflight?(context:TrustedDispatchContext):Promise<void>|void;
  execute(context:TrustedDispatchContext):Promise<AdapterExecutionResult>;
}

/**
 * The router is the only in-process path from an Execution Ticket to a downstream adapter.
 * Adapter and tool-specific preflight readiness are checked before one-use authority is consumed.
 * In MANDATORY posture, a matching signed Operation Mandate is consumed before the Execution Ticket.
 * Any failure after authority consumption is treated as an unresolved effect, never as permission to blindly retry.
 */
export class CieavExecutionRouter{
  private readonly adapters=new Map<ToolProtocol,CieavExecutionAdapter>();
  constructor(private readonly fabric:CieavExecutionFabricStore,adapters:CieavExecutionAdapter[]=[],private readonly controlPlane?:CieavControlPlaneStore){
    const stateDir=process.env.CIEAV_STATE_DIR?.trim()||process.env.LATCH_STATE_DIR?.trim();
    const initial=adapters.length?adapters:(stateDir?loadTrustedHttpFamilyAdaptersSync(stateDir,process.env):[]);
    for(const adapter of initial)this.register(adapter);
  }
  register(adapter:CieavExecutionAdapter){if(this.adapters.has(adapter.protocol))throw new Error(`execution_adapter_already_registered:${adapter.protocol}`);this.adapters.set(adapter.protocol,adapter)}
  registeredProtocols(){return[...this.adapters.keys()].sort()}

  async dispatch(ticketId:string,normalizedArguments:unknown):Promise<{dispatch:TrustedDispatchContext;result:AdapterExecutionResult}>{
    const inspected=await this.fabric.inspectTicket(ticketId);
    const adapter=this.adapters.get(inspected.tool.protocol);
    if(!adapter)throw new Error(`execution_adapter_unavailable:${inspected.tool.protocol}`);
    await adapter.preflight?.(inspected);

    let consumedMandateId:string|undefined;
    if(this.controlPlane){
      const posture=await this.controlPlane.getPosture();
      if(posture.mode==="MANDATORY"){
        if(!posture.ready)throw new Error("mandatory_interposition_not_ready");
        const mandate=(await this.controlPlane.listMandates()).find(m=>m.proposalId===inspected.proposal.id&&m.status==="ISSUED");
        if(!mandate)throw new Error("operation_mandate_required_for_mandatory_dispatch");
        const consumed=await this.controlPlane.consumeMandate(mandate.id,inspected.proposal,normalizedArguments);
        consumedMandateId=consumed.id;
      }
    }

    const dispatch=await this.fabric.consumeTicket(ticketId,normalizedArguments);
    try{
      const result=await adapter.execute(dispatch);
      if(!result||!result.attemptedAt||!Number.isFinite(Date.parse(result.attemptedAt))||!Array.isArray(result.evidenceSeeds))throw new Error("execution_adapter_invalid_result");
      await this.fabric.recordExecutionAttempt(ticketId,result.transport,`Adapter ${adapter.protocol} reported ${result.transport}.`,{externalRef:result.externalRef??null,evidenceSeeds:result.evidenceSeeds,metadata:result.metadata??{}});
      if(consumedMandateId&&this.controlPlane){
        const mandate=(await this.controlPlane.listMandates()).find(m=>m.id===consumedMandateId);
        if(!mandate)throw new Error("consumed_operation_mandate_missing");
        await this.controlPlane.recordAttempt({id:crypto.randomUUID(),version:1,mandateId:mandate.id,executionTicketId:dispatch.ticket.id,taskId:dispatch.proposal.taskId,intentId:dispatch.proposal.intentId,routeDigest:mandate.routeDigest,normalizedArgumentsDigest:mandate.normalizedArgumentsDigest,attemptedAt:result.attemptedAt,transportResultDigest:digest({transport:result.transport,externalRef:result.externalRef??null,evidenceSeeds:result.evidenceSeeds,metadata:result.metadata??{}}),transportAccepted:result.transport==="ACCEPTED",settlement:result.transport==="UNKNOWN"?"UNKNOWN":"PENDING"});
      }
      return{dispatch,result};
    }catch(err:any){
      await this.fabric.recordExecutionAttempt(ticketId,"UNKNOWN","Downstream adapter outcome is indeterminate; semantic effect quarantined pending reconciliation.",{errorName:String(err?.name??"Error"),errorMessage:String(err?.message??err).slice(0,1000)});
      if(consumedMandateId&&this.controlPlane){
        const mandate=(await this.controlPlane.listMandates()).find(m=>m.id===consumedMandateId);
        if(mandate){
          try{await this.controlPlane.recordAttempt({id:crypto.randomUUID(),version:1,mandateId:mandate.id,executionTicketId:dispatch.ticket.id,taskId:dispatch.proposal.taskId,intentId:dispatch.proposal.intentId,routeDigest:mandate.routeDigest,normalizedArgumentsDigest:mandate.normalizedArgumentsDigest,attemptedAt:new Date().toISOString(),transportResultDigest:digest({transport:"UNKNOWN",errorName:String(err?.name??"Error"),errorMessage:String(err?.message??err).slice(0,1000)}),transportAccepted:false,settlement:"UNKNOWN"})}catch{}
        }
      }
      throw new Error(`execution_adapter_outcome_unknown:${String(err?.message??err)}`);
    }
  }
}
