import crypto from "node:crypto";
import {chmod,mkdir,open,readFile,rename,writeFile} from "node:fs/promises";
import path from "node:path";
import {AgentTaskCreateSchema,AgentTaskEventSchema,AgentTaskSchema,type AgentOpenLoop,type AgentTask,type AgentTaskCreate,type AgentTaskEvent,type AgentTaskState,type Commitment} from "@cieav/contracts";
import {bindRealityCommit,bindTaskCommitment,bindTaskProof,clearTaskEffectQuarantine,consumeTaskRealityCommit,detectAgentOpenLoop,markTaskEffectQuarantined,recoverInterruptedTask,requireCommitment,scheduleRetry,settleAgentTask,transitionAgentTask} from "@cieav/core";
import {CieavIntentRealityEngine} from "./intent-reality-engine.js";
import {CieavExecutionFabricStore} from "./execution-fabric.js";
import {CieavControlPlaneStore} from "./control-plane.js";
import {CieavFrameworkInteropStore} from "./framework-interop.js";
import {CieavCredentialAuthority} from "./credential-authority.js";
import {CieavHardwareKeyProviderRegistry} from "./hardware-key-provider.js";
import {CieavHardwareSigner} from "./hardware-signer.js";
import {CieavExecutionRouter} from "./execution-router.js";

type Payload={version:1;tasks:AgentTask[];events:AgentTaskEvent[]};
type Envelope={payload:Payload;mac:string};
const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value as Record<string,unknown>).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(",")}}`:JSON.stringify(value);

async function durableReplace(file:string,contents:string){
  const dir=path.dirname(file),tmp=`${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await writeFile(tmp,contents,{encoding:"utf8",mode:0o600,flag:"wx"});
  const fh=await open(tmp,"r+");try{await fh.sync()}finally{await fh.close()}
  await rename(tmp,file);try{await chmod(file,0o600)}catch{}
  if(process.platform!=="win32")try{const dh=await open(dir,"r");try{await dh.sync()}finally{await dh.close()}}catch{}
}

