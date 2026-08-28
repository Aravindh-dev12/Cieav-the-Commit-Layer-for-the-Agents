import {mkdtemp,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach,describe,expect,it} from "vitest";
import {CieavAgentKernelStore} from "./agent-kernel.js";
import {CieavSqlServerAuthorityStateBackend,type AuthorityClusterDatabase,type AuthorityClusterTransaction} from "./authority-cluster-sqlserver.js";
import {CieavSqlServerTrustedStatePersistence,SQL_TRUSTED_STATE_KEYS,createSqlServerTrustedKernelCandidate} from "./authority-trusted-state-sqlserver.js";

type Lease={namespace:string;ownerId:string;fenceToken:string;leaseUntilMs:number};
type State={namespace:string;key:string;revision:string;value:string;valueDigest:string;fenceToken:string;updatedAtMs:number};
type Receipt={namespace:string;transactionId:string;requestDigest:string;resultJson:string;committedAtMs:number};
class MemorySqlAuthorityDatabase implements AuthorityClusterDatabase{
  now=1_800_000_000_000;leases=new Map<string,Lease>();states=new Map<string,State>();receipts=new Map<string,Receipt>();
  async initialize(){}
  private transaction(leases:Map<string,Lease>,states:Map<string,State>,receipts:Map<string,Receipt>):AuthorityClusterTransaction{return{nowMs:async()=>this.now,getLeaseForUpdate:async namespace=>structuredClone(leases.get(namespace)??null),putLease:async row=>{leases.set(row.namespace,structuredClone(row))},getStateForUpdate:async(namespace,key)=>structuredClone(states.get(`${namespace}\n${key}`)??null),getState:async(namespace,key)=>structuredClone(states.get(`${namespace}\n${key}`)??null),putState:async row=>{states.set(`${row.namespace}\n${row.key}`,structuredClone(row))},getReceipt:async(namespace,transactionId)=>structuredClone(receipts.get(`${namespace}\n${transactionId}`)??null),putReceipt:async row=>{receipts.set(`${row.namespace}\n${row.transactionId}`,structuredClone(row))}}}
  async serializable<T>(fn:(tx:AuthorityClusterTransaction)=>Promise<T>):Promise<T>{const leases=new Map([...this.leases].map(([k,v])=>[k,structuredClone(v)])),states=new Map([...this.states].map(([k,v])=>[k,structuredClone(v)])),receipts=new Map([...this.receipts].map(([k,v])=>[k,structuredClone(v)]));const result=await fn(this.transaction(leases,states,receipts));this.leases=leases;this.states=states;this.receipts=receipts;return result}
  async read<T>(fn:(tx:AuthorityClusterTransaction)=>Promise<T>):Promise<T>{return fn(this.transaction(this.leases,this.states,this.receipts))}
}
const dirs:string[]=[];afterEach(async()=>{await Promise.all(dirs.splice(0).map(dir=>rm(dir,{recursive:true,force:true})))});
const secret="s".repeat(64),intentId="33333333-3333-4333-8333-333333333333",effectKey="a".repeat(64);
const create={scopeDeviceId:"dev_sql_ha_12345678",intentId,owner:{id:"user-1",kind:"HUMAN" as const},actor:{id:"agent-1",kind:"AGENT" as const},goal:"Persist trusted authority state through SQL Server",maxRetries:2,metadata:{source:"sql-ha-test"}};
async function dir(){const d=await mkdtemp(path.join(os.tmpdir(),"cieav-sql-trusted-state-"));dirs.push(d);return d}

