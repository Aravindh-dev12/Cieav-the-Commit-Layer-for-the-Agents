import type {IncomingMessage} from "node:http";
import {AgentTaskStateSchema,CommitmentSchema} from "@cieav/contracts";
import type {AgentTokenPayload} from "./auth.js";
import type {CieavProofApi} from "./proof-api.js";
import type {CieavRealityApi,RealityRouteResult} from "./reality-api.js";
import {CieavAgentKernelStore} from "./agent-kernel.js";

const MAX_BODY=256_000;
async function parseBody(req:IncomingMessage){const chunks:Buffer[]=[];let size=0;for await(const chunk of req){const b=Buffer.from(chunk);size+=b.length;if(size>MAX_BODY)throw new Error("body_too_large");chunks.push(b)}return chunks.length?JSON.parse(Buffer.concat(chunks).toString("utf8")):{} }
const owns=(task:{scopeDeviceId:string;sessionId?:string;intentId:string},identity:AgentTokenPayload)=>task.scopeDeviceId===identity.scopeDeviceId&&task.sessionId===identity.sessionId&&identity.allowedIntentIds.includes(task.intentId);

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
    if(req.method==="POST"&&transitionMatch?.[1]){const task=await this.store.get(transitionMatch[1]);if(!task)return{status:404,body:{error:"not_found"}};if(!owns(task,identity))return{status:403,body:{error:"agent_task_not_allowed"}};const raw=await parseBody(req),parsed=AgentTaskStateSchema.safeParse(raw?.to);if(!parsed.success)return{status:400,body:{error:"invalid_agent_task_state"}};if(["COMPLETED","CANCELLED"].includes(parsed.data))return{status:403,body:{error:"trusted_authority_transition_required"}};return{status:200,body:await this.store.transition(task.id,parsed.data,String(raw?.reason??"agent transition"))}}
    const requireMatch=pathname.match(/^\/v1\/agent\/tasks\/([0-9a-f-]+)\/require-commitment$/i);
    if(req.method==="POST"&&requireMatch?.[1]){const task=await this.store.get(requireMatch[1]);if(!task)return{status:404,body:{error:"not_found"}};if(!owns(task,identity))return{status:403,body:{error:"agent_task_not_allowed"}};const raw=await parseBody(req);return{status:200,body:await this.store.requireCommitment(task.id,String(raw?.reason??"consequential work requires authority"))}}
    const retryMatch=pathname.match(/^\/v1\/agent\/tasks\/([0-9a-f-]+)\/retry$/i);
    if(req.method==="POST"&&retryMatch?.[1]){const task=await this.store.get(retryMatch[1]);if(!task)return{status:404,body:{error:"not_found"}};if(!owns(task,identity))return{status:403,body:{error:"agent_task_not_allowed"}};const raw=await parseBody(req),nextRunAt=String(raw?.nextRunAt??"");if(!Number.isFinite(Date.parse(nextRunAt)))return{status:400,body:{error:"invalid_next_run_at"}};return{status:200,body:await this.store.retry(task.id,nextRunAt,String(raw?.reason??"agent retry"))}}
    return null;
  }

  async handleGateway(req:IncomingMessage,pathname:string):Promise<RealityRouteResult|null>{
    if(req.method==="GET"&&pathname==="/v1/agent-kernel/tasks")return{status:200,body:{tasks:await this.store.list(),openLoops:await this.store.openLoops()}};
    const read=pathname.match(/^\/v1\/agent-kernel\/tasks\/([0-9a-f-]+)$/i);if(req.method==="GET"&&read?.[1]){const task=await this.store.get(read[1]);return task?{status:200,body:{task,events:await this.store.listEvents(task.id)}}:{status:404,body:{error:"not_found"}}}
    const cancel=pathname.match(/^\/v1\/agent-kernel\/tasks\/([0-9a-f-]+)\/cancel$/i);if(req.method==="POST"&&cancel?.[1])return{status:200,body:await this.store.transition(cancel[1],"CANCELLED","trusted local authority cancelled task")};
    const bind=pathname.match(/^\/v1\/agent-kernel\/tasks\/([0-9a-f-]+)\/bind-commitment$/i);if(req.method==="POST"&&bind?.[1]){const raw=await parseBody(req),commitment=CommitmentSchema.parse(raw?.commitment);if(commitment.state!=="AUTHORIZED")return{status:409,body:{error:"commitment_not_authorized"}};const task=await this.store.get(bind[1]);if(!task)return{status:404,body:{error:"not_found"}};if(commitment.intentId!==task.intentId)return{status:409,body:{error:"commitment_intent_mismatch"}};return{status:200,body:await this.store.bindCommitmentTrusted(task.id,commitment)}}
    const settle=pathname.match(/^\/v1\/agent-kernel\/tasks\/([0-9a-f-]+)\/settle$/i);if(req.method==="POST"&&settle?.[1]){const raw=await parseBody(req),task=await this.store.get(settle[1]);if(!task)return{status:404,body:{error:"not_found"}};const proofId=String(raw?.proofCaseId??""),proof=await this.proof.store.get(task.scopeDeviceId,proofId);if(!proof)return{status:404,body:{error:"proof_not_found"}};if(proof.intentId!==task.intentId)return{status:409,body:{error:"proof_intent_mismatch"}};if(task.state!=="OBSERVING")return{status:409,body:{error:"task_not_observing"}};if(!task.proofCaseId)await this.store.bindProofTrusted(task.id,proof.id);else if(task.proofCaseId!==proof.id)return{status:409,body:{error:"different_proof_already_bound"}};const status=proof.assessment.status==="PROVEN"?"PROVEN":proof.assessment.status==="CONTRADICTED"||proof.assessment.status==="FAILED"?"DISPROVEN":"UNKNOWN";return{status:200,body:await this.store.settleTrusted(task.id,status)}}
    return null;
  }
}
