import type {CieavAgentRuntime} from "./agent-runtime.js";

export interface AgentSchedulerOptions {intervalMs?:number;jitterMs?:number;maxTasksPerTick?:number;onError?:(error:unknown)=>void}
export interface AgentSchedulerSnapshot {running:boolean;tickInFlight:boolean;ticks:number;lastTickAt?:string;lastSuccessAt?:string;lastErrorAt?:string;lastError?:string;recoveredTasks:number;recoveredSteps:number}

export class CieavAgentScheduler{
  private timer?:NodeJS.Timeout;private running=false;private inFlight=false;private ticks=0;private lastTickAt?:string;private lastSuccessAt?:string;private lastErrorAt?:string;private lastError?:string;private recoveredTasks=0;private recoveredSteps=0;
  private readonly intervalMs:number;private readonly jitterMs:number;private readonly maxTasks:number;
  constructor(private readonly runtime:CieavAgentRuntime,private readonly options:AgentSchedulerOptions={}){this.intervalMs=Math.max(250,Math.min(60_000,options.intervalMs??1000));this.jitterMs=Math.max(0,Math.min(this.intervalMs,options.jitterMs??Math.floor(this.intervalMs*.1)));this.maxTasks=Math.max(1,Math.min(100,options.maxTasksPerTick??16))}
  snapshot():AgentSchedulerSnapshot{return{running:this.running,tickInFlight:this.inFlight,ticks:this.ticks,...(this.lastTickAt?{lastTickAt:this.lastTickAt}:{}),...(this.lastSuccessAt?{lastSuccessAt:this.lastSuccessAt}:{}),...(this.lastErrorAt?{lastErrorAt:this.lastErrorAt}:{}),...(this.lastError?{lastError:this.lastError}:{}),recoveredTasks:this.recoveredTasks,recoveredSteps:this.recoveredSteps}}
  async start(){if(this.running)return this.snapshot();this.running=true;try{const recovered=await this.runtime.recoverOnStartup();this.recoveredTasks+=recovered.tasks.length;this.recoveredSteps+=recovered.steps.length}catch(error){this.recordError(error)}this.schedule(0);return this.snapshot()}
  private schedule(delay=this.intervalMs){if(!this.running)return;const jitter=this.jitterMs?Math.floor(Math.random()*(this.jitterMs*2+1))-this.jitterMs:0;this.timer=setTimeout(()=>void this.tick(),Math.max(0,delay+jitter));this.timer.unref?.()}
  async tick(){if(!this.running||this.inFlight){if(this.running&&!this.inFlight)this.schedule();return[]}this.inFlight=true;this.ticks++;this.lastTickAt=new Date().toISOString();try{const result=await this.runtime.tick(new Date(),this.maxTasks);this.lastSuccessAt=new Date().toISOString();this.lastError=undefined;return result}catch(error){this.recordError(error);return[]}finally{this.inFlight=false;if(this.running)this.schedule()}}
  private recordError(error:unknown){this.lastErrorAt=new Date().toISOString();this.lastError=(error instanceof Error?error.message:String(error)).slice(0,1000);try{this.options.onError?.(error)}catch{}}
  async stop(){this.running=false;if(this.timer)clearTimeout(this.timer);while(this.inFlight)await new Promise(resolve=>setTimeout(resolve,10));return this.snapshot()}
}
