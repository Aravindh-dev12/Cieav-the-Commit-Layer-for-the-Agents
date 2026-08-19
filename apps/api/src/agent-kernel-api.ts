import type {IncomingMessage} from "node:http";
import {AgentTaskStateSchema,CommitmentSchema} from "@cieav/contracts";
import {AutonomyCandidateCreateRequestSchema,EffectQuarantineReconcileRequestSchema,IntentRealityProfileSchema,RealityCommitConsumeRequestSchema} from "@cieav/contracts/intent-reality";
import {CieavPrincipalSchema} from "@cieav/contracts/reality";
import {createExpectedConsequence,createRealityStateWitness} from "@cieav/core/intent-reality";
import type {AgentTokenPayload} from "./auth.js";
import type {CieavProofApi} from "./proof-api.js";
import type {CieavRealityApi,RealityRouteResult} from "./reality-api.js";
import {CieavAgentKernelStore} from "./agent-kernel.js";

const MAX_BODY=256_000;
const riskRank:Record<string,number>={LOW:0,MEDIUM:1,HIGH:2,CRITICAL:3};
async function parseBody(req:IncomingMessage){const chunks:Buffer[]=[];let size=0;for await(const chunk of req){const b=Buffer.from(chunk);size+=b.length;if(size>MAX_BODY)throw new Error("body_too_large");chunks.push(b)}return chunks.length?JSON.parse(Buffer.concat(chunks).toString("utf8")):{} }
const owns=(task:{scopeDeviceId:string;sessionId?:string;intentId:string},identity:AgentTokenPayload)=>task.scopeDeviceId===identity.scopeDeviceId&&task.sessionId===identity.sessionId&&identity.allowedIntentIds.includes(task.intentId);
const principalMatches=(a:{id:string;kind:string},b:{id:string;kind:string})=>a.id===b.id&&a.kind===b.kind;

export class CieavAgentKernelApi{
  constructor(readonly store:CieavAgentKernelStore,private readonly reality:CieavRealityApi,private readonly proof:CieavProofApi){}
  async recoverOnStartup(){return this.store.recoverOnStartup()}

