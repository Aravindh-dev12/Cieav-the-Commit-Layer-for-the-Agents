import {loadSqlServerAuthorityClusterConfig} from "./authority-cluster-sqlserver.js";

export type AuthorityStateMode="single-writer-file"|"single-host-sqlite"|"cluster-ha";
export type AuthorityClusterBackend="sqlserver-ha-v1";

export interface AuthorityStateDeployment {
  mode:AuthorityStateMode;
  replicas:number;
  consequenceAlgebraStore:"file"|"sqlite";
  clusterBackend?:AuthorityClusterBackend;
  safeForRequestedTopology:boolean;
  authority:false;
  mayMintExecutionAuthority:false;
}

export interface AuthorityClusterBackendCapability {
  backend:AuthorityClusterBackend;
  namespace:string;
  encryptedConnectionRequired:true;
  serializableTransactions:true;
  multiKeyAtomicCas:true;
  monotonicFencing:true;
  databaseClockLeases:true;
  idempotentCommitRecovery:true;
  trustedStoresMigrated:false;
  externalFailoverQualified:false;
  clusterHaQualified:false;
  authority:false;
  mayMintExecutionAuthority:false;
}

function positiveInt(raw:string|undefined,name:string,fallback:number){const n=Number(raw??fallback);if(!Number.isInteger(n)||n<1||n>1024)throw new Error(`${name} must be an integer between 1 and 1024`);return n}

export function authorityClusterBackendCapability(env:NodeJS.ProcessEnv=process.env):AuthorityClusterBackendCapability{
  const backend=String(env.CIEAV_AUTHORITY_CLUSTER_BACKEND??"").trim();
  if(!backend)throw new Error("cluster-ha authority mode requires CIEAV_AUTHORITY_CLUSTER_BACKEND");
  if(backend!=="sqlserver-ha-v1")throw new Error(`unsupported CIEAV_AUTHORITY_CLUSTER_BACKEND: ${backend}`);
  const config=loadSqlServerAuthorityClusterConfig(env);
  return{backend,namespace:config.namespace,encryptedConnectionRequired:true,serializableTransactions:true,multiKeyAtomicCas:true,monotonicFencing:true,databaseClockLeases:true,idempotentCommitRecovery:true,trustedStoresMigrated:false,externalFailoverQualified:false,clusterHaQualified:false,authority:false,mayMintExecutionAuthority:false};
}

export function loadAuthorityStateDeployment(env:NodeJS.ProcessEnv=process.env):AuthorityStateDeployment{
  const replicas=positiveInt(env.CIEAV_AUTHORITY_REPLICAS,"CIEAV_AUTHORITY_REPLICAS",1);
  const requested=String(env.CIEAV_AUTHORITY_STATE_MODE??"").trim().toLowerCase();
  const store=String(env.CIEAV_CONSEQUENCE_ALGEBRA_STORE??"file").trim().toLowerCase();
  if(store!=="file"&&store!=="sqlite")throw new Error(`CIEAV_CONSEQUENCE_ALGEBRA_STORE must be file or sqlite, got ${store}`);
  const clusterBackend=String(env.CIEAV_AUTHORITY_CLUSTER_BACKEND??"").trim();
  const mode:AuthorityStateMode=requested?requested as AuthorityStateMode:store==="sqlite"?"single-host-sqlite":"single-writer-file";
  if(!["single-writer-file","single-host-sqlite","cluster-ha"].includes(mode))throw new Error(`unsupported CIEAV_AUTHORITY_STATE_MODE: ${requested}`);
  if(mode==="single-writer-file"){
    if(store!=="file")throw new Error("single-writer-file authority mode requires CIEAV_CONSEQUENCE_ALGEBRA_STORE=file");
    if(replicas!==1)throw new Error("CIEAV file-backed authority state is single-writer only; CIEAV_AUTHORITY_REPLICAS must be 1");
    return{mode,replicas,consequenceAlgebraStore:"file",safeForRequestedTopology:true,authority:false,mayMintExecutionAuthority:false};
  }
  if(mode==="single-host-sqlite"){
    if(store!=="sqlite")throw new Error("single-host-sqlite authority mode requires CIEAV_CONSEQUENCE_ALGEBRA_STORE=sqlite");
    if(replicas>1&&env.CIEAV_AUTHORITY_SHARED_HOST!=="1")throw new Error("SQLite authority replicas require a qualified shared-host deployment");
    throw new Error("single-host-sqlite authority state is reserved but not implemented by the current trusted-state backend; refusing unsafe startup");
  }
  if(replicas<3)throw new Error("cluster-ha authority mode requires at least 3 replicas for qualified failover topology");
  if(!clusterBackend)throw new Error("cluster-ha authority mode requires CIEAV_AUTHORITY_CLUSTER_BACKEND");
  authorityClusterBackendCapability(env);
  throw new Error("sqlserver-ha-v1 backend primitives are implemented, but Fabric/Algebra/Kernel/Intent-Reality trusted stores are not yet migrated and external failover is not qualified; refusing unsafe cluster-ha startup");
}

export function authorityStateHealth(deployment:AuthorityStateDeployment){return{mode:deployment.mode,replicas:deployment.replicas,consequenceAlgebraStore:deployment.consequenceAlgebraStore,safeForRequestedTopology:deployment.safeForRequestedTopology,clusterBackend:deployment.clusterBackend??null,clusterHaQualified:false,authority:false,mayMintExecutionAuthority:false};}
