import crypto from "node:crypto";
import type {ExecutionProposal,ExecutionTicket,FederatedTool} from "@cieav/contracts/execution-fabric";
import {digest} from "@cieav/core/execution-fabric";
import type {CieavExecutionFabricStore} from "./execution-fabric.js";
import type {CieavControlPlaneStore} from "./control-plane.js";
import type {CieavCredentialAuthority} from "./credential-authority.js";
import type {CieavContinuingAuthorityStore} from "./continuing-authority.js";
import type {CieavReflexLayer} from "./reflex-layer.js";
import {loadTrustedHttpFamilyAdaptersSync} from "./trusted-http-adapter.js";
import {loadTrustedOAuthHttpAdaptersSync} from "./trusted-oauth-http-adapter.js";
import {loadTrustedMcpStdioAdaptersSync} from "./trusted-mcp-adapter.js";
import {loadTrustedMcpHttpAdaptersSync} from "./trusted-mcp-http-adapter.js";
import {loadTrustedA2aTaskAdaptersSync} from "./trusted-a2a-adapter.js";

export type ToolProtocol=FederatedTool["protocol"];
export type AdapterEvidenceSeed={kind:string;source:string;summary:string;externalRef?:string};
export type AdapterExecutionResult={attemptedAt:string;transport:"ACCEPTED"|"REJECTED"|"UNKNOWN";externalRef?:string;evidenceSeeds:AdapterEvidenceSeed[];metadata?:Record<string,string|number|boolean|null>};
export type SafetyCheckpointInput={observations?:unknown[];budgetConsumption?:Array<{dimension:string;amount:number}>;reflexSignals?:unknown[]};
export type ContinuingSafetyContext={sessionId:string;reflexPolicyId?:string;checkpoint(input:SafetyCheckpointInput):Promise<void>};
export type TrustedDispatchContext={ticket:ExecutionTicket;proposal:ExecutionProposal;tool:FederatedTool;normalizedArguments:unknown;continuingSafety?:ContinuingSafetyContext};
export interface CieavExecutionAdapter{
  readonly protocol:ToolProtocol;
  readonly supportsContinuingAuthority?:boolean;
  /** Deterministic, side-effect-free adapter selection when multiple adapters share a protocol. */
  supports?(context:TrustedDispatchContext):boolean;
  /** Fail-closed readiness validation that runs before one-use authority is consumed. */
  preflight?(context:TrustedDispatchContext):Promise<void>|void;
  /** Required for CONTINUING tools. Must only observe current safety state and have no side effects. */
  collectInitialSafety?(context:TrustedDispatchContext):Promise<SafetyCheckpointInput>;
  /** CONTINUING adapters must call context.continuingSafety.checkpoint before subsequent consequential steps. */
  execute(context:TrustedDispatchContext):Promise<AdapterExecutionResult>;
}

