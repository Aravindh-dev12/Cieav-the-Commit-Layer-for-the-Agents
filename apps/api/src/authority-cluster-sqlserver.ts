import crypto from "node:crypto";

const sha256=(value:string)=>crypto.createHash("sha256").update(value).digest("hex");
const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value as Record<string,unknown>).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(",")}}`:JSON.stringify(value)??"undefined";
const idPattern=/^[A-Za-z0-9._:-]{8,200}$/;
const keyPattern=/^[A-Za-z0-9._:/-]{1,300}$/;
const counter=(value:string,name:string)=>{if(!/^\d+$/.test(value))throw new Error(`${name} is not an unsigned integer`);return BigInt(value)};
const boundedInt=(raw:string|undefined,name:string,fallback:number,min:number,max:number)=>{const value=Number(raw??fallback);if(!Number.isInteger(value)||value<min||value>max)throw new Error(`${name} must be an integer between ${min} and ${max}`);return value};

export interface AuthorityClusterLease {ownerId:string;fenceToken:string;leaseUntilMs:number}
export interface AuthorityClusterStateRecord {key:string;revision:string;value:string;valueDigest:string;fenceToken:string;updatedAtMs:number}
export interface AuthorityClusterStateWrite {key:string;expectedRevision:string|null;value:string}

type LeaseRow={namespace:string;ownerId:string;fenceToken:string;leaseUntilMs:number};
type StateRow={namespace:string;key:string;revision:string;value:string;valueDigest:string;fenceToken:string;updatedAtMs:number};
type ReceiptRow={namespace:string;transactionId:string;requestDigest:string;resultJson:string;committedAtMs:number};

export interface AuthorityClusterTransaction {
  nowMs():Promise<number>;
  getLeaseForUpdate(namespace:string):Promise<LeaseRow|null>;
  putLease(row:LeaseRow):Promise<void>;
  getStateForUpdate(namespace:string,key:string):Promise<StateRow|null>;
  getState(namespace:string,key:string):Promise<StateRow|null>;
  putState(row:StateRow):Promise<void>;
  getReceipt(namespace:string,transactionId:string):Promise<ReceiptRow|null>;
  putReceipt(row:ReceiptRow):Promise<void>;
}

export interface AuthorityClusterDatabase {
  initialize():Promise<void>;
  serializable<T>(fn:(tx:AuthorityClusterTransaction)=>Promise<T>):Promise<T>;
  read<T>(fn:(tx:AuthorityClusterTransaction)=>Promise<T>):Promise<T>;
  close?():Promise<void>;
}

export class CieavSqlServerAuthorityStateBackend {
  constructor(private readonly database:AuthorityClusterDatabase,readonly namespace:string,readonly defaultLeaseMs=15000){
    if(!idPattern.test(namespace))throw new Error("CIEAV authority cluster namespace must be 8-200 safe identifier characters");
    if(!Number.isInteger(defaultLeaseMs)||defaultLeaseMs<5000||defaultLeaseMs>120000)throw new Error("CIEAV authority cluster lease must be 5000-120000ms");
  }
  initialize(){return this.database.initialize()}
  acquireWriterLease(ownerId:string,ttlMs=this.defaultLeaseMs){
    if(!idPattern.test(ownerId))throw new Error("CIEAV authority writer owner id must be 8-200 safe identifier characters");
    if(!Number.isInteger(ttlMs)||ttlMs<5000||ttlMs>120000)throw new Error("CIEAV authority writer lease must be 5000-120000ms");
    return this.database.serializable(async tx=>{const now=await tx.nowMs(),current=await tx.getLeaseForUpdate(this.namespace);if(current&&current.ownerId!==ownerId&&current.leaseUntilMs>now)throw new Error(`authority_cluster_writer_lease_held:${current.ownerId}`);const fenceToken=(counter(current?.fenceToken??"0","authority fence token")+1n).toString(),lease:LeaseRow={namespace:this.namespace,ownerId,fenceToken,leaseUntilMs:now+ttlMs};await tx.putLease(lease);return{ownerId:lease.ownerId,fenceToken:lease.fenceToken,leaseUntilMs:lease.leaseUntilMs}});
  }
  renewWriterLease(lease:AuthorityClusterLease,ttlMs=this.defaultLeaseMs){
    if(!Number.isInteger(ttlMs)||ttlMs<5000||ttlMs>120000)throw new Error("CIEAV authority writer lease must be 5000-120000ms");
    return this.database.serializable(async tx=>{const now=await tx.nowMs(),current=await tx.getLeaseForUpdate(this.namespace);if(!current||current.ownerId!==lease.ownerId||current.fenceToken!==lease.fenceToken||current.leaseUntilMs<=now)throw new Error("authority_cluster_writer_lease_lost");const renewed:LeaseRow={...current,leaseUntilMs:now+ttlMs};await tx.putLease(renewed);return{ownerId:renewed.ownerId,fenceToken:renewed.fenceToken,leaseUntilMs:renewed.leaseUntilMs}});
  }
  releaseWriterLease(lease:AuthorityClusterLease){return this.database.serializable(async tx=>{const now=await tx.nowMs(),current=await tx.getLeaseForUpdate(this.namespace);if(!current||current.ownerId!==lease.ownerId||current.fenceToken!==lease.fenceToken)throw new Error("authority_cluster_writer_lease_lost");await tx.putLease({...current,leaseUntilMs:now});return true})}
  readState(key:string){if(!keyPattern.test(key))throw new Error("authority cluster state key is invalid");return this.database.read(async tx=>{const row=await tx.getState(this.namespace,key);if(!row)return null;if(row.valueDigest!==sha256(row.value))throw new Error(`authority_cluster_state_digest_mismatch:${key}`);return{key:row.key,revision:row.revision,value:row.value,valueDigest:row.valueDigest,fenceToken:row.fenceToken,updatedAtMs:row.updatedAtMs}})}
  writeTransaction(transactionId:string,lease:AuthorityClusterLease,writes:AuthorityClusterStateWrite[]){
    if(!idPattern.test(transactionId))throw new Error("authority cluster transaction id is invalid");
    if(!writes.length||writes.length>128)throw new Error("authority cluster transaction requires 1-128 writes");
    const normalized=writes.map(write=>{if(!keyPattern.test(write.key))throw new Error(`authority cluster state key is invalid:${write.key}`);if(write.expectedRevision!==null)counter(write.expectedRevision,"authority expected revision");if(Buffer.byteLength(write.value,"utf8")>16*1024*1024)throw new Error(`authority cluster state value exceeds 16MiB:${write.key}`);return{...write,valueDigest:sha256(write.value)}}).sort((a,b)=>a.key.localeCompare(b.key));
    for(let i=1;i<normalized.length;i++)if(normalized[i-1]!.key===normalized[i]!.key)throw new Error(`authority cluster transaction contains duplicate key:${normalized[i]!.key}`);
    const requestDigest=sha256(canonical({version:1,namespace:this.namespace,transactionId,ownerId:lease.ownerId,fenceToken:lease.fenceToken,writes:normalized.map(({key,expectedRevision,valueDigest})=>({key,expectedRevision,valueDigest}))}));
    return this.database.serializable(async tx=>{
      const receipt=await tx.getReceipt(this.namespace,transactionId);if(receipt){if(receipt.requestDigest!==requestDigest)throw new Error("authority_cluster_transaction_idempotency_conflict");const parsed=JSON.parse(receipt.resultJson) as AuthorityClusterStateRecord[];for(const record of parsed)if(record.valueDigest!==sha256(record.value))throw new Error("authority_cluster_transaction_receipt_corrupt");return parsed}
      const now=await tx.nowMs(),currentLease=await tx.getLeaseForUpdate(this.namespace);if(!currentLease||currentLease.ownerId!==lease.ownerId||currentLease.fenceToken!==lease.fenceToken||currentLease.leaseUntilMs<=now)throw new Error("authority_cluster_writer_fenced");
      const currentRows=new Map<string,StateRow|null>();for(const write of normalized){const current=await tx.getStateForUpdate(this.namespace,write.key);currentRows.set(write.key,current);const actual=current?.revision??null;if(actual!==write.expectedRevision)throw new Error(`authority_cluster_revision_conflict:${write.key}:expected=${write.expectedRevision??"none"}:actual=${actual??"none"}`)}
      const result:AuthorityClusterStateRecord[]=[];for(const write of normalized){const current=currentRows.get(write.key)??null,revision=(counter(current?.revision??"0","authority revision")+1n).toString(),row:StateRow={namespace:this.namespace,key:write.key,revision,value:write.value,valueDigest:write.valueDigest,fenceToken:lease.fenceToken,updatedAtMs:now};await tx.putState(row);result.push({key:row.key,revision:row.revision,value:row.value,valueDigest:row.valueDigest,fenceToken:row.fenceToken,updatedAtMs:row.updatedAtMs})}
      await tx.putReceipt({namespace:this.namespace,transactionId,requestDigest,resultJson:JSON.stringify(result),committedAtMs:now});return result;
    });
  }
  health(){return{version:"CIEAV_SQLSERVER_AUTHORITY_STATE_HEALTH_V1" as const,backend:"sqlserver-ha-v1" as const,namespace:this.namespace,serializableTransactions:true,multiKeyAtomicCas:true,monotonicFencing:true,databaseClockLeases:true,idempotentCommitRecovery:true,encryptedConnectionRequired:true,replicationQualificationRequired:true,clusterHaQualified:false,authority:false as const,mayMintExecutionAuthority:false as const,executionAuthorityIssued:false as const}}
  async close(){await this.database.close?.()}
}

type SqlRecordset=Array<Record<string,unknown>>;
export interface SqlServerRequestLike {input(name:string,value:unknown):SqlServerRequestLike;query(text:string):Promise<{recordset?:SqlRecordset;rowsAffected?:number[]}>}
export interface SqlServerTransactionLike {begin(isolation?:unknown):Promise<void>;commit():Promise<void>;rollback():Promise<void>;request():SqlServerRequestLike}
export interface SqlServerPoolLike {connect():Promise<unknown>;request():SqlServerRequestLike;close?():Promise<void>}
export interface SqlServerDriverLike {ConnectionPool:new(config:Record<string,unknown>)=>SqlServerPoolLike;Transaction:new(pool:SqlServerPoolLike)=>SqlServerTransactionLike;ISOLATION_LEVEL?:{SERIALIZABLE?:unknown};TYPES?:Record<string,unknown>}

const text=(row:Record<string,unknown>,key:string)=>{const value=row[key];if(typeof value!=="string"&&typeof value!=="number"&&typeof value!=="bigint")throw new Error(`SQL Server authority row missing ${key}`);return String(value)};
const intMs=(row:Record<string,unknown>,key:string)=>{const value=Number(text(row,key));if(!Number.isSafeInteger(value)||value<0)throw new Error(`SQL Server authority row invalid ${key}`);return value};
const retryableSqlServerError=(error:unknown)=>{const code=typeof error==="object"&&error!==null?String((error as {code?:unknown}).code??""):"",number=typeof error==="object"&&error!==null?Number((error as {number?:unknown}).number):NaN;return code==="EREQUEST"&&[1205,3960].includes(number)||["ETIMEOUT","ESOCKET","ECONNCLOSED","ENOTOPEN"].includes(code)};
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

class SqlServerAuthorityTransaction implements AuthorityClusterTransaction {
  constructor(private readonly requestFactory:()=>SqlServerRequestLike){}
  async nowMs(){const r=await this.requestFactory().query("SELECT DATEDIFF_BIG(MILLISECOND, CONVERT(datetime2,'1970-01-01T00:00:00'), SYSUTCDATETIME()) AS now_ms");return intMs(r.recordset?.[0]??{},"now_ms")}
  async getLeaseForUpdate(namespace:string){const req=this.requestFactory().input("namespace",namespace),r=await req.query("SELECT namespace,owner_id,fence_token,lease_until_ms FROM dbo.cieav_authority_lease_v1 WITH (UPDLOCK,HOLDLOCK) WHERE namespace=@namespace");const row=r.recordset?.[0];return row?{namespace:text(row,"namespace"),ownerId:text(row,"owner_id"),fenceToken:text(row,"fence_token"),leaseUntilMs:intMs(row,"lease_until_ms")}:null}
  async putLease(row:LeaseRow){const req=this.requestFactory().input("namespace",row.namespace).input("owner_id",row.ownerId).input("fence_token",row.fenceToken).input("lease_until_ms",String(row.leaseUntilMs));await req.query("IF EXISTS(SELECT 1 FROM dbo.cieav_authority_lease_v1 WITH (UPDLOCK,HOLDLOCK) WHERE namespace=@namespace) UPDATE dbo.cieav_authority_lease_v1 SET owner_id=@owner_id,fence_token=CONVERT(bigint,@fence_token),lease_until_ms=CONVERT(bigint,@lease_until_ms),updated_at=SYSUTCDATETIME() WHERE namespace=@namespace ELSE INSERT dbo.cieav_authority_lease_v1(namespace,owner_id,fence_token,lease_until_ms,updated_at) VALUES(@namespace,@owner_id,CONVERT(bigint,@fence_token),CONVERT(bigint,@lease_until_ms),SYSUTCDATETIME())")}
  async getStateForUpdate(namespace:string,key:string){const req=this.requestFactory().input("namespace",namespace).input("state_key",key),r=await req.query("SELECT namespace,state_key,revision,value_text,value_digest,fence_token,DATEDIFF_BIG(MILLISECOND,CONVERT(datetime2,'1970-01-01T00:00:00'),updated_at) AS updated_at_ms FROM dbo.cieav_authority_state_v1 WITH (UPDLOCK,HOLDLOCK) WHERE namespace=@namespace AND state_key=@state_key");return this.state(r.recordset?.[0])}
  async getState(namespace:string,key:string){const req=this.requestFactory().input("namespace",namespace).input("state_key",key),r=await req.query("SELECT namespace,state_key,revision,value_text,value_digest,fence_token,DATEDIFF_BIG(MILLISECOND,CONVERT(datetime2,'1970-01-01T00:00:00'),updated_at) AS updated_at_ms FROM dbo.cieav_authority_state_v1 WHERE namespace=@namespace AND state_key=@state_key");return this.state(r.recordset?.[0])}
  private state(row:Record<string,unknown>|undefined):StateRow|null{return row?{namespace:text(row,"namespace"),key:text(row,"state_key"),revision:text(row,"revision"),value:text(row,"value_text"),valueDigest:text(row,"value_digest"),fenceToken:text(row,"fence_token"),updatedAtMs:intMs(row,"updated_at_ms")}:null}
  async putState(row:StateRow){const req=this.requestFactory().input("namespace",row.namespace).input("state_key",row.key).input("revision",row.revision).input("value_text",row.value).input("value_digest",row.valueDigest).input("fence_token",row.fenceToken);await req.query("IF EXISTS(SELECT 1 FROM dbo.cieav_authority_state_v1 WITH (UPDLOCK,HOLDLOCK) WHERE namespace=@namespace AND state_key=@state_key) UPDATE dbo.cieav_authority_state_v1 SET revision=CONVERT(bigint,@revision),value_text=@value_text,value_digest=@value_digest,fence_token=CONVERT(bigint,@fence_token),updated_at=SYSUTCDATETIME() WHERE namespace=@namespace AND state_key=@state_key ELSE INSERT dbo.cieav_authority_state_v1(namespace,state_key,revision,value_text,value_digest,fence_token,updated_at) VALUES(@namespace,@state_key,CONVERT(bigint,@revision),@value_text,@value_digest,CONVERT(bigint,@fence_token),SYSUTCDATETIME())")}
  async getReceipt(namespace:string,transactionId:string){const req=this.requestFactory().input("namespace",namespace).input("transaction_id",transactionId),r=await req.query("SELECT namespace,transaction_id,request_digest,result_json,DATEDIFF_BIG(MILLISECOND,CONVERT(datetime2,'1970-01-01T00:00:00'),committed_at) AS committed_at_ms FROM dbo.cieav_authority_tx_v1 WITH (UPDLOCK,HOLDLOCK) WHERE namespace=@namespace AND transaction_id=@transaction_id");const row=r.recordset?.[0];return row?{namespace:text(row,"namespace"),transactionId:text(row,"transaction_id"),requestDigest:text(row,"request_digest"),resultJson:text(row,"result_json"),committedAtMs:intMs(row,"committed_at_ms")}:null}
  async putReceipt(row:ReceiptRow){const req=this.requestFactory().input("namespace",row.namespace).input("transaction_id",row.transactionId).input("request_digest",row.requestDigest).input("result_json",row.resultJson);await req.query("INSERT dbo.cieav_authority_tx_v1(namespace,transaction_id,request_digest,result_json,committed_at) VALUES(@namespace,@transaction_id,@request_digest,@result_json,SYSUTCDATETIME())")}
}

export class SqlServerAuthorityClusterDatabase implements AuthorityClusterDatabase {
  constructor(private readonly pool:SqlServerPoolLike,private readonly driver:SqlServerDriverLike,private readonly transactionRetries=5){if(!Number.isInteger(transactionRetries)||transactionRetries<1||transactionRetries>10)throw new Error("SQL Server authority transaction retries must be 1-10")}
  async initialize(){await this.pool.connect();const tx=new this.driver.Transaction(this.pool);await tx.begin(this.driver.ISOLATION_LEVEL?.SERIALIZABLE);try{const req=tx.request();await req.query("DECLARE @rc int; EXEC @rc=sys.sp_getapplock @Resource=N'CIEAV_AUTHORITY_SCHEMA_V1',@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=5000; IF @rc<0 THROW 51000,'CIEAV authority schema lock unavailable',1; IF OBJECT_ID(N'dbo.cieav_authority_meta_v1',N'U') IS NULL CREATE TABLE dbo.cieav_authority_meta_v1(singleton bit NOT NULL PRIMARY KEY CHECK(singleton=1),schema_version int NOT NULL CHECK(schema_version=1),created_at datetime2(7) NOT NULL DEFAULT SYSUTCDATETIME()); IF NOT EXISTS(SELECT 1 FROM dbo.cieav_authority_meta_v1 WITH (UPDLOCK,HOLDLOCK) WHERE singleton=1) INSERT dbo.cieav_authority_meta_v1(singleton,schema_version) VALUES(1,1); IF OBJECT_ID(N'dbo.cieav_authority_lease_v1',N'U') IS NULL CREATE TABLE dbo.cieav_authority_lease_v1(namespace nvarchar(200) NOT NULL PRIMARY KEY,owner_id nvarchar(200) NOT NULL,fence_token bigint NOT NULL CHECK(fence_token>0),lease_until_ms bigint NOT NULL CHECK(lease_until_ms>=0),updated_at datetime2(7) NOT NULL DEFAULT SYSUTCDATETIME()); IF OBJECT_ID(N'dbo.cieav_authority_state_v1',N'U') IS NULL CREATE TABLE dbo.cieav_authority_state_v1(namespace nvarchar(200) NOT NULL,state_key nvarchar(300) NOT NULL,revision bigint NOT NULL CHECK(revision>0),value_text nvarchar(max) NOT NULL,value_digest char(64) NOT NULL,fence_token bigint NOT NULL CHECK(fence_token>0),updated_at datetime2(7) NOT NULL DEFAULT SYSUTCDATETIME(),CONSTRAINT PK_cieav_authority_state_v1 PRIMARY KEY(namespace,state_key)); IF OBJECT_ID(N'dbo.cieav_authority_tx_v1',N'U') IS NULL CREATE TABLE dbo.cieav_authority_tx_v1(namespace nvarchar(200) NOT NULL,transaction_id nvarchar(200) NOT NULL,request_digest char(64) NOT NULL,result_json nvarchar(max) NOT NULL,committed_at datetime2(7) NOT NULL DEFAULT SYSUTCDATETIME(),CONSTRAINT PK_cieav_authority_tx_v1 PRIMARY KEY(namespace,transaction_id)); IF (SELECT schema_version FROM dbo.cieav_authority_meta_v1 WITH (UPDLOCK,HOLDLOCK) WHERE singleton=1)<>1 THROW 51001,'Unsupported CIEAV SQL Server authority schema version',1;");await tx.commit()}catch(error){try{await tx.rollback()}catch{}throw error}}
  async serializable<T>(fn:(tx:AuthorityClusterTransaction)=>Promise<T>):Promise<T>{let last:unknown;for(let attempt=0;attempt<this.transactionRetries;attempt++){const tx=new this.driver.Transaction(this.pool);try{await tx.begin(this.driver.ISOLATION_LEVEL?.SERIALIZABLE);const value=await fn(new SqlServerAuthorityTransaction(()=>tx.request()));await tx.commit();return value}catch(error){last=error;try{await tx.rollback()}catch{}if(!retryableSqlServerError(error)||attempt===this.transactionRetries-1)throw error;await delay(Math.min(250,10*(2**attempt))+crypto.randomInt(0,10))}}throw last instanceof Error?last:new Error("SQL Server authority transaction retry exhausted")}
  async read<T>(fn:(tx:AuthorityClusterTransaction)=>Promise<T>):Promise<T>{const tx=new this.driver.Transaction(this.pool);try{await tx.begin();const value=await fn(new SqlServerAuthorityTransaction(()=>tx.request()));await tx.commit();return value}catch(error){try{await tx.rollback()}catch{}throw error}}
  async close(){await this.pool.close?.()}
}

export interface SqlServerAuthorityClusterConfig {server:string;database:string;user:string;password:string;port:number;namespace:string;leaseMs:number;transactionRetries:number;poolMax:number}
export function loadSqlServerAuthorityClusterConfig(env:NodeJS.ProcessEnv=process.env):SqlServerAuthorityClusterConfig{
  const server=String(env.CIEAV_AUTHORITY_SQL_SERVER??"").trim(),database=String(env.CIEAV_AUTHORITY_SQL_DATABASE??"").trim(),user=String(env.CIEAV_AUTHORITY_SQL_USER??"").trim(),password=String(env.CIEAV_AUTHORITY_SQL_PASSWORD??"");
  if(!server)throw new Error("sqlserver-ha-v1 requires CIEAV_AUTHORITY_SQL_SERVER");if(!database)throw new Error("sqlserver-ha-v1 requires CIEAV_AUTHORITY_SQL_DATABASE");if(!user)throw new Error("sqlserver-ha-v1 requires CIEAV_AUTHORITY_SQL_USER");if(!password||password.length<12)throw new Error("sqlserver-ha-v1 requires a strong CIEAV_AUTHORITY_SQL_PASSWORD from the secret manager");
  const namespace=String(env.CIEAV_AUTHORITY_CLUSTER_NAMESPACE??"").trim();if(!idPattern.test(namespace))throw new Error("sqlserver-ha-v1 requires CIEAV_AUTHORITY_CLUSTER_NAMESPACE with 8-200 safe identifier characters");
  return{server,database,user,password,port:boundedInt(env.CIEAV_AUTHORITY_SQL_PORT,"CIEAV_AUTHORITY_SQL_PORT",1433,1,65535),namespace,leaseMs:boundedInt(env.CIEAV_AUTHORITY_CLUSTER_LEASE_MS,"CIEAV_AUTHORITY_CLUSTER_LEASE_MS",15000,5000,120000),transactionRetries:boundedInt(env.CIEAV_AUTHORITY_CLUSTER_TX_RETRIES,"CIEAV_AUTHORITY_CLUSTER_TX_RETRIES",5,1,10),poolMax:boundedInt(env.CIEAV_AUTHORITY_SQL_POOL_MAX,"CIEAV_AUTHORITY_SQL_POOL_MAX",8,2,64)};
}

export async function createSqlServerAuthorityStateBackendFromEnv(env:NodeJS.ProcessEnv=process.env){
  const config=loadSqlServerAuthorityClusterConfig(env),moduleName="mssql";let loaded:unknown;try{loaded=await import(moduleName)}catch(error){throw new Error(`CIEAV sqlserver-ha-v1 requires the qualified mssql runtime driver: ${error instanceof Error?error.message:String(error)}`)}
  const module=loaded as SqlServerDriverLike&{default?:SqlServerDriverLike},driver=(module.ConnectionPool?module:module.default) as SqlServerDriverLike|undefined;if(!driver?.ConnectionPool||!driver.Transaction)throw new Error("CIEAV sqlserver-ha-v1 mssql runtime driver is invalid");
  const pool=new driver.ConnectionPool({server:config.server,port:config.port,database:config.database,user:config.user,password:config.password,options:{encrypt:true,trustServerCertificate:false,enableArithAbort:true},pool:{max:config.poolMax,min:0,idleTimeoutMillis:30000},connectionTimeout:5000,requestTimeout:10000});
  const database=new SqlServerAuthorityClusterDatabase(pool,driver,config.transactionRetries),backend=new CieavSqlServerAuthorityStateBackend(database,config.namespace,config.leaseMs);await backend.initialize();return backend;
}
