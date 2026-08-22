#!/usr/bin/env node
import crypto from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {existsSync,statSync} from "node:fs";
import {mkdir,writeFile} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const args=process.argv.slice(2);
const valueOf=(name,fallback="")=>String(args.find(x=>x.startsWith(`${name}=`))?.slice(name.length+1)||fallback).trim();
const has=name=>args.includes(name);
const home=path.resolve(os.homedir());
const homeCieav=path.join(home,".cieav"),homeLatch=path.join(home,".latch");
const defaultStateDir=existsSync(homeLatch)&&!existsSync(homeCieav)?homeLatch:homeCieav;
const configuredState=valueOf("--state-dir",process.env.CIEAV_STATE_DIR||process.env.LATCH_STATE_DIR||"");
const stateDir=path.resolve(configuredState||defaultStateDir);
const configuredDb=valueOf("--db",process.env.CIEAV_SQLITE_PATH||"");
const dbFile=path.resolve(configuredDb||path.join(stateDir,"receipts.sqlite3"));
const output=path.resolve(valueOf("--output",path.join(ROOT,"ml","data","live","finalized-receipt-evidence.jsonl")));
const limit=Math.max(1,Math.min(10000,Number(valueOf("--limit","1000"))||1000));
const receiptStore=valueOf("--store",process.env.CIEAV_RECEIPT_STORE||"sqlite").toLowerCase();
const xamppMode=receiptStore==="xampp-mysql";
const phpBin=valueOf("--php",process.env.CIEAV_PHP_BIN||(process.platform==="win32"?"C:\\xampp\\php\\php.exe":"php"));
const phpBridge=path.resolve(valueOf("--php-bridge",process.env.CIEAV_XAMPP_MYSQL_BRIDGE||path.join(ROOT,"scripts","xampp-mysql-receipts.php")));
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`:JSON.stringify(value)??"undefined";
const digest=value=>crypto.createHash("sha256").update(canonical(value)).digest("hex");
const finalStatus=new Set(["COMMITTED","UNDONE","UNDO_FAILED"]);
const candidatePaths=()=>[...new Set([
  configuredDb&&path.resolve(configuredDb),
  configuredState&&path.resolve(configuredState,"receipts.sqlite3"),
  process.env.CIEAV_STATE_DIR&&path.resolve(process.env.CIEAV_STATE_DIR,"receipts.sqlite3"),
  process.env.LATCH_STATE_DIR&&path.resolve(process.env.LATCH_STATE_DIR,"receipts.sqlite3"),
  path.join(homeCieav,"receipts.sqlite3"),
  path.join(homeLatch,"receipts.sqlite3"),
  path.join(ROOT,".cieav","receipts.sqlite3")
].filter(Boolean))].map(file=>({file,exists:existsSync(file)&&statSync(file).isFile()}));

function mysqlDescriptor(){return{
  store:"xampp-mysql",phpBin,phpBridge,
  host:process.env.CIEAV_MYSQL_HOST||"127.0.0.1",
  port:Number(process.env.CIEAV_MYSQL_PORT||3306),
  database:process.env.CIEAV_MYSQL_DATABASE||"cieav",
  user:process.env.CIEAV_MYSQL_USER||"root",
  passwordConfigured:Boolean(process.env.CIEAV_MYSQL_PASSWORD),
}}
function failDatabase(message){
  console.error(JSON.stringify({
    schemaVersion:1,kind:"CIEAV_FINALIZED_RECEIPT_LEARNING_EXPORT_ERROR_V1",authority:false,
    error:"receipt_database_unavailable",message,requestedDb:dbFile,stateDir,candidates:candidatePaths(),
    hint:"The installed runtime defaults to %USERPROFILE%\\.cieav (legacy %USERPROFILE%\\.latch). For XAMPP set CIEAV_RECEIPT_STORE=xampp-mysql and run the XAMPP bootstrap."
  },null,2));
  process.exit(2);
}
function callMysql(command,input={}){
  if(!existsSync(phpBridge)){
    console.error(JSON.stringify({authority:false,error:"xampp_mysql_bridge_missing",phpBridge},null,2));process.exit(2);
  }
  if(process.platform==="win32"&&!existsSync(phpBin)){
    console.error(JSON.stringify({authority:false,error:"xampp_php_missing",phpBin,hint:"Set CIEAV_PHP_BIN to your XAMPP php.exe path."},null,2));process.exit(2);
  }
  const run=spawnSync(phpBin,[phpBridge,command],{cwd:ROOT,input:JSON.stringify(input),encoding:"utf8",shell:false,env:{...process.env}});
  if(run.error){console.error(JSON.stringify({authority:false,error:"xampp_mysql_bridge_start_failed",message:run.error.message},null,2));process.exit(2)}
  let parsed;try{parsed=JSON.parse((run.stdout||run.stderr||"{}").trim())}catch{}
  if(run.status!==0||!parsed?.ok){console.error(JSON.stringify({authority:false,error:"xampp_mysql_bridge_failed",detail:parsed??(run.stderr||run.stdout||"").slice(-2000),mysql:mysqlDescriptor()},null,2));process.exit(2)}
  return parsed;
}

if(has("--discover")){
  if(xamppMode){
    const status=callMysql("status");
    console.log(JSON.stringify({authority:false,selectedStore:"xampp-mysql",mysql:mysqlDescriptor(),reachable:true,receipts:Number(status.receipts||0)},null,2));
  }else console.log(JSON.stringify({authority:false,selectedStore:"sqlite",stateDir,defaultStateDir,selectedDb:dbFile,candidates:candidatePaths()},null,2));
  process.exit(0);
}

function verifyReceiptPublic(receipt){
  if(receipt?.receiptVersion!=="3"||receipt?.signatureAlgorithm!=="Ed25519"||typeof receipt.signature!=="string"||!receipt.signingPublicKey||!receipt.signatureKeyId)return false;
  try{
    const der=Buffer.from(receipt.signingPublicKey,"base64url"),key=crypto.createPublicKey({key:der,type:"spki",format:"der"});
    const keyId=`ed25519:${crypto.createHash("sha256").update(der).digest("base64url")}`;
    if(keyId!==receipt.signatureKeyId)return false;
    const {signature:_signature,...unsigned}=receipt;
    return crypto.verify(null,Buffer.from(canonical(unsigned)),key,Buffer.from(receipt.signature,"base64url"));
  }catch{return false}
}
function normalize(receipt){
  if(!verifyReceiptPublic(receipt)||!finalStatus.has(receipt?.status)||!receipt?.outcome)return null;
  const manifest=receipt.manifest;if(!manifest||typeof manifest.requestId!=="string"||typeof manifest.actionType!=="string")return null;
  if(!["OBSERVED_SUCCESS","OBSERVED_FAILURE","UNKNOWN"].includes(receipt.outcome.status))return null;
  const sourceDigest=digest(receipt),recoveryAttempted=receipt.status==="UNDONE"||receipt.status==="UNDO_FAILED";
  return{
    authority:false,productionAuthority:false,
    provenance:{sourceKind:"CIEAV_SIGNED_RECEIPT_V3",evidenceClass:"FINALIZED_RECEIPT",cryptographicallyVerified:true,authorityGrade:false,realityBound:false,sourceDigest},
    trajectoryId:`receipt:${receipt.id}`,createdAt:receipt.createdAt,
    taskId:`receipt:${receipt.id}`,intentId:`request:${manifest.requestId}`,
    subject:{subjectId:`device:${digest(receipt.deviceId).slice(0,24)}`,agentId:`actor:${digest(manifest.actor||"unknown").slice(0,24)}`,modelProvider:manifest.modelUsed?"cieav-routed":"deterministic",modelFamily:"receipt-observed"},
    action:{toolId:"cieav-browser",protocol:"BROWSER",operation:manifest.actionType,risk:manifest.risk||"UNKNOWN",semanticEffect:{effectDigests:(manifest.effects||[]).map(digest),reversibility:manifest.reversibility,dataCategories:manifest.dataCategories||[]},argumentsDigest:digest({requestId:manifest.requestId,actionType:manifest.actionType,target:manifest.target??null,recipients:manifest.recipients||[],dataCategories:manifest.dataCategories||[],policyVersion:manifest.policyVersion??null})},
    authorization:{decision:"ALLOW",mode:"RECEIPT_COMMIT",complete:false},reality:{},
    execution:{startedAt:receipt.committedAt??null,finishedAt:receipt.outcome.observedAt,receiptDigest:sourceDigest},
    outcome:{status:receipt.outcome.status,confidence:Number(receipt.outcome.confidence??0),observedAt:receipt.outcome.observedAt,evidence:(receipt.outcome.evidence||[]).slice(0,20).map(e=>({kind:String(e.kind||"OTHER"),summary:`finalized ${String(e.kind||"other").toLowerCase()} evidence`,digest:digest(String(e.summary||""))}))},
    recovery:{attempted:recoveryAttempted,status:receipt.status,undoVerified:receipt.status==="UNDONE",evidenceDigest:recoveryAttempted?digest({receiptStatus:receipt.status,receiptId:receipt.id}):null}
  };
}

let receipts=[],source;
if(xamppMode){
  const result=callMysql("all",{limit});receipts=Array.isArray(result.receipts)?result.receipts:[];source=mysqlDescriptor();
}else{
  if(!existsSync(dbFile))failDatabase("CIEAV receipt database does not exist. Refusing to ask SQLite to open a guessed path.");
  try{if(!statSync(dbFile).isFile())failDatabase("Selected receipt database path is not a regular file.")}catch(err){failDatabase(`Selected receipt database cannot be inspected: ${String(err?.message??err)}`)}
  let db;try{db=new DatabaseSync(dbFile,{readOnly:true})}catch(err){failDatabase(`Unable to open selected receipt database read-only: ${String(err?.message??err)}`)}
  try{
    const rows=db.prepare("SELECT receipt_json FROM receipts ORDER BY created_at ASC LIMIT ?").all(limit);
    for(const row of rows){try{receipts.push(JSON.parse(row.receipt_json))}catch{receipts.push(null)}}
    source={store:"sqlite",dbFile};
  }catch(err){console.error(JSON.stringify({authority:false,error:"receipt_database_schema_invalid",dbFile,message:String(err?.message??err)},null,2));process.exit(2)}finally{db.close()}
}
const records=[];let rejected=0;
for(const receipt of receipts){const out=normalize(receipt);if(out)records.push(out);else rejected++}
await mkdir(path.dirname(output),{recursive:true});
await writeFile(output,records.map(x=>JSON.stringify(x)).join("\n")+(records.length?"\n":""),"utf8");
console.log(JSON.stringify({schemaVersion:1,kind:"CIEAV_FINALIZED_RECEIPT_LEARNING_EXPORT_V1",authority:false,productionAuthority:false,authorityGrade:false,realityBound:false,source,output,scanned:receipts.length,exported:records.length,rejected},null,2));
if(!records.length)process.exitCode=3;
