import crypto from "node:crypto";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {CieavAgentKernelStore} from "./agent-kernel.js";
import {CieavSqlServerAuthorityStateBackend,type AuthorityClusterLease,type AuthorityClusterStateRecord,type AuthorityClusterStateWrite} from "./authority-cluster-sqlserver.js";

export const SQL_TRUSTED_STATE_KEYS={
  kernel:"trusted/agent-kernel/v1",
  intentReality:"trusted/intent-reality/v1",
  executionFabric:"trusted/execution-fabric/v1",
  consequenceAlgebra:"trusted/consequence-algebra/v2",
  authorityTransactions:"trusted/authority-transactions/v1"
} as const;

export type SqlTrustedStateKey=typeof SQL_TRUSTED_STATE_KEYS[keyof typeof SQL_TRUSTED_STATE_KEYS];

const ownerPattern=/^[A-Za-z0-9._:-]{8,200}$/;
const txId=(key:string)=>`state-${crypto.createHash("sha256").update(key).digest("hex").slice(0,16)}-${crypto.randomUUID()}`;

export class CieavSqlServerTrustedStatePersistence {
  private lease:AuthorityClusterLease|null=null;
  private closed=false;
  private fatalFault:Error|null=null;
  private chain:Promise<void>=Promise.resolve();
  private heartbeat:NodeJS.Timeout|null=null;

  constructor(readonly backend:CieavSqlServerAuthorityStateBackend,readonly ownerId:string){
    if(!ownerPattern.test(ownerId))throw new Error("CIEAV SQL trusted-state owner id must be 8-200 safe identifier characters");
  }

  async start(){
    if(this.closed)throw new Error("CIEAV SQL trusted-state persistence is closed");
    if(this.fatalFault)throw this.fatalFault;
    if(this.lease)return this.health();
    await this.backend.initialize();
    this.lease=await this.backend.acquireWriterLease(this.ownerId);
    const interval=Math.max(1000,Math.floor(this.backend.defaultLeaseMs/3));
    this.heartbeat=setInterval(()=>{void this.verifyWriterLease().catch(()=>undefined)},interval);
    this.heartbeat.unref();
    return this.health();
  }

  private queue<T>(fn:()=>Promise<T>):Promise<T>{
    if(this.closed)return Promise.reject(new Error("CIEAV SQL trusted-state persistence is closed"));
    if(this.fatalFault)return Promise.reject(this.fatalFault);
    const task=this.chain.then(async()=>{if(this.fatalFault)throw this.fatalFault;return fn()});
    this.chain=task.then(()=>undefined,()=>undefined);
    return task;
  }

  private async renewLease(){
    if(!this.lease)throw new Error("CIEAV SQL trusted-state persistence is not started");
    try{this.lease=await this.backend.renewWriterLease(this.lease);return this.lease}catch(error){
      this.fatalFault=new Error(`CIEAV SQL trusted-state writer lease lost; process must restart before authority operations continue: ${error instanceof Error?error.message:String(error)}`);
      throw this.fatalFault;
    }
  }

  verifyWriterLease(){return this.queue(async()=>{await this.renewLease();return this.health()})}

  private withWriter<T>(fn:(lease:AuthorityClusterLease)=>Promise<T>):Promise<T>{
    return this.queue(async()=>{const lease=await this.renewLease();return fn(lease)});
  }

  read(key:SqlTrustedStateKey){
    if(this.closed)return Promise.reject(new Error("CIEAV SQL trusted-state persistence is closed"));
    if(this.fatalFault)return Promise.reject(this.fatalFault);
    if(!this.lease)return Promise.reject(new Error("CIEAV SQL trusted-state persistence is not started"));
    return this.backend.readState(key);
  }

  write(key:SqlTrustedStateKey,expectedRevision:string|null,value:string,transactionId=txId(key)){
    return this.withWriter(async lease=>(await this.backend.writeTransaction(transactionId,lease,[{key,expectedRevision,value}]))[0]!);
  }

  writeMany(transactionId:string,writes:Array<{key:SqlTrustedStateKey;expectedRevision:string|null;value:string}>){
    return this.withWriter(lease=>this.backend.writeTransaction(transactionId,lease,writes satisfies AuthorityClusterStateWrite[]));
  }

  health(){return{
    version:"CIEAV_SQLSERVER_TRUSTED_STATE_PERSISTENCE_HEALTH_V1" as const,
    backend:"sqlserver-ha-v1" as const,
    namespace:this.backend.namespace,
    ownerId:this.ownerId,
    started:Boolean(this.lease)&&!this.closed,
    fenceToken:this.lease?.fenceToken??null,
    leaseHeartbeatActive:Boolean(this.heartbeat)&&!this.closed,
    leaseHealthy:Boolean(this.lease)&&!this.closed&&!this.fatalFault,
    fatalFault:this.fatalFault?.message??null,
    trustedStateKeys:Object.values(SQL_TRUSTED_STATE_KEYS),
    replicatedAuthorityJournal:true,
    sqlServerAuthoritative:true,
    localFilesAuthoritative:false,
    recoverablyAtomicCrossStoreTransactions:true,
    singleTransactionCrossStoreCommit:false,
    externalFailoverQualified:false,
    clusterHaQualified:false,
    authority:false as const,
    mayMintExecutionAuthority:false as const,
    executionAuthorityIssued:false as const
  }}

  async close(){
    if(this.heartbeat){clearInterval(this.heartbeat);this.heartbeat=null}
    await this.chain.catch(()=>undefined);
    if(this.closed)return;
    this.closed=true;
    const lease=this.lease;this.lease=null;
    if(lease){try{await this.backend.releaseWriterLease(lease)}catch{}}
    await this.backend.close();
  }
}

