import {
  FrameworkBindingSchema,FrameworkTelemetryEnvelopeSchema,FrameworkToolCallSchema,
  type FrameworkBinding,type FrameworkTelemetryEnvelope,type FrameworkToolCall
} from "@cieav/contracts/framework-interop";

export type FrameworkBindResult={binding:FrameworkBinding;assessment:unknown};
export type AgentTaskCreateInput={intentId:string;actor:{id:string;kind:"AGENT"};goal:string;deadlineAt?:string;maxRetries?:number;metadata?:Record<string,string|number|boolean|null>};

/** Framework-neutral bridge for agent runtimes. Trusted Gateway authority is intentionally excluded. */
export class CieavFrameworkClient{
  readonly apiBase:string;
  constructor(apiBase:string,private readonly agentToken:string){this.apiBase=apiBase.replace(/\/$/,"");if(!agentToken.trim())throw new Error("CIEAV agent token is required")}
  private async request(path:string,init:RequestInit={}){const res=await fetch(`${this.apiBase}${path}`,{...init,redirect:"error",headers:{"content-type":"application/json",authorization:`Bearer ${this.agentToken}`,...(init.headers??{})}});const text=await res.text();let body:any;try{body=text?JSON.parse(text):{}}catch{body={error:"invalid_json",detail:text.slice(0,500)}}if(!res.ok)throw new Error(`CIEAV ${res.status}: ${body?.error??body?.detail??"request failed"}`);return body}
  async createTask(input:AgentTaskCreateInput){return this.request("/v1/agent/tasks",{method:"POST",body:JSON.stringify({...input,maxRetries:input.maxRetries??2})})}
  async bindToolCall(taskId:string,adapterManifestId:string,rawCall:FrameworkToolCall):Promise<FrameworkBindResult>{const call=FrameworkToolCallSchema.parse(rawCall),body=await this.request(`/v1/agent/tasks/${encodeURIComponent(taskId)}/framework-calls`,{method:"POST",body:JSON.stringify({adapterManifestId,call})});return{binding:FrameworkBindingSchema.parse(body.binding),assessment:body.assessment}}
  async bindings(taskId:string):Promise<FrameworkBinding[]>{const body=await this.request(`/v1/agent/tasks/${encodeURIComponent(taskId)}/framework-bindings`);return Array.isArray(body?.bindings)?body.bindings.map((x:unknown)=>FrameworkBindingSchema.parse(x)):[]}
  async authorize(taskId:string,proposal:Record<string,unknown>){return this.request(`/v1/agent/tasks/${encodeURIComponent(taskId)}/execution/authorize`,{method:"POST",body:JSON.stringify({proposal})})}
  async requireCommitment(taskId:string,reason="consequential framework tool call requires authority"){return this.request(`/v1/agent/tasks/${encodeURIComponent(taskId)}/require-commitment`,{method:"POST",body:JSON.stringify({reason})})}
  async transition(taskId:string,to:string,reason="framework lifecycle transition"){return this.request(`/v1/agent/tasks/${encodeURIComponent(taskId)}/transition`,{method:"POST",body:JSON.stringify({to,reason})})}
  async retry(taskId:string,nextRunAt:string,reason="framework retry"){return this.request(`/v1/agent/tasks/${encodeURIComponent(taskId)}/retry`,{method:"POST",body:JSON.stringify({nextRunAt,reason})})}
}

export function redactedFrameworkTelemetry(input:Omit<FrameworkTelemetryEnvelope,"version"|"redactionApplied"|"createdAt">&{createdAt?:string}):FrameworkTelemetryEnvelope{return FrameworkTelemetryEnvelopeSchema.parse({...input,version:1,redactionApplied:true,createdAt:input.createdAt??new Date().toISOString()})}
export function frameworkToolCall(raw:FrameworkToolCall):FrameworkToolCall{return FrameworkToolCallSchema.parse(raw)}
