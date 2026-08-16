import crypto from "node:crypto";
import {chmod,mkdir,readFile,rename,writeFile} from "node:fs/promises";
import path from "node:path";
import {AgentDispatchReceiptSchema,AgentRuntimePlanSchema,type AgentDispatchReceipt,type AgentPlanStep,type AgentRuntimePlan,type Commitment} from "@cieav/contracts";
import {bindStepCommitment,requireStepCommitment,transitionAgentStep} from "@cieav/core";

type Payload={version:1;plans:AgentRuntimePlan[];receipts:AgentDispatchReceipt[]};
type Envelope={payload:Payload;mac:string};
const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value as Record<string,unknown>).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(",")}}`:JSON.stringify(value);

export class CieavAgentRuntimeStore{
  private loaded=false;private plans=new Map<string,AgentRuntimePlan>();private receipts:AgentDispatchReceipt[]=[];private chain:Promise<void>=Promise.resolve();
  constructor(private readonly file:string,private readonly stateSecret:string){if(stateSecret.length<32)throw new Error("CIEAV agent-runtime state secret is too weak")}
  private mac(payload:Payload){return crypto.createHmac("sha256",this.stateSecret).update(canonical(payload)).digest("base64url")}
  private enqueue<T>(fn:()=>Promise<T>):Promise<T>{const task=this.chain.then(fn,fn);this.chain=task.then(()=>undefined,()=>undefined);return task}
  private async load(){if(this.loaded)return;await mkdir(path.dirname(this.file),{recursive:true,mode:0o700});try{const env=JSON.parse(await readFile(this.file,"utf8")) as Envelope;if(env?.payload?.version!==1||!Array.isArray(env.payload.plans)||!Array.isArray(env.payload.receipts)||typeof env.mac!=="string")throw new Error("invalid envelope");const expected=this.mac(env.payload);if(expected.length!==env.mac.length||!crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(env.mac)))throw new Error("integrity check failed");for(const raw of env.payload.plans){const plan=AgentRuntimePlanSchema.parse(raw);this.plans.set(plan.taskId,plan)}this.receipts=env.payload.receipts.map(x=>AgentDispatchReceiptSchema.parse(x))}catch(err:any){if(err?.code!=="ENOENT")throw new Error(`CIEAV agent-runtime store is unreadable, corrupt, or unauthenticated: ${String(err?.message??err)}`)}this.loaded=true}
  private async persist(){const plans=[...this.plans.values()].sort((a,b)=>b.plannedAt.localeCompare(a.plannedAt)).slice(0,10000),receipts=this.receipts.slice(-100000),payload:Payload={version:1,plans,receipts},env:Envelope={payload,mac:this.mac(payload)},tmp=`${this.file}.${process.pid}.${crypto.randomUUID()}.tmp`;await writeFile(tmp,JSON.stringify(env,null,2)+"\n",{encoding:"utf8",mode:0o600,flag:"wx"});await rename(tmp,this.file);try{await chmod(this.file,0o600)}catch{}this.plans=new Map(plans.map(p=>[p.taskId,p]));this.receipts=receipts}
  putPlan(raw:AgentRuntimePlan){return this.enqueue(async()=>{await this.load();const plan=AgentRuntimePlanSchema.parse(raw);this.plans.set(plan.taskId,plan);await this.persist();return plan})}
  getPlan(taskId:string){return this.enqueue(async()=>{await this.load();return this.plans.get(taskId)??null})}
  listPlans(){return this.enqueue(async()=>{await this.load();return[...this.plans.values()]})}
  listReceipts(taskId?:string){return this.enqueue(async()=>{await this.load();return this.receipts.filter(r=>!taskId||r.taskId===taskId)})}
  private updateStep(plan:AgentRuntimePlan,stepId:string,fn:(step:AgentPlanStep)=>AgentPlanStep){const steps=plan.steps.map(step=>step.id===stepId?fn(step):step);if(!steps.some(s=>s.id===stepId))throw new Error("agent_step_not_found");return AgentRuntimePlanSchema.parse({...plan,steps})}
  transitionStep(taskId:string,stepId:string,to:AgentPlanStep["state"]){return this.enqueue(async()=>{await this.load();const plan=this.plans.get(taskId);if(!plan)throw new Error("agent_plan_not_found");const next=this.updateStep(plan,stepId,step=>transitionAgentStep(step,to));this.plans.set(taskId,next);await this.persist();return next.steps.find(s=>s.id===stepId)!})}
  requireCommitment(taskId:string,stepId:string){return this.enqueue(async()=>{await this.load();const plan=this.plans.get(taskId);if(!plan)throw new Error("agent_plan_not_found");const next=this.updateStep(plan,stepId,requireStepCommitment);this.plans.set(taskId,next);await this.persist();return next.steps.find(s=>s.id===stepId)!})}
  bindCommitment(taskId:string,stepId:string,commitment:Pick<Commitment,"id"|"state">){return this.enqueue(async()=>{await this.load();const plan=this.plans.get(taskId);if(!plan)throw new Error("agent_plan_not_found");const next=this.updateStep(plan,stepId,step=>bindStepCommitment(step,commitment));this.plans.set(taskId,next);await this.persist();return next.steps.find(s=>s.id===stepId)!})}
  appendReceipt(raw:AgentDispatchReceipt){return this.enqueue(async()=>{await this.load();const receipt=AgentDispatchReceiptSchema.parse(raw);this.receipts.push(receipt);await this.persist();return receipt})}
  recoverInFlight(){return this.enqueue(async()=>{await this.load();const recovered:AgentPlanStep[]=[];for(const [taskId,plan] of this.plans){let changed=false;const steps=plan.steps.map(step=>{if(step.state!=="DISPATCHED")return step;changed=true;const next:AgentPlanStep={...step,state:"UNKNOWN",lastError:"runtime_restarted_after_dispatch_before_observation"};recovered.push(next);return next});if(changed)this.plans.set(taskId,AgentRuntimePlanSchema.parse({...plan,steps}))}if(recovered.length)await this.persist();return recovered})}
  async close(){await this.chain}
}