export class CieavExecutionRouter{
  private readonly adapters=new Map<ToolProtocol,CieavExecutionAdapter[]>();
  constructor(
    private readonly fabric:CieavExecutionFabricStore,
    adapters:CieavExecutionAdapter[]=[],
    private readonly controlPlane?:CieavControlPlaneStore,
    private readonly credentialAuthority?:CieavCredentialAuthority,
    private readonly continuingAuthority?:CieavContinuingAuthorityStore,
    private readonly reflexLayer?:CieavReflexLayer
  ){
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
  private async prepareContinuingSafety(dispatch:TrustedDispatchContext,adapter:CieavExecutionAdapter):Promise<TrustedDispatchContext>{
    if(dispatch.tool.executionMode!=="CONTINUING")return dispatch;
    const requirement=dispatch.proposal.continuingAuthority;
    if(!requirement)throw new Error("continuing_authority_requirement_missing");
    if(!this.continuingAuthority)throw new Error("continuing_authority_runtime_unavailable");
    if(adapter.supportsContinuingAuthority!==true||!adapter.collectInitialSafety)throw new Error(`execution_adapter_lacks_continuing_authority:${adapter.protocol}`);
    if(dispatch.tool.requiredReflexPolicyId&&requirement.reflexPolicyId!==dispatch.tool.requiredReflexPolicyId)throw new Error("required_reflex_policy_mismatch");
    if(requirement.reflexPolicyId){
      if(!this.reflexLayer)throw new Error("reflex_layer_runtime_unavailable");
      const policies=await this.reflexLayer.listPolicies();
      if(!policies.some(p=>p.id===requirement.reflexPolicyId&&p.enabled))throw new Error("required_reflex_policy_not_active");
    }
    const expiresAt=new Date(Date.now()+requirement.ttlSeconds*1000).toISOString();
    const session=await this.continuingAuthority.create({subjectId:dispatch.proposal.subjectId,taskId:dispatch.proposal.taskId,proposalId:dispatch.proposal.id,realityBoundCommitId:dispatch.ticket.realityBoundCommitId,executionTicketId:dispatch.ticket.id,operation:dispatch.proposal.operation,normalizedArgumentsDigest:dispatch.proposal.normalizedArgumentsDigest,expiresAt,conditions:requirement.conditions,budgets:requirement.budgets});
    const checkpoint=async(input:SafetyCheckpointInput)=>{
      for(const observation of input.observations??[])await this.continuingAuthority!.recordObservation(session.id,observation);
      for(const item of input.budgetConsumption??[])await this.continuingAuthority!.consumeBudget(session.id,item.dimension,item.amount);
      if(requirement.reflexPolicyId){
        if(!this.reflexLayer)throw new Error("reflex_layer_runtime_unavailable");
        const decision=await this.reflexLayer.evaluate(requirement.reflexPolicyId,input.reflexSignals??[],session.id);
        if(decision.decision!=="CONTINUE")throw new Error(`reflex_${decision.decision.toLowerCase()}`);
      }else await this.continuingAuthority!.assertMayContinue(session.id);
    };
    const continuingSafety:ContinuingSafetyContext={sessionId:session.id,...(requirement.reflexPolicyId?{reflexPolicyId:requirement.reflexPolicyId}:{}),checkpoint};
    const runtimeContext={...dispatch,continuingSafety};
    try{
      const initial=await adapter.collectInitialSafety(runtimeContext);
      await checkpoint(initial);
      return runtimeContext;
    }catch(err:any){
      try{await this.continuingAuthority.revoke(session.id,`initial safety gate blocked: ${String(err?.message??err).slice(0,800)}`)}catch{}
      throw new Error(`continuing_authority_initial_gate_blocked:${String(err?.message??err)}`);
    }
  }
  async dispatch(ticketId:string,normalizedArguments:unknown):Promise<{dispatch:TrustedDispatchContext;result:AdapterExecutionResult}>{
    const inspected=await this.fabric.inspectTicket(ticketId),preflightContext:TrustedDispatchContext={...inspected,normalizedArguments};
    const adapter=this.selectAdapter(preflightContext);
    if(inspected.tool.executionMode==="CONTINUING"){
      if(!inspected.proposal.continuingAuthority)throw new Error("continuing_authority_requirement_missing");
      if(adapter.supportsContinuingAuthority!==true||!adapter.collectInitialSafety)throw new Error(`execution_adapter_lacks_continuing_authority:${adapter.protocol}`);
      if(inspected.tool.requiredReflexPolicyId&&inspected.proposal.continuingAuthority.reflexPolicyId!==inspected.tool.requiredReflexPolicyId)throw new Error("required_reflex_policy_mismatch");
    }
    await adapter.preflight?.(preflightContext);
    let consumedMandateId:string|undefined;
    if(this.controlPlane){const posture=await this.controlPlane.getPosture();if(posture.mode==="MANDATORY"){if(!posture.ready)throw new Error("mandatory_interposition_not_ready");const mandate=(await this.controlPlane.listMandates()).find(m=>m.proposalId===inspected.proposal.id&&m.status==="ISSUED");if(!mandate)throw new Error("operation_mandate_required_for_mandatory_dispatch");const consumed=await this.controlPlane.consumeMandate(mandate.id,inspected.proposal,normalizedArguments);consumedMandateId=consumed.id}}
    const consumed=await this.fabric.consumeTicket(ticketId,normalizedArguments);
    let dispatch:TrustedDispatchContext=consumed;
    if(consumed.tool.executionMode==="CONTINUING"){
      try{dispatch=await this.prepareContinuingSafety(consumed,adapter)}catch(err:any){await this.fabric.recordExecutionAttempt(ticketId,"REJECTED","Continuing-authority safety gate blocked before downstream execution.",{errorName:String(err?.name??"Error"),errorMessage:String(err?.message??err).slice(0,1000)});throw err}
    }
    try{
      const result=await adapter.execute(dispatch);
      if(!result||!result.attemptedAt||!Number.isFinite(Date.parse(result.attemptedAt))||!Array.isArray(result.evidenceSeeds))throw new Error("execution_adapter_invalid_result");
      if(dispatch.continuingSafety&&this.continuingAuthority){await this.continuingAuthority.assertMayContinue(dispatch.continuingSafety.sessionId);await this.continuingAuthority.complete(dispatch.continuingSafety.sessionId)}
      await this.fabric.recordExecutionAttempt(ticketId,result.transport,`Adapter ${adapter.protocol} reported ${result.transport}.`,{externalRef:result.externalRef??null,evidenceSeeds:result.evidenceSeeds,metadata:result.metadata??{},continuingAuthoritySessionId:dispatch.continuingSafety?.sessionId??null});
      if(consumedMandateId&&this.controlPlane){const mandate=(await this.controlPlane.listMandates()).find(m=>m.id===consumedMandateId);if(!mandate)throw new Error("consumed_operation_mandate_missing");await this.controlPlane.recordAttempt({id:crypto.randomUUID(),version:1,mandateId:mandate.id,executionTicketId:dispatch.ticket.id,taskId:dispatch.proposal.taskId,intentId:dispatch.proposal.intentId,routeDigest:mandate.routeDigest,normalizedArgumentsDigest:mandate.normalizedArgumentsDigest,attemptedAt:result.attemptedAt,transportResultDigest:digest({transport:result.transport,externalRef:result.externalRef??null,evidenceSeeds:result.evidenceSeeds,metadata:result.metadata??{},continuingAuthoritySessionId:dispatch.continuingSafety?.sessionId??null}),transportAccepted:result.transport==="ACCEPTED",settlement:result.transport==="UNKNOWN"?"UNKNOWN":"PENDING"})}
      return{dispatch,result};
    }catch(err:any){
      if(dispatch.continuingSafety&&this.continuingAuthority)try{await this.continuingAuthority.revoke(dispatch.continuingSafety.sessionId,`execution outcome unknown: ${String(err?.message??err).slice(0,800)}`)}catch{}
      await this.fabric.recordExecutionAttempt(ticketId,"UNKNOWN","Downstream adapter outcome is indeterminate; semantic effect quarantined pending reconciliation.",{errorName:String(err?.name??"Error"),errorMessage:String(err?.message??err).slice(0,1000),continuingAuthoritySessionId:dispatch.continuingSafety?.sessionId??null});
      if(consumedMandateId&&this.controlPlane){const mandate=(await this.controlPlane.listMandates()).find(m=>m.id===consumedMandateId);if(mandate)try{await this.controlPlane.recordAttempt({id:crypto.randomUUID(),version:1,mandateId:mandate.id,executionTicketId:dispatch.ticket.id,taskId:dispatch.proposal.taskId,intentId:dispatch.proposal.intentId,routeDigest:mandate.routeDigest,normalizedArgumentsDigest:mandate.normalizedArgumentsDigest,attemptedAt:new Date().toISOString(),transportResultDigest:digest({transport:"UNKNOWN",errorName:String(err?.name??"Error"),errorMessage:String(err?.message??err).slice(0,1000),continuingAuthoritySessionId:dispatch.continuingSafety?.sessionId??null}),transportAccepted:false,settlement:"UNKNOWN"})}catch{}}
      throw new Error(`execution_adapter_outcome_unknown:${String(err?.message??err)}`);
    }
  }
}
