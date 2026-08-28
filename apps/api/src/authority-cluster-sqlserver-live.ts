import {readFile} from "node:fs/promises";
import {createRequire} from "node:module";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {
  CieavSqlServerAuthorityStateBackend,
  SqlServerAuthorityClusterDatabase,
  loadSqlServerAuthorityClusterConfig,
  type SqlServerAuthorityClusterConfig,
  type SqlServerDriverLike
} from "./authority-cluster-sqlserver.js";
import {withManagedAuthoritySqlSecrets} from "./managed-secrets.js";

export const QUALIFIED_MSSQL_RUNTIME_VERSION="12.7.0" as const;
type ModuleLoader=(specifier:string)=>Promise<unknown>;
const importModule:ModuleLoader=specifier=>import(specifier);

export function sqlServerLivePoolConfig(config:SqlServerAuthorityClusterConfig){
  return{
    server:config.server,
    port:config.port,
    database:config.database,
    user:config.user,
    password:config.password,
    options:{encrypt:true,trustServerCertificate:false,enableArithAbort:true,multiSubnetFailover:true,appName:"CIEAV Authority State"},
    pool:{max:config.poolMax,min:0,idleTimeoutMillis:30_000},
    connectionTimeout:5_000,
    requestTimeout:10_000
  };
}

async function locateMssqlPackage(entryPath:string){
  let current=path.dirname(entryPath);
  for(let depth=0;depth<8;depth++){
    const candidate=path.join(current,"package.json");
    try{
      const parsed=JSON.parse(await readFile(candidate,"utf8")) as {name?:unknown;version?:unknown};
      if(parsed?.name==="mssql")return{packagePath:candidate,version:String(parsed.version??"")};
    }catch(error){const code=typeof error==="object"&&error!==null?String((error as {code?:unknown}).code??""):"";if(code!=="ENOENT"&&!(error instanceof SyntaxError))throw error}
    const parent=path.dirname(current);if(parent===current)break;current=parent;
  }
  throw new Error("CIEAV could not locate mssql package metadata from its resolved entry point");
}

export async function assertQualifiedMssqlRuntime(resolvePath?:(specifier:string)=>string){
  const resolve=resolvePath??createRequire(import.meta.url).resolve;
  let entryPath:string;
  try{entryPath=resolve("mssql")}catch(error){throw new Error(`CIEAV sqlserver-candidate requires mssql@${QUALIFIED_MSSQL_RUNTIME_VERSION}: ${error instanceof Error?error.message:String(error)}`)}
  let metadata:{packagePath:string;version:string};
  try{metadata=await locateMssqlPackage(entryPath)}catch(error){throw new Error(`CIEAV could not verify the installed mssql runtime: ${error instanceof Error?error.message:String(error)}`)}
  if(metadata.version!==QUALIFIED_MSSQL_RUNTIME_VERSION)throw new Error(`CIEAV sqlserver-candidate requires exactly mssql@${QUALIFIED_MSSQL_RUNTIME_VERSION}; found ${metadata.version||"unknown"}`);
  return{entryPath,...metadata};
}

export async function loadQualifiedMssqlDriver(resolvePath?:(specifier:string)=>string,loadModule:ModuleLoader=importModule){
  const {entryPath}=await assertQualifiedMssqlRuntime(resolvePath);
  const qualifiedEntry=pathToFileURL(entryPath).href;
  let loaded:unknown;
  try{loaded=await loadModule(qualifiedEntry)}catch(error){throw new Error(`CIEAV sqlserver-candidate could not load verified mssql@${QUALIFIED_MSSQL_RUNTIME_VERSION} entry ${entryPath}: ${error instanceof Error?error.message:String(error)}`)}
  const module=loaded as SqlServerDriverLike&{default?:SqlServerDriverLike},driver=(module.ConnectionPool?module:module.default) as SqlServerDriverLike|undefined;
  if(!driver?.ConnectionPool||!driver.Transaction)throw new Error("CIEAV sqlserver-candidate mssql runtime driver is invalid");
  return driver;
}

export async function createLiveSqlServerAuthorityStateBackendFromEnv(env:NodeJS.ProcessEnv=process.env){
  const projectedEnv=withManagedAuthoritySqlSecrets(env,true),config=loadSqlServerAuthorityClusterConfig(projectedEnv),driver=await loadQualifiedMssqlDriver();
  const pool=new driver.ConnectionPool(sqlServerLivePoolConfig(config));
  const database=new SqlServerAuthorityClusterDatabase(pool,driver,config.transactionRetries);
  return new CieavSqlServerAuthorityStateBackend(database,config.namespace,config.leaseMs);
}

export function sqlServerLiveRuntimePosture(){return{
  version:"CIEAV_SQLSERVER_LIVE_RUNTIME_POSTURE_V1" as const,
  qualifiedMssqlVersion:QUALIFIED_MSSQL_RUNTIME_VERSION,
  tcpListenerExpected:true,
  multiSubnetFailover:true,
  encryptedConnectionRequired:true,
  trustServerCertificate:false,
  managedCredentialProjection:true,
  processEnvironmentCredentialLeakage:false,
  serializableTransactions:true,
  monotonicFencing:true,
  idempotentCommitRecovery:true,
  externalFailoverQualified:false,
  networkPartitionTested:false,
  clusterHaQualified:false,
  authority:false as const,
  mayMintExecutionAuthority:false as const,
  executionAuthorityIssued:false as const
};}
