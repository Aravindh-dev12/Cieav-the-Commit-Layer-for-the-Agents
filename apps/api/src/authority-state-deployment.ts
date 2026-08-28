import {loadSqlServerAuthorityClusterConfig} from "./authority-cluster-sqlserver.js";
import {withManagedAuthoritySqlSecrets} from "./managed-secrets.js";

export type AuthorityStateMode="single-writer-file"|"single-host-sqlite"|"sqlserver-candidate"|"cluster-ha";
export type AuthorityClusterBackend="sqlserver-ha-v1";

export interface AuthorityStateDeployment {
  mode:AuthorityStateMode;
  replicas:number;
  consequenceAlgebraStore:"file"|"sqlite"|"sqlserver";
  clusterBackend?:AuthorityClusterBackend;
  sqlServerCoreStateActive:boolean;
  coreTrustedStoresMigrated:boolean;
  remainingAuthorityStoresLocal:boolean;
  multiReplicaAuthoritySafe:boolean;
  externalFailoverQualified:false;
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
  coreTrustedStoresMigrated:true;
  trustedStoresMigrated:false;
  remainingAuthorityStoresLocal:true;
  externalFailoverQualified:false;
  clusterHaQualified:false;
  authority:false;
  mayMintExecutionAuthority:false;
}

function positiveInt(raw:string|undefined,name:string,fallback:number){const n=Number(raw??fallback);if(!Number.isInteger(n)||n<1||n>1024)throw new Error(`${name} must be an integer between 1 and 1024`);return n}
const safeNodeId=(value:string)=>/^[A-Za-z0-9._:-]{8,120}$/.test(value);

export function authorityClusterBackendCapability(env:NodeJS.ProcessEnv=process.env):AuthorityClusterBackendCapability{
  const backend=String(env.CIEAV_AUTHORITY_CLUSTER_BACKEND??"").trim();
  if(!backend)throw new Error("SQL Server authority mode requires CIEAV_AUTHORITY_CLUSTER_BACKEND");
  if(backend!=="sqlserver-ha-v1")throw new Error(`unsupported CIEAV_AUTHORITY_CLUSTER_BACKEND: ${backend}`);
  const config=loadSqlServerAuthorityClusterConfig(withManagedAuthoritySqlSecrets(env,false));
  return{backend,namespace:config.namespace,encryptedConnectionRequired:true,serializableTransactions:true,multiKeyAtomicCas:true,monotonicFencing:true,databaseClockLeases:true,idempotentCommitRecovery:true,coreTrustedStoresMigrated:true,trustedStoresMigrated:false,remainingAuthorityStoresLocal:true,externalFailoverQualified:false,clusterHaQualified:false,authority:false,mayMintExecutionAuthority:false};
}

const localFileDeployment=(mode:"single-writer-file",replicas:number):AuthorityStateDeployment=>({mode,replicas,consequenceAlgebraStore:"file",sqlServerCoreStateActive:false,coreTrustedStoresMigrated:false,remainingAuthorityStoresLocal:true,multiReplicaAuthoritySafe:false,externalFailoverQualified:false,safeForRequestedTopology:true,authority:false,mayMintExecutionAuthority:false});

