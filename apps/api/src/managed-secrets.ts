export type ManagedSecrets=Readonly<{jwtSecret:string;receiptSigningSecret:string;gatewayToken:string;semanticRouterToken:string}>;

let pending:ManagedSecrets|undefined;
const EXPECTED_KEYS=["gatewayToken","jwtSecret","receiptSigningSecret","semanticRouterToken"] as const;

function exactSecret(raw:Record<string,unknown>,name:typeof EXPECTED_KEYS[number],min:number){
  const value=raw[name];
  if(typeof value!=="string"||value.length<min||value.length>4096)throw new Error(`cieav_managed_secret_${name}_invalid`);
  return value;
}

export function installManagedSecrets(raw:unknown):void{
  if(pending)throw new Error("cieav_managed_secret_bootstrap_already_installed");
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new Error("cieav_managed_secret_bootstrap_invalid");
  const record=raw as Record<string,unknown>,keys=Object.keys(record).sort();
  if(keys.length!==EXPECTED_KEYS.length||keys.some((key,index)=>key!==EXPECTED_KEYS[index]))throw new Error("cieav_managed_secret_bootstrap_fields_invalid");
  const jwtSecret=exactSecret(record,"jwtSecret",32),receiptSigningSecret=exactSecret(record,"receiptSigningSecret",32),gatewayToken=exactSecret(record,"gatewayToken",43),semanticRouterToken=exactSecret(record,"semanticRouterToken",43);
  if(jwtSecret===receiptSigningSecret)throw new Error("cieav_managed_secret_roots_must_be_distinct");
  if(semanticRouterToken===gatewayToken)throw new Error("cieav_managed_secret_scopes_must_be_distinct");
  pending=Object.freeze({jwtSecret,receiptSigningSecret,gatewayToken,semanticRouterToken});
}

export function consumeManagedSecrets():ManagedSecrets|undefined{
  const value=pending;
  pending=undefined;
  return value;
}
