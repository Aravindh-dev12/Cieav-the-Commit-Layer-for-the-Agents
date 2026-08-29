#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {spawnSync} from "node:child_process";
import {fileURLToPath,pathToFileURL} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const DIR=path.join(ROOT,"release","reports");
const QUALIFIED_MSSQL_RUNTIME_VERSION="12.7.0";
const digest=value=>crypto.createHash("sha256").update(typeof value==="string"?value:JSON.stringify(value)).digest("hex");

function run(name,cmd,args){
  const started=Date.now();
  const result=spawnSync(cmd,args,{cwd:ROOT,encoding:"utf8",shell:false,windowsHide:true,maxBuffer:24*1024*1024});
  return{name,ok:!result.error&&result.status===0,status:result.status??(result.error?127:-1),durationMs:Date.now()-started,stdout:String(result.stdout??""),stderr:[String(result.stderr??""),result.error?.message??""].filter(Boolean).join("\n")};
}

function npm(args){
  return process.platform==="win32"
    ?run(`npm ${args.join(" ")}`,process.env.ComSpec||"cmd.exe",["/d","/s","/c","npm.cmd",...args])
    :run(`npm ${args.join(" ")}`,"npm",args);
}

function git(args){
  const result=run(`git ${args.join(" ")}`,"git",args);
  if(!result.ok)throw new Error(result.stderr||result.stdout);
  return result.stdout.trim();
}

function inspectMssqlPackaging(){
  const apiPackage=JSON.parse(fs.readFileSync(path.join(ROOT,"apps/api/package.json"),"utf8"));
  const lock=JSON.parse(fs.readFileSync(path.join(ROOT,"package-lock.json"),"utf8"));
  const manifestVersion=String(apiPackage?.dependencies?.mssql??"");
  const workspaceLockVersion=String(lock?.packages?.["apps/api"]?.dependencies?.mssql??"");
  const lockedPackage=lock?.packages?.["node_modules/mssql"]??{};
  const lockedVersion=String(lockedPackage?.version??"");
  const integrity=String(lockedPackage?.integrity??"");
  const manifestExactPin=manifestVersion===QUALIFIED_MSSQL_RUNTIME_VERSION;
  const workspaceLockExactPin=workspaceLockVersion===QUALIFIED_MSSQL_RUNTIME_VERSION;
  const lockVersionExact=lockedVersion===QUALIFIED_MSSQL_RUNTIME_VERSION;
  const integrityPinned=/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(integrity);
  return{
    qualifiedVersion:QUALIFIED_MSSQL_RUNTIME_VERSION,
    manifestVersion,
    workspaceLockVersion,
    lockedVersion,
    integrityDigest:integrity?digest(integrity):null,
    manifestExactPin,
    workspaceLockExactPin,
    lockVersionExact,
    integrityPinned,
    packaged:manifestExactPin&&workspaceLockExactPin&&lockVersionExact&&integrityPinned,
    runtimeQualifiedVersion:null,
    runtimeVersionAligned:false
  };
}

const authorityTests=[
  "authority-state-deployment.test.ts",
  "authority-process-lease.test.ts",
  "authority-cluster-sqlserver.test.ts",
  "authority-cluster-sqlserver-live.test.ts",
  "authority-sqlserver-candidate-runtime.test.ts",
  "authority-sqlserver-managed-bootstrap.test.ts",
  "authority-trusted-state-sqlserver.test.ts",
  "authority-trusted-state-sqlserver-execution.test.ts",
  "config.test.ts"
];

const steps=[];
for(const result of [
  npm(["run","build:api"]),
  run("authority topology static gate",process.execPath,["scripts/authority-state-deployment-static.mjs"]),
  npm(["run","test","-w","@cieav/api","--",...authorityTests])
]){
  steps.push(result);
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  if(!result.ok)break;
}

let failure=steps.find(step=>!step.ok)?.name;
let topology=null;
let mssqlPackaging;
try{
  mssqlPackaging=inspectMssqlPackaging();
}catch(error){
  mssqlPackaging={qualifiedVersion:QUALIFIED_MSSQL_RUNTIME_VERSION,manifestVersion:"",workspaceLockVersion:"",lockedVersion:"",integrityDigest:null,manifestExactPin:false,workspaceLockExactPin:false,lockVersionExact:false,integrityPinned:false,packaged:false,runtimeQualifiedVersion:null,runtimeVersionAligned:false,error:error instanceof Error?error.message:String(error)};
}