  async handleAgent(req:IncomingMessage,pathname:string,identity:AgentTokenPayload):Promise<RealityRouteResult|null>{
    if(req.method==="POST"&&pathname==="/v1/agent/tasks"){
      const raw=await parseBody(req);
      if(typeof raw?.intentId!=="string"||!identity.allowedIntentIds.includes(raw.intentId))return{status:403,body:{error:"agent_intent_not_allowed"}};
      if(raw?.actor?.kind!=="AGENT"||raw?.actor?.id!==identity.agentId)return{status:403,body:{error:"agent_identity_mismatch"}};
      const intent=await this.reality.store.getIntent(identity.scopeDeviceId,raw.intentId);if(!intent)return{status:404,body:{error:"intent_not_found"}};
      const created=await this.store.create({...raw,scopeDeviceId:identity.scopeDeviceId,sessionId:identity.sessionId,owner:intent.owner});return{status:201,body:created};
    }
    if(req.method==="GET"&&pathname==="/v1/agent/tasks"){
      const tasks=(await this.store.list()).filter(t=>owns(t,identity));return{status:200,body:{tasks}};
    }
    if(req.method==="GET"&&pathname==="/v1/agent/tasks/open-loops"){
      const allowed=new Set((await this.store.list()).filter(t=>owns(t,identity)).map(t=>t.id));
      return{status:200,body:{openLoops:(await this.store.openLoops()).filter(x=>allowed.has(x.taskId))}};
    }
    const taskMatch=pathname.match(/^\/v1\/agent\/tasks\/([0-9a-f-]+)$/i);
    if(req.method==="GET"&&taskMatch?.[1]){const task=await this.store.get(taskMatch[1]);if(!task)return{status:404,body:{error:"not_found"}};if(!owns(task,identity))return{status:403,body:{error:"agent_task_not_allowed"}};return{status:200,body:{task}}}
    const eventMatch=pathname.match(/^\/v1\/agent\/tasks\/([0-9a-f-]+)\/events$/i);
    if(req.method==="GET"&&eventMatch?.[1]){const task=await this.store.get(eventMatch[1]);if(!task)return{status:404,body:{error:"not_found"}};if(!owns(task,identity))return{status:403,body:{error:"agent_task_not_allowed"}};return{status:200,body:{events:await this.store.listEvents(task.id)}}}
    const transitionMatch=pathname.match(/^\/v1\/agent\/tasks\/([0-9a-f-]+)\/transition$/i);
    if(req.method==="POST"&&transitionMatch?.[1]){const task=await this.store.get(transitionMatch[1]);if(!task)return{status:404,body:{error:"not_found"}};if(!owns(task,identity))return{status:403,body:{error:"agent_task_not_allowed"}};const raw=await parseBody(req),parsed=AgentTaskStateSchema.safeParse(raw?.to);if(!parsed.success)return{status:400,body:{error:"invalid_agent_task_state"}};if(["COMPLETED","CANCELLED"].includes(parsed.data))return{status:403,body:{error:"trusted_authority_transition_required"}};if(parsed.data==="RUNNING"&&!task.authoritySatisfiedAt)return{status:409,body:{error:"agent_execution_requires_trusted_authority"}};if(parsed.data==="RUNNING"){const q=await this.store.intentReality.retryBlockForTask(task.id);if(q)return{status:409,body:{error:"effect_reconciliation_required",quarantine:q}}}return{status:200,body:await this.store.transition(task.id,parsed.data,String(raw?.reason??"agent transition"))}}
    const requireMatch=pathname.match(/^\/v1\/agent\/tasks\/([0-9a-f-]+)\/require-commitment$/i);
    if(req.method==="POST"&&requireMatch?.[1]){const task=await this.store.get(requireMatch[1]);if(!task)return{status:404,body:{error:"not_found"}};if(!owns(task,identity))return{status:403,body:{error:"agent_task_not_allowed"}};const raw=await parseBody(req);return{status:200,body:await this.store.requireCommitment(task.id,String(raw?.reason??"consequential work requires authority"))}}
    const retryMatch=pathname.match(/^\/v1\/agent\/tasks\/([0-9a-f-]+)\/retry$/i);
    if(req.method==="POST"&&retryMatch?.[1]){const task=await this.store.get(retryMatch[1]);if(!task)return{status:404,body:{error:"not_found"}};if(!owns(task,identity))return{status:403,body:{error:"agent_task_not_allowed"}};const quarantine=await this.store.intentReality.retryBlockForTask(task.id);if(quarantine)return{status:409,body:{error:"effect_reconciliation_required",quarantine}};const raw=await parseBody(req),nextRunAt=String(raw?.nextRunAt??"");if(!Number.isFinite(Date.parse(nextRunAt)))return{status:400,body:{error:"invalid_next_run_at"}};return{status:200,body:await this.store.retry(task.id,nextRunAt,String(raw?.reason??"agent retry"))}}

    const prepare=pathname.match(/^\/v1\/agent\/tasks\/([0-9a-f-]+)\/prepare-reality-commit$/i);
    if(req.method==="POST"&&prepare?.[1]){
      const task=await this.store.get(prepare[1]);if(!task)return{status:404,body:{error:"not_found"}};if(!owns(task,identity))return{status:403,body:{error:"agent_task_not_allowed"}};if(task.state!=="RUNNING"||!task.authoritySatisfiedAt)return{status:409,body:{error:"task_must_be_authorized_and_running"}};
      const raw=await parseBody(req),proposal=raw?.proposal;if(proposal?.intentId!==task.intentId||proposal?.actor?.kind!=="AGENT"||proposal?.actor?.id!==identity.agentId)return{status:403,body:{error:"proposal_identity_or_intent_mismatch"}};
      if(identity.allowedActionTypes.length&&!identity.allowedActionTypes.includes(String(proposal?.actionType??"")))return{status:403,body:{error:"agent_action_type_not_allowed"}};
      if(riskRank[String(proposal?.risk??"")]===undefined||riskRank[String(proposal.risk)]>riskRank[identity.maxRisk])return{status:403,body:{error:"agent_risk_scope_exceeded"}};
      const intent=await this.reality.store.getIntent(task.scopeDeviceId,task.intentId);if(!intent)return{status:404,body:{error:"intent_not_found"}};const evaluated=await this.reality.evaluateProposal(intent,proposal);if(evaluated.authority.decision==="BLOCK")return{status:409,body:{error:"proposal_outside_current_intent_authority",authority:evaluated.authority}};
      try{const witnessId=String(raw?.preStateWitnessId??""),preState=await this.store.intentReality.getStateWitness(task.scopeDeviceId,witnessId);if(!preState)return{status:409,body:{error:"trusted_pre_state_witness_required"}};const expected=raw?.expected?.consequenceHash?raw.expected:createExpectedConsequence({summary:String(raw?.expected?.summary??proposal.summary),effect:raw?.expected?.effect??proposal.effect,postconditions:raw?.expected?.postconditions??["Expected consequence must be independently verified."],proofKinds:raw?.expected?.proofKinds??["API_READBACK"]});return{status:201,body:await this.store.intentReality.prepareCommit(task.scopeDeviceId,task.id,intent,{proposal,preState,expected,...(raw?.attenuationWitnessId?{attenuationWitnessId:raw.attenuationWitnessId}:{}),driftDelta:raw?.driftDelta??0,driftBasis:raw?.driftBasis??[],ttlSeconds:raw?.ttlSeconds??30})}}catch(error:any){return{status:409,body:{error:String(error?.message??error)}}}
    }
    const consume=pathname.match(/^\/v1\/agent\/tasks\/([0-9a-f-]+)\/consume-reality-commit$/i);
    if(req.method==="POST"&&consume?.[1]){
      const task=await this.store.get(consume[1]);if(!task)return{status:404,body:{error:"not_found"}};if(!owns(task,identity))return{status:403,body:{error:"agent_task_not_allowed"}};if(task.state!=="RUNNING")return{status:409,body:{error:"task_not_running"}};
      const raw=await parseBody(req),witnessId=String(raw?.currentStateWitnessId??""),currentState=await this.store.intentReality.getStateWitness(task.scopeDeviceId,witnessId);if(!currentState)return{status:409,body:{error:"trusted_current_state_witness_required"}};const input=RealityCommitConsumeRequestSchema.parse({permit:raw?.permit,currentState});if(input.permit.taskId!==task.id||input.permit.intentId!==task.intentId||input.permit.subject.kind!=="AGENT"||input.permit.subject.id!==identity.agentId)return{status:403,body:{error:"reality_commit_scope_mismatch"}};
      const consumed=await this.store.intentReality.consumeCommit(task.scopeDeviceId,input.permit,input.currentState);if(!consumed.ok)return{status:409,body:{error:consumed.reason,record:consumed.record}};
      const observing=await this.store.transition(task.id,"OBSERVING","Reality-bound commit consumed; external consequence must now be independently proven.");return{status:200,body:{commit:consumed.record,...observing}};
    }
    return null;
  }

