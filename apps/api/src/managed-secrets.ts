export type ManagedSecrets=Readonly<{jwtSecret:string;receiptSigningSecret:string;gatewayToken:string;semanticRouterToken:string}>;
export type ManagedAuthoritySqlSecrets=Readonly<{user:string;password:string}>;

let pending:ManagedSecrets|undefined;
let pendingAuthoritySql:ManagedAuthoritySqlSecrets|undefined;
const BASE_KEYS=["gatewayToken","jwtSecret","receiptSigningSecret","semanticRouterToken"] as const;
const SQL_KEYS=["authoritySqlPassword","authoritySqlUser"] as const;
type BaseKey=typeof BASE_KEYS[number];

function exactSecret(raw:Record<string,unknown>,name:BaseKey,min:number){
  const value=raw[name];
  if(typeof value!=="string"||value.length<min||value.length>4096)throw new Error(`cieav_managed_secret_${name}_invalid`);
  return value;
}
function exactSqlSecret(raw:Record<string,unknown>,name:"authoritySqlUser"|"authoritySqlPassword",min:number,max:number){
  const value=raw[name];
  if(typeof value!=="string"||value.length<min||value.length>max)throw new Error(`cieav_managed_secret_${name}_invalid`);
  return value;
}

export function installManagedSecrets(raw:unknown):void{
  if(pending||pendingAuthoritySql)throw new Error("cieav_managed_secret_bootstrap_already_installed");
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new Error("cieav_managed_secret_bootstrap_invalid");
  const record=raw as Record<string,unknown>,keys=Object.keys(record).sort(),base=[...BASE_KEYS].sort(),withSql=[...BASE_KEYS,...SQL_KEYS].sort();
  const baseOnly=keys.length===base.length&&keys.every((key,index)=>key===base[index]),hasSql=keys.length===withSql.length&&keys.every((key,index)=>key===withSql[index]);
  if(!baseOnly&&!hasSql)throw new Error("cieav_managed_secret_bootstrap_fields_invalid");
  const jwtSecret=exactSecret(record,"jwtSecret",32),receiptSigningSecret=exactSecret(record,"receiptSigningSecret",32),gatewayToken=exactSecret(record,"gatewayToken",43),semanticRouterToken=exactSecret(record,"semanticRouterToken",43);
  if(jwtSecret===receiptSigningSecret)throw new Error("cieav_managed_secret_roots_must_be_distinct");
  if(semanticRouterToken===gatewayToken)throw new Error("cieav_managed_secret_scopes_must_be_distinct");
  pending=Object.freeze({jwtSecret,receiptSigningSecret,gatewayToken,semanticRouterToken});
  if(hasSql){const user=exactSqlSecret(record,"authoritySqlUser",1,256),password=exactSqlSecret(record,"authoritySqlPassword",12,4096);pendingAuthoritySql=Object.freeze({user,password})}
}

export function consumeManagedSecrets():ManagedSecrets|undefined{const value=pending;pending=undefined;return value}
export function peekManagedAuthoritySqlSecrets():ManagedAuthoritySqlSecrets|undefined{return pendingAuthoritySql}
export function consumeManagedAuthoritySqlSecrets():ManagedAuthoritySqlSecrets|undefined{const value=pendingAuthoritySql;pendingAuthoritySql=undefined;return value}