type PatchableStore={file:string;loaded:boolean;load:()=>Promise<void>;persist:()=>Promise<void>};
type AttachedStore={key:SqlTrustedStateKey;revision:string|null;fault:Error|null;initialize:()=>Promise<void>};
const attachedStores=new WeakSet<object>();

function assertPatchable(value:unknown,label:string):PatchableStore{
  const store=value as Partial<PatchableStore>;
  if(!store||typeof store!=="object"||typeof store.file!=="string"||typeof store.load!=="function"||typeof store.persist!=="function")throw new Error(`CIEAV SQL trusted-state migration cannot attach ${label}`);
  return store as PatchableStore;
}

async function stage<T>(prefix:string,fn:(file:string)=>Promise<T>){
  const dir=await mkdtemp(path.join(os.tmpdir(),`cieav-sql-${prefix}-`)),file=path.join(dir,"state.json");
  try{return await fn(file)}finally{await rm(dir,{recursive:true,force:true})}
}

async function readLocalIfPresent(file:string){try{return await readFile(file,"utf8")}catch(error){const code=typeof error==="object"&&error!==null?String((error as {code?:unknown}).code??""):"";if(code==="ENOENT")return null;throw error}}

function attachStore(storeValue:unknown,key:SqlTrustedStateKey,persistence:CieavSqlServerTrustedStatePersistence,label:string){
  const store=assertPatchable(storeValue,label);
  if(attachedStores.has(store))throw new Error(`CIEAV SQL trusted-state migration already attached ${label}`);
  attachedStores.add(store);
  const originalFile=store.file,originalLoad=store.load.bind(store),originalPersist=store.persist.bind(store);
  const state:AttachedStore={key,revision:null,fault:null,initialize:async()=>store.load()};

  store.load=async()=>{
    if(state.fault)throw state.fault;
    if(store.loaded)return;
    const record=await persistence.read(key),local=record?null:await readLocalIfPresent(originalFile);
    state.revision=record?.revision??null;
    await stage(label.replace(/[^a-z0-9]+/gi,"-").toLowerCase(),async staged=>{
      const source=record?.value??local;
      if(source!==null)await writeFile(staged,source,{encoding:"utf8",mode:0o600,flag:"wx"});
      store.file=staged;
      try{await originalLoad()}finally{store.file=originalFile}
    });
    if(state.revision===null)await store.persist();
  };

  store.persist=async()=>{
    if(state.fault)throw state.fault;
    let contents="";
    await stage(label.replace(/[^a-z0-9]+/gi,"-").toLowerCase(),async staged=>{
      store.file=staged;
      try{await originalPersist();contents=await readFile(staged,"utf8")}finally{store.file=originalFile}
    });
    try{
      const committed=await persistence.write(key,state.revision,contents);
      state.revision=committed.revision;
    }catch(error){
      state.fault=new Error(`CIEAV SQL trusted-state persistence fault for ${label}; process must restart before authority operations continue: ${error instanceof Error?error.message:String(error)}`);
      throw state.fault;
    }
  };

  return state;
}

export function attachSqlServerTrustedState(kernel:CieavAgentKernelStore,persistence:CieavSqlServerTrustedStatePersistence){
  const raw=kernel as unknown as Record<string,unknown>,fabric=raw.executionFabric as Record<string,unknown>;
  const kernelState=attachStore(kernel,SQL_TRUSTED_STATE_KEYS.kernel,persistence,"agent-kernel");
  const intentRealityState=attachStore(raw.intentReality,SQL_TRUSTED_STATE_KEYS.intentReality,persistence,"intent-reality");
  const executionFabricState=attachStore(fabric,SQL_TRUSTED_STATE_KEYS.executionFabric,persistence,"execution-fabric");
  const consequenceAlgebraState=attachStore(fabric.consequenceAlgebra,SQL_TRUSTED_STATE_KEYS.consequenceAlgebra,persistence,"consequence-algebra");
  const authorityTransactionsState=attachStore(fabric.authorityTransactions,SQL_TRUSTED_STATE_KEYS.authorityTransactions,persistence,"authority-transactions");
  const states=[kernelState,intentRealityState,executionFabricState,consequenceAlgebraState,authorityTransactionsState];
  const startupOrder=[kernelState,intentRealityState,consequenceAlgebraState,authorityTransactionsState,executionFabricState];
  return{
    states,
    initializeAll:async()=>{for(const state of startupOrder)await state.initialize();return states},
    health:()=>({
      version:"CIEAV_SQLSERVER_TRUSTED_STATE_MIGRATION_HEALTH_V1" as const,
      stores:states.map(state=>({key:state.key,revision:state.revision,fault:state.fault?.message??null})),
      trustedStoresMigrated:true,
      startupInitializationBarrier:true,
      replicatedAuthorityJournal:true,
      sqlServerAuthoritative:true,
      localFilesAuthoritative:false,
      recoverablyAtomicCrossStoreTransactions:true,
      singleTransactionCrossStoreCommit:false,
      externalFailoverQualified:false,
      networkPartitionTested:false,
      clusterHaQualified:false,
      authority:false as const,
      mayMintExecutionAuthority:false as const,
      executionAuthorityIssued:false as const
    })
  };
}

export async function createSqlServerTrustedKernelCandidate(input:{kernel:CieavAgentKernelStore;persistence:CieavSqlServerTrustedStatePersistence}){
  await input.persistence.start();
  const migration=attachSqlServerTrustedState(input.kernel,input.persistence);
  await migration.initializeAll();
  await input.kernel.recoverOnStartup();
  return{kernel:input.kernel,persistence:input.persistence,migration};
}

export type {AuthorityClusterStateRecord};