if(!failure){
  const {loadAuthorityStateDeployment,authorityStateHealth}=await import(pathToFileURL(path.join(ROOT,"apps/api/dist/authority-state-deployment.js")).href);
  const liveRuntime=await import(pathToFileURL(path.join(ROOT,"apps/api/dist/authority-cluster-sqlserver-live.js")).href);
  mssqlPackaging.runtimeQualifiedVersion=String(liveRuntime.QUALIFIED_MSSQL_RUNTIME_VERSION??"");
  mssqlPackaging.runtimeVersionAligned=mssqlPackaging.runtimeQualifiedVersion===QUALIFIED_MSSQL_RUNTIME_VERSION;
  mssqlPackaging.packaged=mssqlPackaging.packaged&&mssqlPackaging.runtimeVersionAligned;
  if(!mssqlPackaging.packaged)failure="mssql_runtime_packaging_invalid";
  if(!failure){
    try{
      const deployment=loadAuthorityStateDeployment(process.env);
      topology=authorityStateHealth(deployment);
      if(topology.safeForRequestedTopology!==true||topology.clusterHaQualified!==false||topology.authority!==false||topology.mayMintExecutionAuthority!==false)failure="authority_topology_invariant_failed";
    }catch(error){
      failure=`authority_topology_invalid:${error instanceof Error?error.message:String(error)}`;
    }
  }
}

const stepFor=file=>steps.find(step=>step.name.includes(file));
const deploymentTestsPassed=Boolean(stepFor("authority-state-deployment.test.ts")?.ok);
const sqlServerTestsPassed=Boolean(stepFor("authority-cluster-sqlserver.test.ts")?.ok);
const liveRuntimeTestsPassed=Boolean(stepFor("authority-cluster-sqlserver-live.test.ts")?.ok);
const bootstrapTestsPassed=Boolean(stepFor("authority-sqlserver-candidate-runtime.test.ts")?.ok);
const managedBootstrapTestsPassed=Boolean(stepFor("authority-sqlserver-managed-bootstrap.test.ts")?.ok);
const trustedStateMigrationTestsPassed=Boolean(stepFor("authority-trusted-state-sqlserver.test.ts")?.ok);
const executionAtomicityTestsPassed=Boolean(stepFor("authority-trusted-state-sqlserver-execution.test.ts")?.ok);
const singleTransactionCrossStoreCommitTested=trustedStateMigrationTestsPassed&&executionAtomicityTestsPassed;

