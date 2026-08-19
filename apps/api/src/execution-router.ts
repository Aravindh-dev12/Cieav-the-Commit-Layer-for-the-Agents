import type {ExecutionProposal,ExecutionTicket,FederatedTool} from "@cieav/contracts/execution-fabric";
import type {CieavExecutionFabricStore} from "./execution-fabric.js";

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
  execute(context:TrustedDispatchContext):Promise<AdapterExecutionResult>;
}

/**
 * The router is the only in-process path from an Execution Ticket to a downstream adapter.
 * It checks adapter availability before consuming authority, then consumes the ticket with the
 * exact normalized arguments. An indeterminate adapter outcome is quarantined immediately.
 */
export class CieavExecutionRouter{
  private readonly adapters=new Map<ToolProtocol,CieavExecutionAdapter>();
  constructor(private readonly fabric:CieavExecutionFabricStore,adapters:CieavExecutionAdapter[]=[]){for(const adapter of adapters)this.register(adapter)}
  register(adapter:CieavExecutionAdapter){if(this.adapters.has(adapter.protocol))throw new Error(`execution_adapter_already_registered:${adapter.protocol}`);this.adapters.set(adapter.protocol,adapter)}

  async dispatch(ticketId:string,normalizedArguments:unknown):Promise<{dispatch:TrustedDispatchContext;result:AdapterExecutionResult}>{
    const inspected=await this.fabric.inspectTicket(ticketId);
    const adapter=this.adapters.get(inspected.tool.protocol);
    if(!adapter)throw new Error(`execution_adapter_unavailable:${inspected.tool.protocol}`);
    const dispatch=await this.fabric.consumeTicket(ticketId,normalizedArguments);
    try{
      const result=await adapter.execute(dispatch);
      if(!result||!result.attemptedAt||!Number.isFinite(Date.parse(result.attemptedAt))||!Array.isArray(result.evidenceSeeds))throw new Error("execution_adapter_invalid_result");
      await this.fabric.recordExecutionAttempt(ticketId,result.transport,`Adapter ${adapter.protocol} reported ${result.transport}.`,{externalRef:result.externalRef??null,evidenceSeeds:result.evidenceSeeds,metadata:result.metadata??{}});
      return{dispatch,result};
    }catch(err:any){
      await this.fabric.recordExecutionAttempt(ticketId,"UNKNOWN","Downstream adapter outcome is indeterminate; semantic effect quarantined pending reconciliation.",{errorName:String(err?.name??"Error"),errorMessage:String(err?.message??err).slice(0,1000)});
      throw new Error(`execution_adapter_outcome_unknown:${String(err?.message??err)}`);
    }
  }
}
