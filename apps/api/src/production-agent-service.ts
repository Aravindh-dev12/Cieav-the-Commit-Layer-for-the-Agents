import path from "node:path";
import type {ToolCatalog} from "@cieav/contracts";
import {buildToolCommitment} from "@cieav/core";
import {CieavAgentKernelStore} from "./agent-kernel.js";
import {createModelFabricPlanner} from "./agent-runtime-planner.js";
import {CieavAgentRuntimeStore} from "./agent-runtime-store.js";
import {CieavAgentRuntime} from "./agent-runtime.js";
import {CieavAgentScheduler} from "./agent-scheduler.js";
import {createGovernedToolStepDispatcher} from "./agent-tool-dispatch.js";
import {CieavCommitmentStore} from "./commitment-store.js";
import {CieavEffectAuthority} from "./effect-authority.js";
import {CieavEffectDispatchStore} from "./effect-dispatch-store.js";
import {CieavEffectDispatcher} from "./effect-dispatch.js";
import {CieavEffectNodeRegistry} from "./effect-node-registry.js";
import {CieavRemoteEffectNodeAdapter} from "./effect-node-remote.js";
import {CieavLocalRealityObserver} from "./effect-observers.js";
import {createOpenAIPlanningClient} from "./model/plan-client.js";
import {CieavToolBroker} from "./tool-broker.js";

export interface ProductionAgentServiceOptions {stateDir:string;stateSecret:string;modelBaseUrl:string;model:string;modelApiKey?:string;modelTimeoutMs:number;effectNodes:CieavEffectNodeRegistry;transportTokenForNode:(nodeId:string)=>string|Promise<string>;effectAuthority:CieavEffectAuthority}

export class CieavProductionAgentService{
  readonly tasks:CieavAgentKernelStore;readonly plans:CieavAgentRuntimeStore;readonly commitments:CieavCommitmentStore;readonly tools:CieavToolBroker;readonly effectStore:CieavEffectDispatchStore;readonly effects:CieavEffectDispatcher;readonly runtime:CieavAgentRuntime;readonly scheduler:CieavAgentScheduler;
  private constructor(private readonly options:ProductionAgentServiceOptions,parts:{tasks:CieavAgentKernelStore;plans:CieavAgentRuntimeStore;commitments:CieavCommitmentStore;tools:CieavToolBroker;effectStore:CieavEffectDispatchStore;effects:CieavEffectDispatcher;runtime:CieavAgentRuntime;scheduler:CieavAgentScheduler}){this.tasks=parts.tasks;this.plans=parts.plans;this.commitments=parts.commitments;this.tools=parts.tools;this.effectStore=parts.effectStore;this.effects=parts.effects;this.runtime=parts.runtime;this.scheduler=parts.scheduler}
  static async create(options:ProductionAgentServiceOptions){
    const tasks=new CieavAgentKernelStore(path.join(options.stateDir,"agent-tasks.json"),options.stateSecret),plans=new CieavAgentRuntimeStore(path.join(options.stateDir,"agent-runtime.json"),options.stateSecret),commitments=new CieavCommitmentStore(path.join(options.stateDir,"commitments.json"),options.stateSecret),tools=new CieavToolBroker(options.effectNodes),effectStore=new CieavEffectDispatchStore(path.join(options.stateDir,"effect-dispatch.json"),options.stateSecret),authority=await options.effectAuthority.publicIdentity(),effects=new CieavEffectDispatcher(effectStore,{EFFECT_NODE:new CieavRemoteEffectNodeAdapter(options.transportTokenForNode)},[new CieavLocalRealityObserver()],authority.publicKeyPem);
    const catalog=()=>tools.catalog({allowExternalEffects:true,allowCommitmentRequired:true,maximumTools:200}),planner=createModelFabricPlanner(createOpenAIPlanningClient({baseUrl:options.modelBaseUrl,model:options.model,...(options.modelApiKey?{apiKey:options.modelApiKey}:{}),timeoutMs:options.modelTimeoutMs,provider:"cieav-openai-compatible"}));
    const toolDispatcher=createGovernedToolStepDispatcher({catalog,commitment:id=>commitments.get(id),commitments,authority:options.effectAuthority,effects});
    const runtime=new CieavAgentRuntime(tasks,plans,planner,{TOOL:toolDispatcher},catalog,{async propose({task,step}){if(step.kind!=="TOOL")return;const existing=await commitments.findForTaskStep(task.id,step.id);if(existing)return;const current=await catalog(),toolId=typeof step.metadata.toolId==="string"?step.metadata.toolId:"",tool=current.tools.find(t=>t.id===toolId);if(!tool)throw new Error("governed tool is unavailable while creating commitment");await commitments.create(buildToolCommitment(task,step,tool))}});
    const scheduler=new CieavAgentScheduler(runtime,{intervalMs:1000,jitterMs:100,maxTasksPerTick:16,onError:error=>console.error("CIEAV agent scheduler error",error instanceof Error?error.message:String(error))}),service=new CieavProductionAgentService(options,{tasks,plans,commitments,tools,effectStore,effects,runtime,scheduler});await effects.recoverOnStartup();await scheduler.start();return service;
  }
  modelStatus(){let provider="openai-compatible";try{const host=new URL(this.options.modelBaseUrl).hostname.toLowerCase();if(host==="router.huggingface.co")provider="huggingface-inference-providers";else if(host==="127.0.0.1"||host==="localhost"||host==="::1")provider="local-openai-compatible"}catch{}return{provider,model:this.options.model,executionAuthority:false,apiKeyExposed:false}}
  async submit(raw:unknown){const created=await this.tasks.create(raw),queued=await this.tasks.transition(created.task.id,"QUEUED","Task submitted to the managed CIEAV Agent Runtime.");return queued.task}
  async catalog():Promise<ToolCatalog>{return this.tools.catalog({allowExternalEffects:true,allowCommitmentRequired:true,maximumTools:200})}
  async authorize(commitmentId:string){const commitment=await this.commitments.authorize(commitmentId),taskId=String(commitment.metadata.taskId??""),stepId=String(commitment.metadata.stepId??"");if(!taskId||!stepId)throw new Error("commitment_missing_task_binding");await this.runtime.bindCommitment(taskId,stepId,commitment);return commitment}
  async cancelCommitment(commitmentId:string){const commitment=await this.commitments.cancel(commitmentId),taskId=String(commitment.metadata.taskId??""),stepId=String(commitment.metadata.stepId??"");if(taskId&&stepId){const task=await this.tasks.get(taskId),plan=await this.plans.getPlan(taskId),step=plan?.steps.find(s=>s.id===stepId);if(step&&step.state==="WAITING_FOR_AUTHORITY")await this.plans.transitionStep(taskId,stepId,"CANCELLED");if(task&&task.state==="WAITING_FOR_AUTHORITY")await this.tasks.transition(taskId,"CANCELLED","Operator cancelled the proposed Commitment.")}return commitment}
  async task(id:string){return this.tasks.get(id)}async listTasks(){return this.tasks.list()}async listCommitments(){return this.commitments.list()}snapshot(){return this.scheduler.snapshot()}
  async close(){await this.scheduler.stop();await Promise.all([this.tasks.close(),this.plans.close(),this.commitments.close(),this.effectStore.close()])}
}
