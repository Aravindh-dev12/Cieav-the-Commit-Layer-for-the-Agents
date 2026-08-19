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
 * It consumes the ticket with the exact normalized arguments before selecting an adapter.
 * Adapters receive an already-consumed ticket and cannot ask the model for alternate arguments.
 */
export class CieavExecutionRouter{
  private readonly adapters=new Map<ToolProtocol,CieavExecutionAdapter>();
  constructor(private readonly fabric:CieavExecutionFabricStore,adapters:CieavExecutionAdapter[]=[]){for(const adapter of adapters)this.register(adapter)}
  register(adapter:CieavExecutionAdapter){if(this.adapters.has(adapter.protocol))throw new Error(`execution_adapter_already_registered:${adapter.protocol}`);this.adapters.set(adapter.protocol,adapter)}
  async dispatch(ticketId:string,normalizedArguments:unknown):Promise<{dispatch:TrustedDispatchContext;result:AdapterExecutionResult}>{
    const dispatch=await this.fabric.consumeTicket(ticketId,normalizedArguments);
    const adapter=this.adapters.get(dispatch.tool.protocol);
    if(!adapter)throw new Error(`execution_adapter_unavailable:${dispatch.tool.protocol}`);
    const result=await adapter.execute(dispatch);
    if(!result||!result.attemptedAt||!Number.isFinite(Date.parse(result.attemptedAt))||!Array.isArray(result.evidenceSeeds))throw new Error("execution_adapter_invalid_result");
    return{dispatch,result};
  }
}
