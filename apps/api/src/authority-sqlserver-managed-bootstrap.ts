import type {CieavAgentKernelStore} from "./agent-kernel.js";
import {CieavAgentKernelApi} from "./agent-kernel-api.js";
import {createSqlServerAuthorityCandidateRuntime} from "./authority-sqlserver-candidate-runtime.js";

type ManagedCandidateRuntime={health:()=>unknown;persistence:{close:()=>Promise<void>}};
type RuntimeFactory=(input:{kernel:CieavAgentKernelStore;env:NodeJS.ProcessEnv})=>Promise<ManagedCandidateRuntime>;
type KernelApiLike={store:CieavAgentKernelStore};
type RecoveryResult=Awaited<ReturnType<CieavAgentKernelStore["recoverOnStartup"]>>;
type OriginalRecover=(this:KernelApiLike)=>Promise<RecoveryResult>;
const runtimeByKernel=new WeakMap<CieavAgentKernelStore,ManagedCandidateRuntime>();
const INSTALL_MARKER=Symbol.for("cieav.sqlserver-candidate-managed-bootstrap.v1");
const HEALTH_MARKER=Symbol.for("cieav.sqlserver-candidate-runtime-health.v1");

type GlobalWithMarkers=typeof globalThis&{[INSTALL_MARKER]?:boolean;[HEALTH_MARKER]?:()=>unknown};

export function managedSqlServerCandidateHealth(){const global=globalThis as GlobalWithMarkers;return global[HEALTH_MARKER]?.()??null}

export async function recoverManagedSqlServerCandidate(api:KernelApiLike,originalRecover:OriginalRecover,runtimeFactory:RuntimeFactory=createSqlServerAuthorityCandidateRuntime,env:NodeJS.ProcessEnv=process.env):Promise<RecoveryResult>{
  if(env.CIEAV_AUTHORITY_STATE_MODE!=="sqlserver-candidate")return originalRecover.call(api);
  const existing=runtimeByKernel.get(api.store);
  if(existing)return api.store.recoverOnStartup();
  const runtime=await runtimeFactory({kernel:api.store,env});
  runtimeByKernel.set(api.store,runtime);
  const global=globalThis as GlobalWithMarkers;global[HEALTH_MARKER]=()=>runtime.health();
  const originalClose=api.store.close.bind(api.store);let closePromise:Promise<void>|null=null;
  api.store.close=()=>{
    if(closePromise)return closePromise;
    closePromise=(async()=>{try{await originalClose()}finally{await runtime.persistence.close()}})();
    return closePromise;
  };
  return [];
}

export function installManagedSqlServerCandidateBootstrap(runtimeFactory:RuntimeFactory=createSqlServerAuthorityCandidateRuntime){
  const global=globalThis as GlobalWithMarkers;
  if(global[INSTALL_MARKER])return false;
  global[INSTALL_MARKER]=true;
  const originalRecover=CieavAgentKernelApi.prototype.recoverOnStartup as OriginalRecover;
  CieavAgentKernelApi.prototype.recoverOnStartup=function(){return recoverManagedSqlServerCandidate(this,originalRecover,runtimeFactory,process.env)};
  return true;
}
