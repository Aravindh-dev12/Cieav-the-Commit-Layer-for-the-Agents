import crypto from "node:crypto";

const sha256=(value:string)=>crypto.createHash("sha256").update(value).digest("hex");
const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value as Record<string,unknown>).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(",")}}`:JSON.stringify(value)??"undefined";
const idPattern=/^[A-Za-z0-9._:-]{8,200}$/;
const keyPattern=/^[A-Za-z0-9._:/-]{1,300}$/;
const counter=(value:string,name:string)=>{if(!/^\d+$/.test(value))throw new Error(`${name} is not an unsigned integer`);return BigInt(value)};
const boundedInt=(raw:string|undefined,name:string,fallback:number,min:number,max:number)=>{const value=Number(raw??fallback);if(!Number.isInteger(value)||value<min||value>max)throw new Error(`${name} must be an integer between ${min} and ${max}`);return value};

export interface AuthorityClusterLease {
  ownerId:string;
  fenceToken:string;
  leaseUntilMs:number;
}

export interface AuthorityClusterStateRecord {
  key:string;
  revision:string;
  value:string;
  valueDigest:string;
  fenceToken:string;
  updatedAtMs:number;
}

export interface AuthorityClusterStateWrite {
  key:string;
  expectedRevision:string|null;
  value:string;
}

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

export class CieavPostgresAuthorityStateBackend {
  constructor(private readonly database:AuthorityClusterDatabase,readonly namespace:string,readonly defaultLeaseMs=15000){
    if(!idPattern.test(namespace))throw new Error("CIEAV authority cluster namespace must be 8-200 safe identifier characters");
    if(!Number.isInteger(defaultLeaseMs)||defaultLeaseMs<5000||defaultLeaseMs>120000)throw new Error("CIEAV authority cluster lease must be 5000-120000ms");
  }

  initialize(){return this.database.initialize()}

  acquireWriterLease(ownerId:string,ttlMs=this.defaultLeaseMs){
    if(!idPattern.test(ownerId))throw new Error("CIEAV authority writer owner id must be 8-200 safe identifier characters");
    if(!Number.isInteger(ttlMs)||ttlMs<5000||ttlMs>120000)throw new Error("CIEAV authority writer lease must be 5000-120000ms");
    return this.database.serializable(async tx=>{
      const now=await tx.nowMs(),current=await tx.getLeaseForUpdate(this.namespace);
      if(current&&current.ownerId!==ownerId&&current.leaseUntilMs>now)throw new Error(`authority_cluster_writer_lease_held:${current.ownerId}`);
      const fenceToken=(counter(current?.fenceToken??"0","authority fence token")+1n).toString(),lease:LeaseRow={namespace:this.namespace,ownerId,fenceToken,leaseUntilMs:now+ttlMs};
      await tx.putLease(lease);
      return{ownerId:lease.ownerId,fenceToken:lease.fenceToken,leaseUntilMs:lease.leaseUntilMs} satisfies AuthorityClusterLease;
    });
  }

  renewWriterLease(lease:AuthorityClusterLease,ttlMs=this.defaultLeaseMs){
    if(!Number.isInteger(ttlMs)||ttlMs<5000||ttlMs>120000)throw new Error("CIEAV authority writer lease must be 5000-120000ms");
    return this.database.serializable(async tx=>{
      const now=await tx.nowMs(),current=await tx.getLeaseForUpdate(this.namespace);
      if(!current||current.ownerId!==lease.ownerId||current.fenceToken!==lease.fenceToken||current.leaseUntilMs<=now)throw new Error("authority_cluster_writer_lease_lost");
      const renewed:LeaseRow={...current,leaseUntilMs:now+ttlMs};await tx.putLease(renewed);
      return{ownerId:renewed.ownerId,fenceToken:renewed.fenceToken,leaseUntilMs:renewed.leaseUntilMs} satisfies AuthorityClusterLease;
    });
  }

  releaseWriterLease(lease:AuthorityClusterLease){return this.database.serializable(async tx=>{
    const now=await tx.nowMs(),current=await tx.getLeaseForUpdate(this.namespace);
    if(!current||current.ownerId!==lease.ownerId||current.fenceToken!==lease.fenceToken)throw new Error("authority_cluster_writer_lease_lost");
    await tx.putLease({...current,leaseUntilMs:now});
    return true;
  })}

  readState(key:string){
    if(!keyPattern.test(key))throw new Error("authority cluster state key is invalid");
    return this.database.read(async tx=>{
      const row=await tx.getState(this.namespace,key);if(!row)return null;
      if(row.valueDigest!==sha256(row.value))throw new Error(`authority_cluster_state_digest_mismatch:${key}`);
      return{key:row.key,revision:row.revision,value:row.value,valueDigest:row.valueDigest,fenceToken:row.fenceToken,updatedAtMs:row.updatedAtMs} satisfies AuthorityClusterStateRecord;
    });
  }

  writeTransaction(transactionId:string,lease:AuthorityClusterLease,writes:AuthorityClusterStateWrite[]){
    if(!idPattern.test(transactionId))throw new Error("authority cluster transaction id is invalid");
    if(!writes.length||writes.length>128)throw new Error("authority cluster transaction requires 1-128 writes");
    const normalized=writes.map(write=>{
      if(!keyPattern.test(write.key))throw new Error(`authority cluster state key is invalid:${write.key}`);
      if(write.expectedRevision!==null)counter(write.expectedRevision,"authority expected revision");
      if(Buffer.byteLength(write.value,"utf8")>16*1024*1024)throw new Error(`authority cluster state value exceeds 16MiB:${write.key}`);
      return{...write,valueDigest:sha256(write.value)};
    }).sort((a,b)=>a.key.localeCompare(b.key));
    for(let i=1;i<normalized.length;i++)if(normalized[i-1]!.key===normalized[i]!.key)throw new Error(`authority cluster transaction contains duplicate key:${normalized[i]!.key}`);
    const requestDigest=sha256(canonical({version:1,namespace:this.namespace,transactionId,ownerId:lease.ownerId,fenceToken:lease.fenceToken,writes:normalized.map(({key,expectedRevision,valueDigest})=>({key,expectedRevision,valueDigest}))}));
    return this.database.serializable(async tx=>{
      const receipt=await tx.getReceipt(this.namespace,transactionId);
      if(receipt){
        if(receipt.requestDigest!==requestDigest)throw new Error("authority_cluster_transaction_idempotency_conflict");
        const parsed=JSON.parse(receipt.resultJson) as AuthorityClusterStateRecord[];
        for(const record of parsed)if(record.valueDigest!==sha256(record.value))throw new Error("authority_cluster_transaction_receipt_corrupt");
        return parsed;
      }
      const now=await tx.nowMs(),currentLease=await tx.getLeaseForUpdate(this.namespace);
      if(!currentLease||currentLease.ownerId!==lease.ownerId||currentLease.fenceToken!==lease.fenceToken||currentLease.leaseUntilMs<=now)throw new Error("authority_cluster_writer_fenced");
      const currentRows=new Map<string,StateRow|null>();
      for(const write of normalized){
        const current=await tx.getStateForUpdate(this.namespace,write.key);currentRows.set(write.key,current);
        const actual=current?.revision??null;if(actual!==write.expectedRevision)throw new Error(`authority_cluster_revision_conflict:${write.key}:expected=${write.expectedRevision??"none"}:actual=${actual??"none"}`);
      }
      const result:AuthorityClusterStateRecord[]=[];
      for(const write of normalized){
        const current=currentRows.get(write.key)??null,revision=(counter(current?.revision??"0","authority revision")+1n).toString(),row:StateRow={namespace:this.namespace,key:write.key,revision,value:write.value,valueDigest:write.valueDigest,fenceToken:lease.fenceToken,updatedAtMs:now};
        await tx.putState(row);result.push({key:row.key,revision:row.revision,value:row.value,valueDigest:row.valueDigest,fenceToken:row.fenceToken,updatedAtMs:row.updatedAtMs});
      }
      await tx.putReceipt({namespace:this.namespace,transactionId,requestDigest,resultJson:JSON.stringify(result),committedAtMs:now});
      return result;
    });
  }

  health(){return{version:"CIEAV_POSTGRES_AUTHORITY_STATE_HEALTH_V1" as const,backend:"postgres-ha-v1" as const,namespace:this.namespace,serializableTransactions:true,multiKeyAtomicCas:true,monotonicFencing:true,databaseClockLeases:true,idempotentCommitRecovery:true,replicationQualificationRequired:true,clusterHaQualified:false,authority:false as const,mayMintExecutionAuthority:false as const,executionAuthorityIssued:false as const}}
  async close(){await this.database.close?.()}
}

type QueryResult={rows:Array<Record<string,unknown>>;rowCount?:number|null};
export interface AuthorityPgClientLike {query(text:string,values?:unknown[]):Promise<QueryResult>;release():void}
export interface AuthorityPgPoolLike {connect():Promise<AuthorityPgClientLike>;end?():Promise<void>}

const text=(row:Record<string,unknown>,key:string)=>{const value=row[key];if(typeof value!=="string"&&typeof value!=="number")throw new Error(`postgres authority row missing ${key}`);return String(value)};
const intMs=(row:Record<string,unknown>,key:string)=>{const value=Number(text(row,key));if(!Number.isSafeInteger(value)||value<0)throw new Error(`postgres authority row invalid ${key}`);return value};
const retryablePostgresError=(error:unknown)=>{const code=typeof error==="object"&&error!==null&&"code" in error?String((error as {code?:unknown}).code??""):"";return new Set(["40001","40P01","08000","08001","08003","08004","08006","08007","57P01","57P02","57P03"]).has(code)};
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

class PgAuthorityTransaction implements AuthorityClusterTransaction {
  constructor(private readonly client:AuthorityPgClientLike){}
  async nowMs(){const r=await this.client.query("SELECT floor(extract(epoch from clock_timestamp())*1000)::bigint AS now_ms");return intMs(r.rows[0]??{},"now_ms")}
  async getLeaseForUpdate(namespace:string){const r=await this.client.query("SELECT namespace, owner_id, fence_token::text AS fence_token, lease_until_ms::text AS lease_until_ms FROM cieav_authority_lease_v1 WHERE namespace=$1 FOR UPDATE",[namespace]);const row=r.rows[0];return row?{namespace:text(row,"namespace"),ownerId:text(row,"owner_id"),fenceToken:text(row,"fence_token"),leaseUntilMs:intMs(row,"lease_until_ms")}:null}
  async putLease(row:LeaseRow){await this.client.query("INSERT INTO cieav_authority_lease_v1(namespace,owner_id,fence_token,lease_until_ms,updated_at) VALUES($1,$2,$3::bigint,$4::bigint,clock_timestamp()) ON CONFLICT(namespace) DO UPDATE SET owner_id=EXCLUDED.owner_id,fence_token=EXCLUDED.fence_token,lease_until_ms=EXCLUDED.lease_until_ms,updated_at=clock_timestamp()",[row.namespace,row.ownerId,row.fenceToken,String(row.leaseUntilMs)])}
  async getStateForUpdate(namespace:string,key:string){const r=await this.client.query("SELECT namespace,state_key,revision::text AS revision,value_text,value_digest,fence_token::text AS fence_token,floor(extract(epoch from updated_at)*1000)::bigint::text AS updated_at_ms FROM cieav_authority_state_v1 WHERE namespace=$1 AND state_key=$2 FOR UPDATE",[namespace,key]);return this.state(r.rows[0])}
  async getState(namespace:string,key:string){const r=await this.client.query("SELECT namespace,state_key,revision::text AS revision,value_text,value_digest,fence_token::text AS fence_token,floor(extract(epoch from updated_at)*1000)::bigint::text AS updated_at_ms FROM cieav_authority_state_v1 WHERE namespace=$1 AND state_key=$2",[namespace,key]);return this.state(r.rows[0])}
  private state(row:Record<string,unknown>|undefined):StateRow|null{return row?{namespace:text(row,"namespace"),key:text(row,"state_key"),revision:text(row,"revision"),value:text(row,"value_text"),valueDigest:text(row,"value_digest"),fenceToken:text(row,"fence_token"),updatedAtMs:intMs(row,"updated_at_ms")}:null}
  async putState(row:StateRow){await this.client.query("INSERT INTO cieav_authority_state_v1(namespace,state_key,revision,value_text,value_digest,fence_token,updated_at) VALUES($1,$2,$3::bigint,$4,$5,$6::bigint,clock_timestamp()) ON CONFLICT(namespace,state_key) DO UPDATE SET revision=EXCLUDED.revision,value_text=EXCLUDED.value_text,value_digest=EXCLUDED.value_digest,fence_token=EXCLUDED.fence_token,updated_at=clock_timestamp()",[row.namespace,row.key,row.revision,row.value,row.valueDigest,row.fenceToken])}
  async getReceipt(namespace:string,transactionId:string){const r=await this.client.query("SELECT namespace,transaction_id,request_digest,result_json,floor(extract(epoch from committed_at)*1000)::bigint::text AS committed_at_ms FROM cieav_authority_tx_v1 WHERE namespace=$1 AND transaction_id=$2 FOR UPDATE",[namespace,transactionId]);const row=r.rows[0];return row?{namespace:text(row,"namespace"),transactionId:text(row,"transaction_id"),requestDigest:text(row,"request_digest"),resultJson:text(row,"result_json"),committedAtMs:intMs(row,"committed_at_ms")}:null}
  async putReceipt(row:ReceiptRow){await this.client.query("INSERT INTO cieav_authority_tx_v1(namespace,transaction_id,request_digest,result_json,committed_at) VALUES($1,$2,$3,$4,clock_timestamp())",[row.namespace,row.transactionId,row.requestDigest,row.resultJson])}
}

export class PostgresAuthorityClusterDatabase implements AuthorityClusterDatabase {
  constructor(private readonly pool:AuthorityPgPoolLike,private readonly transactionRetries=5){if(!Number.isInteger(transactionRetries)||transactionRetries<1||transactionRetries>10)throw new Error("PostgreSQL authority transaction retries must be 1-10")}
  async initialize(){const client=await this.pool.connect();try{await client.query("BEGIN");await client.query("SELECT pg_advisory_xact_lock(734882104276319001::bigint)");await client.query("CREATE TABLE IF NOT EXISTS cieav_authority_meta_v1(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),schema_version integer NOT NULL CHECK(schema_version=1),created_at timestamptz NOT NULL DEFAULT clock_timestamp())");await client.query("INSERT INTO cieav_authority_meta_v1(singleton,schema_version) VALUES(true,1) ON CONFLICT(singleton) DO NOTHING");await client.query("CREATE TABLE IF NOT EXISTS cieav_authority_lease_v1(namespace text PRIMARY KEY,owner_id text NOT NULL,fence_token bigint NOT NULL CHECK(fence_token>0),lease_until_ms bigint NOT NULL CHECK(lease_until_ms>=0),updated_at timestamptz NOT NULL DEFAULT clock_timestamp())");await client.query("CREATE TABLE IF NOT EXISTS cieav_authority_state_v1(namespace text NOT NULL,state_key text NOT NULL,revision bigint NOT NULL CHECK(revision>0),value_text text NOT NULL,value_digest char(64) NOT NULL CHECK(value_digest ~ '^[0-9a-f]{64}$'),fence_token bigint NOT NULL CHECK(fence_token>0),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(namespace,state_key))");await client.query("CREATE TABLE IF NOT EXISTS cieav_authority_tx_v1(namespace text NOT NULL,transaction_id text NOT NULL,request_digest char(64) NOT NULL CHECK(request_digest ~ '^[0-9a-f]{64}$'),result_json text NOT NULL,committed_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(namespace,transaction_id))");const meta=await client.query("SELECT schema_version::text AS schema_version FROM cieav_authority_meta_v1 WHERE singleton=true FOR UPDATE");if(text(meta.rows[0]??{},"schema_version")!=="1")throw new Error("unsupported CIEAV PostgreSQL authority schema version");await client.query("COMMIT")}catch(error){try{await client.query("ROLLBACK")}catch{}throw error}finally{client.release()}}
  async serializable<T>(fn:(tx:AuthorityClusterTransaction)=>Promise<T>):Promise<T>{let last:unknown;for(let attempt=0;attempt<this.transactionRetries;attempt++){const client=await this.pool.connect();try{await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");const value=await fn(new PgAuthorityTransaction(client));await client.query("COMMIT");return value}catch(error){last=error;try{await client.query("ROLLBACK")}catch{}if(!retryablePostgresError(error)||attempt===this.transactionRetries-1)throw error;await delay(Math.min(250,10*(2**attempt))+crypto.randomInt(0,10))}finally{client.release()}}throw last instanceof Error?last:new Error("PostgreSQL authority transaction retry exhausted")}
  async read<T>(fn:(tx:AuthorityClusterTransaction)=>Promise<T>):Promise<T>{const client=await this.pool.connect();try{await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");const value=await fn(new PgAuthorityTransaction(client));await client.query("COMMIT");return value}catch(error){try{await client.query("ROLLBACK")}catch{}throw error}finally{client.release()}}
  async close(){await this.pool.end?.()}
}

export interface PostgresAuthorityClusterConfig {url:string;namespace:string;leaseMs:number;transactionRetries:number;poolMax:number}
export function loadPostgresAuthorityClusterConfig(env:NodeJS.ProcessEnv=process.env):PostgresAuthorityClusterConfig{
  const raw=String(env.CIEAV_AUTHORITY_POSTGRES_URL??"").trim();if(!raw)throw new Error("cluster-ha postgres backend requires CIEAV_AUTHORITY_POSTGRES_URL");let url:URL;try{url=new URL(raw)}catch{throw new Error("CIEAV_AUTHORITY_POSTGRES_URL is invalid")}
  if(url.protocol!=="postgres:"&&url.protocol!=="postgresql:")throw new Error("CIEAV_AUTHORITY_POSTGRES_URL must use postgres:// or postgresql://");if(!url.hostname)throw new Error("CIEAV_AUTHORITY_POSTGRES_URL requires a hostname");if(url.hash)throw new Error("CIEAV_AUTHORITY_POSTGRES_URL must not contain a fragment");if(url.searchParams.get("sslmode")!=="verify-full")throw new Error("CIEAV_AUTHORITY_POSTGRES_URL must set sslmode=verify-full");
  const namespace=String(env.CIEAV_AUTHORITY_CLUSTER_NAMESPACE??"").trim();if(!idPattern.test(namespace))throw new Error("cluster-ha postgres backend requires CIEAV_AUTHORITY_CLUSTER_NAMESPACE with 8-200 safe identifier characters");
  return{url:raw,namespace,leaseMs:boundedInt(env.CIEAV_AUTHORITY_CLUSTER_LEASE_MS,"CIEAV_AUTHORITY_CLUSTER_LEASE_MS",15000,5000,120000),transactionRetries:boundedInt(env.CIEAV_AUTHORITY_CLUSTER_TX_RETRIES,"CIEAV_AUTHORITY_CLUSTER_TX_RETRIES",5,1,10),poolMax:boundedInt(env.CIEAV_AUTHORITY_POSTGRES_POOL_MAX,"CIEAV_AUTHORITY_POSTGRES_POOL_MAX",8,2,64)};
}

export async function createPostgresAuthorityStateBackendFromEnv(env:NodeJS.ProcessEnv=process.env){
  const config=loadPostgresAuthorityClusterConfig(env),moduleName="pg";let loaded:unknown;try{loaded=await import(moduleName)}catch(error){throw new Error(`CIEAV postgres-ha-v1 requires the qualified pg runtime driver: ${error instanceof Error?error.message:String(error)}`)}
  const module=loaded as {Pool?:new(config:Record<string,unknown>)=>AuthorityPgPoolLike;default?:{Pool?:new(config:Record<string,unknown>)=>AuthorityPgPoolLike}},Pool=module.Pool??module.default?.Pool;if(!Pool)throw new Error("CIEAV postgres-ha-v1 pg runtime driver does not export Pool");
  const pool=new Pool({connectionString:config.url,max:config.poolMax,connectionTimeoutMillis:5000,idleTimeoutMillis:30000,application_name:"cieav-authority-ha-v1",options:"-c statement_timeout=10000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=15000"});
  const database=new PostgresAuthorityClusterDatabase(pool,config.transactionRetries),backend=new CieavPostgresAuthorityStateBackend(database,config.namespace,config.leaseMs);await backend.initialize();return backend;
}
