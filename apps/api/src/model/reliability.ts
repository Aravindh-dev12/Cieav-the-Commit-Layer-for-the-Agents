import {randomUUID} from "node:crypto";
import type {PrivateModelRole} from "./cloud.js";

export type CircuitState="CLOSED"|"OPEN"|"HALF_OPEN";

export interface ReliabilityPolicy {
  failureThreshold:number;
  cooldownMs:number;
  maxConcurrent:number;
}

export interface ProviderHealthSnapshot {
  key:string;
  state:CircuitState;
  consecutiveFailures:number;
  inFlight:number;
  openedAt?:number;
  lastFailureAt?:number;
  lastSuccessAt?:number;
  lastError?:string;
}

export interface InferenceReceipt {
  receiptType:"CIEAV_INFERENCE_RECEIPT";
  receiptVersion:"1";
  receiptId:string;
  requestId:string;
  role:PrivateModelRole;
  model:string;
  modelRevision?:string;
  modelDigest?:string;
  provider:"cieav-private-inference";
  protocolVersion:string;
  startedAt:string;
  completedAt:string;
  latencyMs:number;
  ok:boolean;
  zeroRetention:true;
  executionAuthority:false;
  fallbackUsed:boolean;
  degraded:boolean;
  circuitState:CircuitState;
  error?:string;
}

type State={state:CircuitState;consecutiveFailures:number;inFlight:number;openedAt?:number;lastFailureAt?:number;lastSuccessAt?:number;lastError?:string;halfOpenProbeInFlight:boolean};

const DEFAULT_POLICY:ReliabilityPolicy={failureThreshold:3,cooldownMs:15_000,maxConcurrent:32};
function boundedEnv(name:string,fallback:number,min:number,max:number){const n=Number(process.env[name]??fallback);return Number.isFinite(n)?Math.max(min,Math.min(max,Math.floor(n))):fallback}
export function reliabilityPolicyFromEnv():ReliabilityPolicy{return{failureThreshold:boundedEnv("CIEAV_MODEL_FAILURE_THRESHOLD",DEFAULT_POLICY.failureThreshold,1,20),cooldownMs:boundedEnv("CIEAV_MODEL_COOLDOWN_MS",DEFAULT_POLICY.cooldownMs,1_000,300_000),maxConcurrent:boundedEnv("CIEAV_MODEL_MAX_CONCURRENT",DEFAULT_POLICY.maxConcurrent,1,1024)}}

export class ProviderReliabilityManager {
  private readonly states=new Map<string,State>();
  constructor(private readonly policy:ReliabilityPolicy=DEFAULT_POLICY,private readonly now:()=>number=()=>Date.now()){
    if(policy.failureThreshold<1||policy.cooldownMs<1||policy.maxConcurrent<1)throw new Error("invalid_reliability_policy");
  }

  private state(key:string):State{
    let s=this.states.get(key);
    if(!s){s={state:"CLOSED",consecutiveFailures:0,inFlight:0,halfOpenProbeInFlight:false};this.states.set(key,s)}
    if(s.state==="OPEN"&&s.openedAt!==undefined&&this.now()-s.openedAt>=this.policy.cooldownMs){s.state="HALF_OPEN";s.halfOpenProbeInFlight=false}
    return s;
  }

  acquire(key:string):{ok:true;state:CircuitState;release:()=>void}|{ok:false;state:CircuitState;reason:"circuit_open"|"concurrency_limit"|"half_open_probe_in_flight"}{
    const s=this.state(key);
    if(s.state==="OPEN")return{ok:false,state:s.state,reason:"circuit_open"};
    if(s.inFlight>=this.policy.maxConcurrent)return{ok:false,state:s.state,reason:"concurrency_limit"};
    if(s.state==="HALF_OPEN"&&s.halfOpenProbeInFlight)return{ok:false,state:s.state,reason:"half_open_probe_in_flight"};
    s.inFlight++;
    if(s.state==="HALF_OPEN")s.halfOpenProbeInFlight=true;
    let released=false;
    return{ok:true,state:s.state,release:()=>{if(released)return;released=true;s.inFlight=Math.max(0,s.inFlight-1);if(s.state==="HALF_OPEN")s.halfOpenProbeInFlight=false}};
  }

  success(key:string){const s=this.state(key);s.state="CLOSED";s.consecutiveFailures=0;s.lastSuccessAt=this.now();s.lastError=undefined;s.openedAt=undefined;s.halfOpenProbeInFlight=false}

  failure(key:string,error:string){const s=this.state(key);s.consecutiveFailures++;s.lastFailureAt=this.now();s.lastError=error.slice(0,300);if(s.state==="HALF_OPEN"||s.consecutiveFailures>=this.policy.failureThreshold){s.state="OPEN";s.openedAt=this.now();s.halfOpenProbeInFlight=false}}

  snapshot(key:string):ProviderHealthSnapshot{const s=this.state(key);return{key,state:s.state,consecutiveFailures:s.consecutiveFailures,inFlight:s.inFlight,...(s.openedAt!==undefined?{openedAt:s.openedAt}:{}),...(s.lastFailureAt!==undefined?{lastFailureAt:s.lastFailureAt}:{}),...(s.lastSuccessAt!==undefined?{lastSuccessAt:s.lastSuccessAt}:{}),...(s.lastError?{lastError:s.lastError}:{})}}

  reset(){this.states.clear()}
}

export function providerKey(baseUrl:string,model:string){return`${baseUrl.replace(/\/$/,"")}::${model}`}

export function createInferenceReceipt(input:{requestId:string;role:PrivateModelRole;model:string;modelRevision?:string;modelDigest?:string;protocolVersion:string;startedAt:number;completedAt:number;ok:boolean;fallbackUsed:boolean;degraded:boolean;circuitState:CircuitState;error?:string}):InferenceReceipt{
  return{receiptType:"CIEAV_INFERENCE_RECEIPT",receiptVersion:"1",receiptId:randomUUID(),requestId:input.requestId,role:input.role,model:input.model,...(input.modelRevision?{modelRevision:input.modelRevision}:{}),...(input.modelDigest?{modelDigest:input.modelDigest}:{}),provider:"cieav-private-inference",protocolVersion:input.protocolVersion,startedAt:new Date(input.startedAt).toISOString(),completedAt:new Date(input.completedAt).toISOString(),latencyMs:Math.max(0,input.completedAt-input.startedAt),ok:input.ok,zeroRetention:true,executionAuthority:false,fallbackUsed:input.fallbackUsed,degraded:input.degraded,circuitState:input.circuitState,...(input.error?{error:input.error.slice(0,300)}:{})};
}

export const privateInferenceReliability=new ProviderReliabilityManager(reliabilityPolicyFromEnv());
