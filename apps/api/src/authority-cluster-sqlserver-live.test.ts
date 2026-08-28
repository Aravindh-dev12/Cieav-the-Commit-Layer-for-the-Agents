import {mkdtemp,rm,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {afterEach,describe,expect,it} from "vitest";
import {QUALIFIED_MSSQL_RUNTIME_VERSION,assertQualifiedMssqlRuntime,loadQualifiedMssqlDriver,sqlServerLivePoolConfig,sqlServerLiveRuntimePosture} from "./authority-cluster-sqlserver-live.js";
import {loadSqlServerAuthorityClusterConfig} from "./authority-cluster-sqlserver.js";

const dirs:string[]=[];
afterEach(async()=>{await Promise.all(dirs.splice(0).map(dir=>rm(dir,{recursive:true,force:true})))});
async function fakePackage(version:string){const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-mssql-package-"));dirs.push(dir);const entry=path.join(dir,"index.js");await writeFile(entry,"module.exports = {};\n","utf8");await writeFile(path.join(dir,"package.json"),JSON.stringify({name:"mssql",version}),"utf8");return entry}
const env=():NodeJS.ProcessEnv=>({CIEAV_AUTHORITY_SQL_SERVER:"cieav-ag-listener.internal",CIEAV_AUTHORITY_SQL_DATABASE:"cieav_authority",CIEAV_AUTHORITY_SQL_USER:"cieav_runtime",CIEAV_AUTHORITY_SQL_PASSWORD:"not-a-real-secret-value",CIEAV_AUTHORITY_SQL_PORT:"1433",CIEAV_AUTHORITY_CLUSTER_NAMESPACE:"production-us-east-1",CIEAV_AUTHORITY_CLUSTER_LEASE_MS:"15000",CIEAV_AUTHORITY_CLUSTER_TX_RETRIES:"5",CIEAV_AUTHORITY_SQL_POOL_MAX:"8"});

describe("CIEAV live SQL Server authority runtime",()=>{
  it("requires the exact qualified mssql runtime version from the resolved package root",async()=>{const good=await fakePackage(QUALIFIED_MSSQL_RUNTIME_VERSION),bad=await fakePackage("12.6.0");await expect(assertQualifiedMssqlRuntime(()=>good)).resolves.toMatchObject({entryPath:good,version:QUALIFIED_MSSQL_RUNTIME_VERSION});await expect(assertQualifiedMssqlRuntime(()=>bad)).rejects.toThrow(/requires exactly mssql@12\.7\.0/i);await expect(assertQualifiedMssqlRuntime(()=>{throw new Error("module missing")})).rejects.toThrow(/requires mssql@12\.7\.0/i)});
  it("loads the exact entry whose package metadata was qualified",async()=>{const entry=await fakePackage(QUALIFIED_MSSQL_RUNTIME_VERSION),driver={ConnectionPool:class{},Transaction:class{}} as any;let loadedSpecifier="";await expect(loadQualifiedMssqlDriver(()=>entry,async specifier=>{loadedSpecifier=specifier;return driver})).resolves.toBe(driver);expect(loadedSpecifier).toBe(pathToFileURL(entry).href);expect(loadedSpecifier).not.toBe("mssql")});
  it("enforces encrypted listener-oriented pool configuration",()=>{const config=loadSqlServerAuthorityClusterConfig(env()),pool=sqlServerLivePoolConfig(config);expect(pool).toMatchObject({server:"cieav-ag-listener.internal",port:1433,database:"cieav_authority",options:{encrypt:true,trustServerCertificate:false,enableArithAbort:true,multiSubnetFailover:true,appName:"CIEAV Authority State"},pool:{max:8,min:0,idleTimeoutMillis:30000},connectionTimeout:5000,requestTimeout:10000});expect((pool as any).password).toBe("not-a-real-secret-value")});
  it("reports failover posture without self-claiming HA qualification or authority",()=>{expect(sqlServerLiveRuntimePosture()).toMatchObject({qualifiedMssqlVersion:"12.7.0",tcpListenerExpected:true,multiSubnetFailover:true,encryptedConnectionRequired:true,trustServerCertificate:false,serializableTransactions:true,monotonicFencing:true,idempotentCommitRecovery:true,externalFailoverQualified:false,networkPartitionTested:false,clusterHaQualified:false,authority:false,mayMintExecutionAuthority:false,executionAuthorityIssued:false})});
});