export class CieavAgentKernelStore{
  private loaded=false;private tasks=new Map<string,AgentTask>();private events:AgentTaskEvent[]=[];private chain:Promise<void>=Promise.resolve();
  readonly intentReality:CieavIntentRealityEngine;
  readonly executionFabric:CieavExecutionFabricStore;
  readonly controlPlane:CieavControlPlaneStore;
  readonly frameworkInterop:CieavFrameworkInteropStore;
  readonly credentialAuthority:CieavCredentialAuthority;
  readonly hardwareKeyProviders:CieavHardwareKeyProviderRegistry;
  readonly hardwareSigner:CieavHardwareSigner;
  readonly executionRouter:CieavExecutionRouter;
  constructor(private readonly file:string,private readonly stateSecret:string){
    if(stateSecret.length<32)throw new Error("CIEAV agent-kernel state secret is too weak");
    const intentRealitySecret=crypto.createHmac("sha256",stateSecret).update("cieav-intent-reality-state-v1").digest("base64url");
    const executionFabricSecret=crypto.createHmac("sha256",stateSecret).update("cieav-execution-fabric-state-v1").digest("base64url");
    const controlPlaneSecret=crypto.createHmac("sha256",stateSecret).update("cieav-control-plane-state-v1").digest("base64url");
    const frameworkInteropSecret=crypto.createHmac("sha256",stateSecret).update("cieav-framework-interop-state-v1").digest("base64url");
    const credentialAuthoritySecret=crypto.createHmac("sha256",stateSecret).update("cieav-credential-authority-state-v1").digest("base64url");
    const hardwareProviderSecret=crypto.createHmac("sha256",stateSecret).update("cieav-hardware-key-provider-state-v1").digest("base64url");
    this.intentReality=new CieavIntentRealityEngine(path.join(path.dirname(file),"intent-reality-state.json"),intentRealitySecret);
    this.executionFabric=new CieavExecutionFabricStore(path.join(path.dirname(file),"execution-fabric-state.json"),executionFabricSecret,this);
    this.controlPlane=new CieavControlPlaneStore(path.join(path.dirname(file),"control-plane-state.json"),controlPlaneSecret,this,this.executionFabric);
    this.frameworkInterop=new CieavFrameworkInteropStore(path.join(path.dirname(file),"framework-interop-state.json"),frameworkInteropSecret,this);
    this.hardwareKeyProviders=new CieavHardwareKeyProviderRegistry(path.join(path.dirname(file),"hardware-key-providers.json"),hardwareProviderSecret);
    this.hardwareSigner=new CieavHardwareSigner(this.hardwareKeyProviders);
    this.credentialAuthority=new CieavCredentialAuthority(path.join(path.dirname(file),"credential-authority-state.json"),credentialAuthoritySecret,process.env,this.hardwareSigner);
    this.executionRouter=new CieavExecutionRouter(this.executionFabric,[],this.controlPlane,this.credentialAuthority);
  }
  private mac(payload:Payload){return crypto.createHmac("sha256",this.stateSecret).update(canonical(payload)).digest("base64url")}
  private enqueue<T>(fn:()=>Promise<T>):Promise<T>{const task=this.chain.then(fn,fn);this.chain=task.then(()=>undefined,()=>undefined);return task}
  private async load(){
    if(this.loaded)return;
    await mkdir(path.dirname(this.file),{recursive:true,mode:0o700});
    try{
      const env=JSON.parse(await readFile(this.file,"utf8")) as Envelope;
      if(env?.payload?.version!==1||!Array.isArray(env.payload.tasks)||!Array.isArray(env.payload.events)||typeof env.mac!=="string")throw new Error("invalid envelope");
      const expected=this.mac(env.payload);
      if(expected.length!==env.mac.length||!crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(env.mac)))throw new Error("integrity check failed");
      for(const raw of env.payload.tasks){const parsed=AgentTaskSchema.parse(raw);this.tasks.set(parsed.id,parsed)}
      this.events=env.payload.events.map(e=>AgentTaskEventSchema.parse(e)).sort((a,b)=>a.sequence-b.sequence);
    }catch(err:any){if(err?.code!=="ENOENT")throw new Error(`CIEAV agent-kernel store is unreadable, corrupt, or unauthenticated: ${String(err?.message??err)}`)}
    this.loaded=true;
  }
  private async persist(){const tasks=[...this.tasks.values()].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,10000),events=this.events.slice(-100000),payload:Payload={version:1,tasks,events},env:Envelope={payload,mac:this.mac(payload)};await durableReplace(this.file,JSON.stringify(env,null,2)+"\n");this.tasks=new Map(tasks.map(x=>[x.id,x]));this.events=events}
  private append(raw:Omit<AgentTaskEvent,"id"|"sequence">){const sequence=(this.events.at(-1)?.sequence??0)+1,event=AgentTaskEventSchema.parse({...raw,id:crypto.randomUUID(),sequence});this.events.push(event);return event}
  private put(task:AgentTask){const parsed=AgentTaskSchema.parse(task);this.tasks.set(parsed.id,parsed);return parsed}

  create(raw:unknown){return this.enqueue(async()=>{await this.load();const input:AgentTaskCreate=AgentTaskCreateSchema.parse(raw),at=new Date().toISOString(),task:AgentTask=AgentTaskSchema.parse({id:crypto.randomUUID(),version:1,...input,state:"CREATED",createdAt:at,updatedAt:at,retryCount:0,commitmentRequired:false,effectQuarantined:false,openLoop:false});this.tasks.set(task.id,task);const event=this.append({taskId:task.id,type:"TASK_CREATED",at,fromState:"CREATED",toState:"CREATED",reason:"Agent task created.",data:{}});await this.persist();return{task,event}})}
  get(id:string){return this.enqueue(async()=>{await this.load();return this.tasks.get(id)??null})}
  list(){return this.enqueue(async()=>{await this.load();return[...this.tasks.values()].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))})}
  listEvents(taskId?:string){return this.enqueue(async()=>{await this.load();return this.events.filter(e=>!taskId||e.taskId===taskId)})}
  transition(id:string,to:AgentTaskState,reason="state transition"){return this.enqueue(async()=>{await this.load();const current=this.tasks.get(id);if(!current)throw new Error("agent_task_not_found");const changed=transitionAgentTask(current,to,new Date().toISOString(),reason),task=this.put(changed.task),event=this.append(changed.event);await this.persist();return{task,event}})}
  requireCommitment(id:string,reason?:string){return this.enqueue(async()=>{await this.load();const current=this.tasks.get(id);if(!current)throw new Error("agent_task_not_found");const changed=requireCommitment(current,new Date().toISOString(),reason),task=this.put(changed.task),event=this.append(changed.event);await this.persist();return{task,event}})}
  bindCommitmentTrusted(id:string,commitment:Pick<Commitment,"id"|"state">){return this.enqueue(async()=>{await this.load();const current=this.tasks.get(id);if(!current)throw new Error("agent_task_not_found");const changed=bindTaskCommitment(current,commitment,new Date().toISOString()),task=this.put(changed.task),event=this.append(changed.event);await this.persist();return{task,event}})}
  bindRealityCommitTrusted(id:string,realityBoundCommitId:string,effectKey:string){return this.enqueue(async()=>{await this.load();const current=this.tasks.get(id);if(!current)throw new Error("agent_task_not_found");const changed=bindRealityCommit(current,realityBoundCommitId,effectKey,new Date().toISOString()),task=this.put(changed.task),event=this.append(changed.event);await this.persist();return{task,event}})}
  consumeRealityCommitTrusted(id:string,realityBoundCommitId:string){return this.enqueue(async()=>{await this.load();const current=this.tasks.get(id);if(!current)throw new Error("agent_task_not_found");const changed=consumeTaskRealityCommit(current,realityBoundCommitId,new Date().toISOString()),task=this.put(changed.task),event=this.append(changed.event);await this.persist();return{task,event}})}
  quarantineEffectTrusted(id:string,quarantineId:string){return this.enqueue(async()=>{await this.load();const current=this.tasks.get(id);if(!current)throw new Error("agent_task_not_found");const changed=markTaskEffectQuarantined(current,quarantineId,new Date().toISOString()),task=this.put(changed.task),event=this.append(changed.event);await this.persist();return{task,event}})}
  clearEffectQuarantineTrusted(effectKey:string,quarantineId:string){return this.enqueue(async()=>{await this.load();const changed:AgentTask[]=[];for(const current of this.tasks.values()){if(current.effectKey!==effectKey||!current.effectQuarantined)continue;const result=clearTaskEffectQuarantine(current,quarantineId,new Date().toISOString());changed.push(this.put(result.task));this.append(result.event)}if(changed.length)await this.persist();return changed})}
  bindProofTrusted(id:string,proofCaseId:string){return this.enqueue(async()=>{await this.load();const current=this.tasks.get(id);if(!current)throw new Error("agent_task_not_found");const changed=bindTaskProof(current,proofCaseId,new Date().toISOString()),task=this.put(changed.task),event=this.append(changed.event);await this.persist();return{task,event}})}
  settleTrusted(id:string,status:"PROVEN"|"DISPROVEN"|"UNKNOWN"){return this.enqueue(async()=>{await this.load();const current=this.tasks.get(id);if(!current)throw new Error("agent_task_not_found");const changed=settleAgentTask(current,status,new Date().toISOString()),task=this.put(changed.task),event=this.append(changed.event);await this.persist();return{task,event}})}
  retry(id:string,nextRunAt:string,reason?:string){return this.enqueue(async()=>{await this.load();const current=this.tasks.get(id);if(!current)throw new Error("agent_task_not_found");if(current.effectKey)await this.intentReality.assertRetryAllowed(current.effectKey);const changed=scheduleRetry(current,nextRunAt,new Date().toISOString(),reason),task=this.put(changed.task),event=this.append(changed.event);await this.persist();return{task,event}})}
  recoverOnStartup(){return this.enqueue(async()=>{await this.load();const recovered:AgentTask[]=[];for(const current of [...this.tasks.values()]){const changed=recoverInterruptedTask(current);if(!changed)continue;const task=this.put(changed.task);this.append(changed.event);recovered.push(task)}if(recovered.length)await this.persist();return recovered})}
  openLoops(now=new Date()):Promise<AgentOpenLoop[]>{return this.enqueue(async()=>{await this.load();return[...this.tasks.values()].map(t=>detectAgentOpenLoop(t,now)).filter((x):x is AgentOpenLoop=>Boolean(x))})}
  async close(){await this.chain;await this.intentReality.close();await this.executionFabric.close();await this.controlPlane.close();await this.frameworkInterop.close();await this.credentialAuthority.close();await this.hardwareKeyProviders.close()}
}