const report={
  version:"CIEAV_AUTHORITY_STATE_QUALIFICATION_V1",
  commit:git(["rev-parse","HEAD"]),
  branch:git(["branch","--show-current"]),
  platform:process.platform,
  arch:process.arch,
  node:process.version,
  steps:steps.map(({stdout,stderr,...step})=>({...step,stdoutDigest:digest(stdout),stderrDigest:digest(stderr)})),
  topology,
  singleWriterLeaseTested:sqlServerTestsPassed,
  sqlServerCandidateTopologyOfflineTested:deploymentTestsPassed,
  sqlServerCandidateSingleReplicaGuardTested:deploymentTestsPassed,
  sqlServerClusterHaStillFailClosedTested:deploymentTestsPassed,
  sqlServerAuthorityBackendOfflineTested:sqlServerTestsPassed,
  sqlServerSerializableTransactionsTested:sqlServerTestsPassed,
  sqlServerMultiKeyAtomicCasTested:sqlServerTestsPassed,
  sqlServerMonotonicFencingTested:sqlServerTestsPassed,
  sqlServerDatabaseClockLeaseTested:sqlServerTestsPassed,
  sqlServerIdempotentCommitRecoveryTested:sqlServerTestsPassed,
  sqlServerEncryptedConnectionConfigTested:sqlServerTestsPassed,
  sqlServerLiveRuntimeContractOfflineTested:liveRuntimeTestsPassed,
  sqlServerExactMssqlVersionGuardTested:liveRuntimeTestsPassed,
  sqlServerMultiSubnetFailoverConfigTested:liveRuntimeTestsPassed,
  sqlServerListenerTlsPostureTested:liveRuntimeTestsPassed,
  sqlServerProductionBootstrapOfflineTested:bootstrapTestsPassed,
  sqlServerProcessInstanceWriterIdentityTested:bootstrapTestsPassed,
  sqlServerBootstrapModeGuardTested:bootstrapTestsPassed,
  managedSqlCandidateActivationHookOfflineTested:managedBootstrapTestsPassed,
  managedSqlCandidateNonCandidateDelegationTested:managedBootstrapTestsPassed,
  managedSqlCandidateShutdownCleanupTested:managedBootstrapTestsPassed,
  productionSqlServerRuntimeWired:managedBootstrapTestsPassed,
  sqlServerTrustedStateMigrationOfflineTested:trustedStateMigrationTestsPassed,
  sqlServerWriterLeaseHeartbeatTested:trustedStateMigrationTestsPassed,
  sqlServerWriterLeaseLossFailClosedTested:trustedStateMigrationTestsPassed,
  sqlServerAuthenticatedLocalBootstrapTested:trustedStateMigrationTestsPassed,
  sqlServerFiveStoreStartupBarrierTested:trustedStateMigrationTestsPassed,
  sqlServerRestartRevisionOrderingTested:trustedStateMigrationTestsPassed,
  sqlServerWriterQueueRejectionContainmentTested:trustedStateMigrationTestsPassed,
  sqlServerKernelMigrationTested:trustedStateMigrationTestsPassed,
  sqlServerIntentRealityMigrationTested:trustedStateMigrationTestsPassed,
  sqlServerExecutionFabricMigrationTested:trustedStateMigrationTestsPassed,
  sqlServerConsequenceAlgebraMigrationTested:trustedStateMigrationTestsPassed,
  sqlServerAuthorityJournalMigrationTested:trustedStateMigrationTestsPassed,
  sqlServerNodeLocalStorageReplacementTested:trustedStateMigrationTestsPassed,
  sqlServerCasConflictFailClosedTested:trustedStateMigrationTestsPassed,
  sqlServerAtomicRollbackTested:trustedStateMigrationTestsPassed,
  recoverablyAtomicCrossStoreTransactionsTested:trustedStateMigrationTestsPassed,
  sqlServerExecutionPathAtomicityOfflineTested:executionAtomicityTestsPassed,
  sqlServerIssueTicketSingleTransactionTested:executionAtomicityTestsPassed,
  sqlServerConsumeTicketSingleTransactionTested:executionAtomicityTestsPassed,
  sqlServerUnknownQuarantineSingleTransactionTested:executionAtomicityTestsPassed,
  singleTransactionCrossStoreCommitTested,
  productionSqlServerRuntimeActivated:false,
  mssqlRuntimeDriverPackaged:mssqlPackaging.packaged,
  mssqlRuntimeManifestExactPin:mssqlPackaging.manifestExactPin,
  mssqlRuntimeWorkspaceLockExactPin:mssqlPackaging.workspaceLockExactPin,
  mssqlRuntimeLockVersionExact:mssqlPackaging.lockVersionExact,
  mssqlRuntimeIntegrityPinned:mssqlPackaging.integrityPinned,
  mssqlRuntimeQualifiedVersionAligned:mssqlPackaging.runtimeVersionAligned,
  mssqlRuntimePackaging:mssqlPackaging,
  remainingAuthorityStoresMigrated:false,
  trustedStoresMigratedToClusterBackend:false,
  externalClusterFailoverTested:false,
  networkPartitionTested:false,
  authority:false,
  mayMintExecutionAuthority:false,
  executionAuthorityIssued:false,
  clusterHaQualified:false,
  verdict:failure?"FAIL":"PASS",
  completedAt:new Date().toISOString()
};
if(failure)report.failure=failure;
report.digest=digest(report);

