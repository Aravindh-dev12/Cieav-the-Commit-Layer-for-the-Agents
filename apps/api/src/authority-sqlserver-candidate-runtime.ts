import crypto from "node:crypto";
import type {CieavAgentKernelStore} from "./agent-kernel.js";
import {createLiveSqlServerAuthorityStateBackendFromEnv,sqlServerLiveRuntimePosture} from "./authority-cluster-sqlserver-live.js";
import type {CieavSqlServerAuthorityStateBackend} from "./authority-cluster-sqlserver.js";
import {authorityStateHealth,loadAuthorityStateDeployment} from "./authority-state-deployment.js";
import {CieavSqlServerTrustedStatePersistence,createSqlServerTrustedKernelCandidate} from "./authority-trusted-state-sqlserver.js";

const nodeIdPattern=/^[A-Za-z0-9._:-]{8,120}$/;
const instanceIdPattern=/^[A-Za-z0-9._:-]{8,120}$/;

export function buildSqlServerAuthorityOwnerId(nodeId:string,instanceId=crypto.randomUUID(),pid=process.pid){
  if(!nodeIdPattern.test(nodeId))throw new Error("CIEAV SQL authority node id must be 8-120 safe identifier characters");
  if(!instanceIdPattern.test(instanceId))throw new Error("CIEAV SQL authority instance id must be 8-120 safe identifier characters");
  if(!Number.isInteger(pid)||pid<1)throw new Error("CIEAV SQL authority process id is invalid");
  const ownerId=`${nodeId}:${pid}:${instanceId}`;
  if(ownerId.length>200)throw new Error("CIEAV SQL authority writer owner id exceeds 200 characters");
  return ownerId;
}

type BackendFactory=(env:NodeJS.ProcessEnv)=>Promise<CieavSqlServerAuthorityStateBackend>;

export async function createSqlServerAuthorityCandidateRuntime(input:{kernel:CieavAgentKernelStore;env?:NodeJS.ProcessEnv;backendFactory?:BackendFactory;instanceId?:string;pid?:number}){
  const env=input.env??process.env,deployment=loadAuthorityStateDeployment(env);
  if(deployment.mode!=="sqlserver-candidate")throw new Error(`CIEAV SQL candidate runtime requires sqlserver-candidate deployment mode, got ${deployment.mode}`);
  const nodeId=String(env.CIEAV_AUTHORITY_NODE_ID??"").trim(),ownerId=buildSqlServerAuthorityOwnerId(nodeId,input.instanceId??crypto.randomUUID(),input.pid??process.pid);
  const backend=await (input.backendFactory??createLiveSqlServerAuthorityStateBackendFromEnv)(env);
  const persistence=new CieavSqlServerTrustedStatePersistence(backend,ownerId);
  try{
    const candidate=await createSqlServerTrustedKernelCandidate({kernel:input.kernel,persistence});
    return{
      ...candidate,
      deployment,
      ownerId,
      health:()=>({
        version:"CIEAV_SQLSERVER_CANDIDATE_RUNTIME_HEALTH_V1" as const,
        deployment:authorityStateHealth(deployment),
        liveSql:sqlServerLiveRuntimePosture(),
        persistence:persistence.health(),
        migration:candidate.migration.health(),
        processInstanceWriterIdentity:true,
        productionBootstrapPath:true,
        remainingAuthorityStoresLocal:true,
        multiReplicaAuthoritySafe:false,
        externalFailoverQualified:false,
        clusterHaQualified:false,
        authority:false as const,
        mayMintExecutionAuthority:false as const,
        executionAuthorityIssued:false as const
      }),
      close:async()=>{await input.kernel.close();await persistence.close()}
    };
  }catch(error){await persistence.close().catch(()=>undefined);throw error}
}
