import {ActionManifestSchema} from "@cieav/contracts";
import {RecoveryActionBindingSchema,RecoveryActionEvaluateRequestSchema} from "@cieav/contracts/recovery";
import {assessConsequences,issueCommitPermit,proposalFromManifest} from "@cieav/core/reality";
import type {CieavRealityApi} from "./reality-api.js";

export class CieavRecoveryApi{
  constructor(private readonly reality:CieavRealityApi,private readonly permitSecret:string){}
  async evaluate(deviceId:string,raw:unknown){
    const input=RecoveryActionEvaluateRequestSchema.parse(raw),loop=await this.reality.store.getLoop(deviceId,input.openLoopId);
    if(!loop)throw new Error("recovery_open_loop_not_found");
    if(!["BREACHED","RECOVERING"].includes(loop.status))throw new Error("recovery_requires_breached_open_loop");
    if(!loop.recovery||loop.recovery.kind==="NONE")throw new Error("recovery_plan_unavailable");
    const intent=await this.reality.store.getIntent(deviceId,loop.intentId);if(!intent)throw new Error("recovery_intent_not_found");
    const manifest=ActionManifestSchema.parse(input.manifest),proposal=proposalFromManifest(intent.id,input.actor,manifest,input.delegationChain,input.amount);
    proposal.effect={...proposal.effect,metadata:{...proposal.effect.metadata,cieavRecoveryOpenLoopId:loop.id,cieavRecoveryKind:loop.recovery.kind}};
    const binding=RecoveryActionBindingSchema.parse({openLoopId:loop.id,recoveryKind:loop.recovery.kind,proposal,createdAt:new Date().toISOString()}),assessment=assessConsequences(proposal),evaluated=await this.reality.evaluateProposal(intent,proposal),permit=evaluated.authority.decision==="ALLOW"?issueCommitPermit(proposal,this.permitSecret,90):undefined,approval=evaluated.authority.decision==="ASK"?await this.reality.store.createApproval(deviceId,proposal):undefined;
    return{binding,loop,assessment,...evaluated,...(permit?{permit}:{}),...(approval?{approval}:{})};
  }
}