fs.mkdirSync(DIR,{recursive:true});
fs.writeFileSync(path.join(DIR,"latest-authority-state-qualification.json"),JSON.stringify(report,null,2)+"\n",{mode:0o600});
fs.writeFileSync(path.join(DIR,"latest-authority-state-qualification.txt"),`CIEAV Authority State Qualification\nVerdict: ${report.verdict}\nCommit: ${report.commit}\nTopology: ${topology?.mode??"INVALID"}\nReplicas: ${topology?.replicas??"INVALID"}\nSingle-writer lease tested: ${report.singleWriterLeaseTested}\nSQL Server candidate topology offline tested: ${report.sqlServerCandidateTopologyOfflineTested}\nSQL Server candidate single-replica guard tested: ${report.sqlServerCandidateSingleReplicaGuardTested}\nCluster-HA remains fail-closed tested: ${report.sqlServerClusterHaStillFailClosedTested}\nSQL Server authority backend offline tested: ${report.sqlServerAuthorityBackendOfflineTested}\nLive SQL runtime contract offline tested: ${report.sqlServerLiveRuntimeContractOfflineTested}\nExact mssql runtime version guard tested: ${report.sqlServerExactMssqlVersionGuardTested}\nMultiSubnetFailover configuration tested: ${report.sqlServerMultiSubnetFailoverConfigTested}\nListener TLS posture tested: ${report.sqlServerListenerTlsPostureTested}\nProduction candidate bootstrap offline tested: ${report.sqlServerProductionBootstrapOfflineTested}\nProcess-instance writer identity tested: ${report.sqlServerProcessInstanceWriterIdentityTested}\nBootstrap mode guard tested: ${report.sqlServerBootstrapModeGuardTested}\nManaged SQL activation hook offline tested: ${report.managedSqlCandidateActivationHookOfflineTested}\nManaged non-candidate delegation tested: ${report.managedSqlCandidateNonCandidateDelegationTested}\nManaged SQL shutdown cleanup tested: ${report.managedSqlCandidateShutdownCleanupTested}\nProduction SQL runtime wired: ${report.productionSqlServerRuntimeWired}\nSQL trusted-state migration offline tested: ${report.sqlServerTrustedStateMigrationOfflineTested}\nWriter lease heartbeat tested: ${report.sqlServerWriterLeaseHeartbeatTested}\nWriter lease-loss fail-closed tested: ${report.sqlServerWriterLeaseLossFailClosedTested}\nAuthenticated local-to-SQL bootstrap tested: ${report.sqlServerAuthenticatedLocalBootstrapTested}\nFive-store startup initialization barrier tested: ${report.sqlServerFiveStoreStartupBarrierTested}\nRestart revision ordering tested: ${report.sqlServerRestartRevisionOrderingTested}\nWriter queue rejection containment tested: ${report.sqlServerWriterQueueRejectionContainmentTested}\nKernel migration tested: ${report.sqlServerKernelMigrationTested}\nIntent-Reality migration tested: ${report.sqlServerIntentRealityMigrationTested}\nExecution Fabric migration tested: ${report.sqlServerExecutionFabricMigrationTested}\nConsequence Algebra migration tested: ${report.sqlServerConsequenceAlgebraMigrationTested}\nAuthority journal migration tested: ${report.sqlServerAuthorityJournalMigrationTested}\nNode-local storage replacement tested: ${report.sqlServerNodeLocalStorageReplacementTested}\nCAS conflict fail-closed tested: ${report.sqlServerCasConflictFailClosedTested}\nAtomic rollback tested: ${report.sqlServerAtomicRollbackTested}\nRecoverably atomic cross-store transactions tested: ${report.recoverablyAtomicCrossStoreTransactionsTested}\nExecution-path atomicity offline tested: ${report.sqlServerExecutionPathAtomicityOfflineTested}\nISSUE_TICKET single-SQL-transaction tested: ${report.sqlServerIssueTicketSingleTransactionTested}\nCONSUME_TICKET single-SQL-transaction tested: ${report.sqlServerConsumeTicketSingleTransactionTested}\nUNKNOWN quarantine single-SQL-transaction tested: ${report.sqlServerUnknownQuarantineSingleTransactionTested}\nSingle-transaction cross-store commit tested: ${report.singleTransactionCrossStoreCommitTested}\nProduction SQL Server runtime activated live: false\nQualified mssql runtime packaged: ${report.mssqlRuntimeDriverPackaged}\nQualified mssql manifest exact pin: ${report.mssqlRuntimeManifestExactPin}\nQualified mssql workspace lock exact pin: ${report.mssqlRuntimeWorkspaceLockExactPin}\nQualified mssql lock version exact: ${report.mssqlRuntimeLockVersionExact}\nQualified mssql integrity pinned: ${report.mssqlRuntimeIntegrityPinned}\nQualified mssql runtime version aligned: ${report.mssqlRuntimeQualifiedVersionAligned}\nRemaining authority-affecting stores migrated: false\nTrusted stores enabled on production cluster backend: false\nExternal failover tested: false\nNetwork partition tested: false\nCluster HA qualified: false\nDigest: ${report.digest}\n${failure?`Failure: ${failure}\n`:""}`);

console.log(`CIEAV authority state qualification: ${report.verdict}`);
console.log(`Commit: ${report.commit}`);
console.log(`Qualified mssql runtime packaged: ${report.mssqlRuntimeDriverPackaged}`);
console.log(`mssql packaging evidence: manifest=${report.mssqlRuntimeManifestExactPin} workspaceLock=${report.mssqlRuntimeWorkspaceLockExactPin} lockVersion=${report.mssqlRuntimeLockVersionExact} integrity=${report.mssqlRuntimeIntegrityPinned} runtimeVersion=${report.mssqlRuntimeQualifiedVersionAligned}`);
console.log(`Single-transaction cross-store commit tested: ${report.singleTransactionCrossStoreCommitTested}`);
console.log(`execution atomicity evidence: issue=${report.sqlServerIssueTicketSingleTransactionTested} consume=${report.sqlServerConsumeTicketSingleTransactionTested} unknown=${report.sqlServerUnknownQuarantineSingleTransactionTested} rollback=${report.sqlServerAtomicRollbackTested}`);
console.log(`Report: ${path.relative(ROOT,path.join(DIR,"latest-authority-state-qualification.json"))}`);
if(failure)process.exit(1);