  async handleGateway(req:IncomingMessage,pathname:string):Promise<RealityRouteResult|null>{
    if(req.method==="GET"&&pathname==="/v1/agent-kernel/tasks")return{status:200,body:{tasks:await this.store.list(),openLoops:await this.store.openLoops()}};
    if(req.method==="GET"&&pathname==="/v1/agent-kernel/intent-reality/status"){
      const snapshot=await this.store.intentReality.snapshot();return{status:200,body:{ok:true,platform:process.platform,architecture:"intent-to-reality-v1",realityBoundCommit:true,semanticRetryQuarantine:true,attenuationWitnesses:true,consequenceDriftLedger:true,proofGatedSettlement:true,verifiedAutonomyRatchet:true,counts:{profiles:snapshot.profiles.length,witnesses:snapshot.witnesses.length,commits:snapshot.commits.length,openQuarantines:snapshot.quarantines.filter(q=>q.status==="OPEN").length,driftEntries:snapshot.drift.length,autonomyCandidates:snapshot.autonomy.length}}};
    }
    if(req.method==="GET"&&pathname==="/v1/agent-kernel/intent-reality")return{status:200,body:await this.store.intentReality.snapshot()};
    if(req.method==="PUT"&&pathname==="/v1/agent-kernel/intent-reality/profile"){
      const raw=await parseBody(req),scopeDeviceId=String(raw?.scopeDeviceId??""),profile=IntentRealityProfileSchema.parse(raw?.profile);if(scopeDeviceId.length<8)return{status:400,body:{error:"scope_device_id_required"}};return{status:200,body:{profile:await this.store.intentReality.putProfile(scopeDeviceId,profile)}};
    }
    if(req.method==="POST"&&pathname==="/v1/agent-kernel/intent-reality/state-witnesses"){
      const raw=await parseBody(req),scopeDeviceId=String(raw?.scopeDeviceId??"");if(scopeDeviceId.length<8)return{status:400,body:{error:"scope_device_id_required"}};const trust=raw?.trust==="TRUSTED_ADAPTER"?"TRUSTED_ADAPTER":raw?.trust==="HUMAN_ATTESTATION"?"HUMAN_ATTESTATION":"TRUSTED_LOCAL_OBSERVER";try{const witness=createRealityStateWitness(raw?.facts??{},String(raw?.source??"local-authority-observer"),new Date().toISOString(),trust,typeof raw?.observerId==="string"?raw.observerId:undefined);return{status:201,body:{witness:await this.store.intentReality.saveStateWitness(scopeDeviceId,witness)}}}catch(error:any){return{status:400,body:{error:String(error?.message??error)}}}
    }
    if(req.method==="POST"&&pathname==="/v1/agent-kernel/intent-reality/attenuation-witnesses"){
      const raw=await parseBody(req),scopeDeviceId=String(raw?.scopeDeviceId??"");if(scopeDeviceId.length<8)return{status:400,body:{error:"scope_device_id_required"}};try{return{status:201,body:{witness:await this.store.intentReality.createAttenuationWitness(scopeDeviceId,raw?.witness)}}}catch(error:any){return{status:409,body:{error:String(error?.message??error)}}}
    }
    const reconcile=pathname.match(/^\/v1\/agent-kernel\/intent-reality\/quarantines\/([0-9a-f-]+)\/reconcile$/i);
    if(req.method==="POST"&&reconcile?.[1]){
      const raw=await parseBody(req),scopeDeviceId=String(raw?.scopeDeviceId??""),input=EffectQuarantineReconcileRequestSchema.parse({resolution:raw?.resolution,...(raw?.proofCaseId?{proofCaseId:raw.proofCaseId}:{}),...(raw?.note?{note:raw.note}:{})});if(scopeDeviceId.length<8)return{status:400,body:{error:"scope_device_id_required"}};const value=await this.store.intentReality.reconcileQuarantine(scopeDeviceId,reconcile[1],input.resolution,input.proofCaseId,input.note);return value?{status:200,body:{quarantine:value}}:{status:404,body:{error:"not_found"}};
    }
    if(req.method==="POST"&&pathname==="/v1/agent-kernel/intent-reality/autonomy-candidates"){
      const raw=await parseBody(req),scopeDeviceId=String(raw?.scopeDeviceId??""),input=AutonomyCandidateCreateRequestSchema.parse(raw?.candidate);if(scopeDeviceId.length<8)return{status:400,body:{error:"scope_device_id_required"}};const intent=await this.reality.store.getIntent(scopeDeviceId,input.intentId);if(!intent)return{status:404,body:{error:"intent_not_found"}};
      try{const candidate=await this.store.intentReality.createAutonomyCandidate(scopeDeviceId,intent.id,intent.constraints,input.candidateConstraints,input.replay,input.reason);if(candidate.state==="AUTO_CONTRACTED")await this.reality.store.saveIntent(scopeDeviceId,{...intent,constraints:candidate.candidateConstraints});return{status:201,body:{candidate,applied:candidate.state==="AUTO_CONTRACTED"}}}catch(error:any){return{status:409,body:{error:String(error?.message??error)}}}
    }
    const autonomyDecision=pathname.match(/^\/v1\/agent-kernel\/intent-reality\/autonomy-candidates\/([0-9a-f-]+)\/(ratify|reject)$/i);
    if(req.method==="POST"&&autonomyDecision?.[1]&&autonomyDecision?.[2]){
      const raw=await parseBody(req),scopeDeviceId=String(raw?.scopeDeviceId??""),decidedBy=CieavPrincipalSchema.parse(raw?.decidedBy);if(scopeDeviceId.length<8)return{status:400,body:{error:"scope_device_id_required"}};const candidate=await this.store.intentReality.decideAutonomyCandidate(scopeDeviceId,autonomyDecision[1],autonomyDecision[2].toLowerCase()==="ratify"?"RATIFY":"REJECT",decidedBy);if(!candidate)return{status:404,body:{error:"not_found"}};if(candidate.state==="RATIFIED"){const intent=await this.reality.store.getIntent(scopeDeviceId,candidate.intentId);if(!intent)return{status:404,body:{error:"intent_not_found"}};await this.reality.store.saveIntent(scopeDeviceId,{...intent,constraints:candidate.candidateConstraints})}return{status:200,body:{candidate,applied:candidate.state==="RATIFIED"}};
    }

    const read=pathname.match(/^\/v1\/agent-kernel\/tasks\/([0-9a-f-]+)$/i);if(req.method==="GET"&&read?.[1]){const task=await this.store.get(read[1]);return task?{status:200,body:{task,events:await this.store.listEvents(task.id)}}:{status:404,body:{error:"not_found"}}}
    const cancel=pathname.match(/^\/v1\/agent-kernel\/tasks\/([0-9a-f-]+)\/cancel$/i);if(req.method==="POST"&&cancel?.[1]){const task=await this.store.get(cancel[1]);return task?{status:200,body:await this.store.transition(task.id,"CANCELLED","trusted local authority cancelled task")}:{status:404,body:{error:"not_found"}}}
    const bind=pathname.match(/^\/v1\/agent-kernel\/tasks\/([0-9a-f-]+)\/bind-commitment$/i);if(req.method==="POST"&&bind?.[1]){const raw=await parseBody(req),commitment=CommitmentSchema.parse(raw?.commitment);if(commitment.state!=="AUTHORIZED")return{status:409,body:{error:"commitment_not_authorized"}};const task=await this.store.get(bind[1]);if(!task)return{status:404,body:{error:"not_found"}};if(commitment.intentId!==task.intentId)return{status:409,body:{error:"commitment_intent_mismatch"}};if(!principalMatches(commitment.owner,task.owner))return{status:409,body:{error:"commitment_owner_mismatch"}};if(!principalMatches(commitment.actor,task.actor))return{status:409,body:{error:"commitment_actor_mismatch"}};return{status:200,body:await this.store.bindCommitmentTrusted(task.id,commitment)}}
    const settle=pathname.match(/^\/v1\/agent-kernel\/tasks\/([0-9a-f-]+)\/settle$/i);if(req.method==="POST"&&settle?.[1]){const raw=await parseBody(req),task=await this.store.get(settle[1]);if(!task)return{status:404,body:{error:"not_found"}};const proofId=String(raw?.proofCaseId??""),proof=await this.proof.store.get(task.scopeDeviceId,proofId);if(!proof)return{status:404,body:{error:"proof_not_found"}};if(proof.intentId!==task.intentId)return{status:409,body:{error:"proof_intent_mismatch"}};if(task.state!=="OBSERVING")return{status:409,body:{error:"task_not_observing"}};if(!task.proofCaseId)await this.store.bindProofTrusted(task.id,proof.id);else if(task.proofCaseId!==proof.id)return{status:409,body:{error:"different_proof_already_bound"}};const status=proof.assessment.status==="PROVEN"?"PROVEN":proof.assessment.status==="CONTRADICTED"||proof.assessment.status==="FAILED"?"DISPROVEN":"UNKNOWN";const settled=await this.store.settleTrusted(task.id,status),quarantine=await this.store.intentReality.settleTask(task.scopeDeviceId,task.id,status,proof.id);return{status:200,body:{...settled,...(quarantine?{quarantine}:{})}}}
    return null;
  }
}
