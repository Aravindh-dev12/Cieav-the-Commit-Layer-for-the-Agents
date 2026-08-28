import type {CieavAgentKernelStore} from "./agent-kernel.js";
import {CieavAgentKernelApi} from "./agent-kernel-api.js";
import {createSqlServerAuthorityCandidateRuntime} from "./authority-sqlserver-candidate-runtime.js";

type ManagedCandidateRuntime={health:()=>unknown;persistence:{close:()=>Promise<void>}};
type RuntimeFactory=(input:{kernel:CieavAgentKernelStore;env:NodeJS.ProcessEnv})=>Promise<ManagedCandidateRuntime>;
const runtimeByKernel=new WeakMap<CieavAgentKernelStore,ManagedCandidateRuntime>();
const INSTALL_MARKER=Symbol.for("cieav.sqlserver-candidate-managed-bootstrap.v1");
const HEALTH_MARKER=Symbol.for("cieav.sqlserver-candidate-runtime-health.v1");

type GlobalWithMarkers=typeof globalThis&{[INSTALL_MARKER]?:boolean;[HEALTH_MARKER]?:()=>unknown};

export function managedSqlServerCandidateHealth(){
  const global=globalThis as GlobalWithMarkers;
  return global[HEALTH_MARKER]?.()??null;
}

export function installManagedSqlServerCandidateBootstrap(runtimeFactory:RuntimeFactory=createSqlServerAuthorityCandidateRuntime){
  const global=globalThis as GlobalWithMarkers;
  if(global[INSTALL_MARKER])return false;
  global[INSTALL_MARKER]=true;
  const originalRecover=CieavAgentKernelApi.prototype.recoverOnStartup;
  CieavAgentKernelApi.prototype.recoverOnStartup=async function(){
    if(process.env.CIEAV_AUTHORITY_STATE_MODE!=="sqlserver-candidate")return originalRecover.call(this);
    const existing=runtimeByKernel.get(this.store);
    if(existing)return this.store.recoverOnStartup();
    const runtime=await runtimeFactory({kernel:this.store,env:process.env});
    runtimeByKernel.set(this.store,runtime);
    global[HEALTH_MARKER]=()=>runtime.health();
    const originalClose=this.store.close.bind(this.store);let closePromise:Promise<void>|null=null;
    this.store.close=()=>{
      if(closePromise)return closePromise;
      closePromise=(async()=>{try{await originalClose()}finally{await runtime.persistence.close()}})();
      return closePromise;
    };
    return [];
  };
  return true;
}