export function loadAuthorityStateDeployment(env:NodeJS.ProcessEnv=process.env):AuthorityStateDeployment{
  const replicas=positiveInt(env.CIEAV_AUTHORITY_REPLICAS,"CIEAV_AUTHORITY_REPLICAS",1);
  const requested=String(env.CIEAV_AUTHORITY_STATE_MODE??"").trim().toLowerCase();
  const store=String(env.CIEAV_CONSEQUENCE_ALGEBRA_STORE??"file").trim().toLowerCase();
  if(!["file","sqlite","sqlserver"].includes(store))throw new Error(`CIEAV_CONSEQUENCE_ALGEBRA_STORE must be file, sqlite, or sqlserver, got ${store}`);
  const clusterBackend=String(env.CIEAV_AUTHORITY_CLUSTER_BACKEND??"").trim();
  const mode:AuthorityStateMode=requested?requested as AuthorityStateMode:store==="sqlite"?"single-host-sqlite":store==="sqlserver"?"sqlserver-candidate":"single-writer-file";
  if(!["single-writer-file","single-host-sqlite","sqlserver-candidate","cluster-ha"].includes(mode))throw new Error(`unsupported CIEAV_AUTHORITY_STATE_MODE: ${requested}`);
  if(mode==="single-writer-file"){
    if(store!=="file")throw new Error("single-writer-file authority mode requires CIEAV_CONSEQUENCE_ALGEBRA_STORE=file");
    if(replicas!==1)throw new Error("CIEAV file-backed authority state is single-writer only; CIEAV_AUTHORITY_REPLICAS must be 1");
    return localFileDeployment(mode,replicas);
  }
  if(mode==="single-host-sqlite"){
    if(store!=="sqlite")throw new Error("single-host-sqlite authority mode requires CIEAV_CONSEQUENCE_ALGEBRA_STORE=sqlite");
    if(replicas>1&&env.CIEAV_AUTHORITY_SHARED_HOST!=="1")throw new Error("SQLite authority replicas require a qualified shared-host deployment");
    throw new Error("single-host-sqlite authority state is reserved but not implemented by the current trusted-state backend; refusing unsafe startup");
  }
  if(mode==="sqlserver-candidate"){
    if(store!=="sqlserver")throw new Error("sqlserver-candidate authority mode requires CIEAV_CONSEQUENCE_ALGEBRA_STORE=sqlserver");
    if(replicas!==1)throw new Error("sqlserver-candidate is deliberately single-replica until every authority-affecting store and external failover are qualified; CIEAV_AUTHORITY_REPLICAS must be 1");
    if(!clusterBackend)throw new Error("sqlserver-candidate authority mode requires CIEAV_AUTHORITY_CLUSTER_BACKEND");
    const nodeId=String(env.CIEAV_AUTHORITY_NODE_ID??"").trim();if(!safeNodeId(nodeId))throw new Error("sqlserver-candidate requires CIEAV_AUTHORITY_NODE_ID with 8-120 safe identifier characters");
    authorityClusterBackendCapability(env);
    return{mode,replicas,consequenceAlgebraStore:"sqlserver",clusterBackend:"sqlserver-ha-v1",sqlServerCoreStateActive:true,coreTrustedStoresMigrated:true,remainingAuthorityStoresLocal:true,multiReplicaAuthoritySafe:false,externalFailoverQualified:false,safeForRequestedTopology:true,authority:false,mayMintExecutionAuthority:false};
  }
  if(replicas<3)throw new Error("cluster-ha authority mode requires at least 3 replicas for qualified failover topology");
  if(store!=="sqlserver")throw new Error("cluster-ha authority mode requires CIEAV_CONSEQUENCE_ALGEBRA_STORE=sqlserver");
  if(!clusterBackend)throw new Error("cluster-ha authority mode requires CIEAV_AUTHORITY_CLUSTER_BACKEND");
  authorityClusterBackendCapability(env);
  throw new Error("sqlserver-ha-v1 core Kernel/Fabric/Algebra/Intent-Reality/journal state is migrated, but remaining authority-affecting stores are still local and external failover/network-partition behavior is not qualified; refusing unsafe cluster-ha startup");
}

export function authorityStateHealth(deployment:AuthorityStateDeployment){return{mode:deployment.mode,replicas:deployment.replicas,consequenceAlgebraStore:deployment.consequenceAlgebraStore,safeForRequestedTopology:deployment.safeForRequestedTopology,clusterBackend:deployment.clusterBackend??null,sqlServerCoreStateActive:deployment.sqlServerCoreStateActive,coreTrustedStoresMigrated:deployment.coreTrustedStoresMigrated,remainingAuthorityStoresLocal:deployment.remainingAuthorityStoresLocal,multiReplicaAuthoritySafe:deployment.multiReplicaAuthoritySafe,externalFailoverQualified:false,clusterHaQualified:false,authority:false,mayMintExecutionAuthority:false};}