describe("CIEAV SQL Server trusted-state migration",()=>{
  it("bootstraps authenticated local trusted state into empty SQL without losing it",async()=>{
    const database=new MemorySqlAuthorityDatabase(),backend=new CieavSqlServerAuthorityStateBackend(database,"cluster-bootstrap-test",10_000),localDir=await dir(),file=path.join(localDir,"kernel.json");
    const localKernel=new CieavAgentKernelStore(file,secret),created=await localKernel.create({...create,goal:"Existing authenticated local authority state"});await localKernel.close();
    expect(await backend.readState(SQL_TRUSTED_STATE_KEYS.kernel)).toBeNull();
    const migratingKernel=new CieavAgentKernelStore(file,secret),persistence=new CieavSqlServerTrustedStatePersistence(backend,"authority-node-a");
    const candidate=await createSqlServerTrustedKernelCandidate({kernel:migratingKernel,persistence});
    expect((await migratingKernel.get(created.task.id))?.goal).toBe("Existing authenticated local authority state");
    const sqlKernel=await backend.readState(SQL_TRUSTED_STATE_KEYS.kernel);expect(sqlKernel?.revision).toBe("1");expect(sqlKernel?.value).toContain("Existing authenticated local authority state");
    for(const key of Object.values(SQL_TRUSTED_STATE_KEYS))expect(await backend.readState(key)).not.toBeNull();
    expect(candidate.migration.health()).toMatchObject({trustedStoresMigrated:true,startupInitializationBarrier:true,sqlServerAuthoritative:true,localFilesAuthoritative:false,clusterHaQualified:false,authority:false,mayMintExecutionAuthority:false});
    expect(candidate.migration.health().stores.every(store=>store.revision!==null&&store.fault===null)).toBe(true);
    await migratingKernel.close();await persistence.close();
  });

  it("reopens all authority-critical documents from SQL after node-local storage is replaced",async()=>{
    const database=new MemorySqlAuthorityDatabase(),backend=new CieavSqlServerAuthorityStateBackend(database,"cluster-prod-test",10_000),dirA=await dir();
    const kernelA=new CieavAgentKernelStore(path.join(dirA,"kernel.json"),secret),persistenceA=new CieavSqlServerTrustedStatePersistence(backend,"authority-node-a");
    await createSqlServerTrustedKernelCandidate({kernel:kernelA,persistence:persistenceA});
    const created=await kernelA.create(create);
    const quarantine=await kernelA.intentReality.quarantineUnknown(effectKey,created.task.id,intentId);
    const now=Date.now();await kernelA.executionFabric.registerAttestation({version:1,subjectId:"agent-1",provider:"sql-ha-test",method:"LOCAL_KEY",keyId:"agent-key-1",publicKeyFingerprint:"b".repeat(64),claimsDigest:"c".repeat(64),issuedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+60_000).toISOString()});
    const policy=await kernelA.executionFabric.consequenceAlgebra.getPolicy();await kernelA.executionFabric.consequenceAlgebra.putPolicy(policy);
    await kernelA.executionFabric.authorityTransactions.health();
    for(const key of Object.values(SQL_TRUSTED_STATE_KEYS))expect(await backend.readState(key)).not.toBeNull();
    const firstFence=persistenceA.health().fenceToken;expect(firstFence).not.toBeNull();
    await kernelA.close();await persistenceA.close();

    const dirB=await dir(),kernelB=new CieavAgentKernelStore(path.join(dirB,"kernel.json"),secret),persistenceB=new CieavSqlServerTrustedStatePersistence(backend,"authority-node-b");
    const candidate=await createSqlServerTrustedKernelCandidate({kernel:kernelB,persistence:persistenceB});
    const secondFence=persistenceB.health().fenceToken;expect(BigInt(secondFence!)).toBeGreaterThan(BigInt(firstFence!));
    expect((await kernelB.get(created.task.id))?.goal).toBe(create.goal);
    expect((await kernelB.intentReality.listQuarantines()).find(q=>q.id===quarantine.id)?.status).toBe("OPEN");
    expect((await kernelB.executionFabric.listAttestations()).some(a=>a.subjectId==="agent-1")).toBe(true);
    expect((await kernelB.executionFabric.consequenceAlgebra.listAudit()).some(a=>a.type==="POLICY_CHANGED")).toBe(true);
    expect((await kernelB.executionFabric.authorityTransactions.health()).localFencingOnly).toBe(true);
    expect(candidate.migration.health()).toMatchObject({trustedStoresMigrated:true,startupInitializationBarrier:true,replicatedAuthorityJournal:true,sqlServerAuthoritative:true,localFilesAuthoritative:false,recoverablyAtomicCrossStoreTransactions:true,singleTransactionCrossStoreCommit:false,clusterHaQualified:false,authority:false,mayMintExecutionAuthority:false,executionAuthorityIssued:false});
    await kernelB.close();await persistenceB.close();
  });

  it("fails the attached process closed after a SQL CAS revision conflict",async()=>{
    const database=new MemorySqlAuthorityDatabase(),backend=new CieavSqlServerAuthorityStateBackend(database,"cluster-cas-test",10_000),dirA=await dir(),kernel=new CieavAgentKernelStore(path.join(dirA,"kernel.json"),secret),persistence=new CieavSqlServerTrustedStatePersistence(backend,"authority-node-a");
    await createSqlServerTrustedKernelCandidate({kernel,persistence});
    await kernel.create(create);
    const current=await backend.readState(SQL_TRUSTED_STATE_KEYS.kernel);expect(current).not.toBeNull();
    const live=database.leases.get("cluster-cas-test");if(!live)throw new Error("missing live SQL writer lease");
    await backend.writeTransaction("external-conflict-001",{ownerId:live.ownerId,fenceToken:live.fenceToken,leaseUntilMs:live.leaseUntilMs},[{key:SQL_TRUSTED_STATE_KEYS.kernel,expectedRevision:current!.revision,value:current!.value}]);
    await expect(kernel.create({...create,goal:"stale revision must fail"})).rejects.toThrow(/persistence fault|revision_conflict/i);
    await expect(kernel.create({...create,goal:"must stay failed closed"})).rejects.toThrow(/persistence fault/i);
    await kernel.close();await persistence.close();
  });
});
