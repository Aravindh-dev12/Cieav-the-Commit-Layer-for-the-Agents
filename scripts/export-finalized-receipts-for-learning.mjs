#!/usr/bin/env node
import crypto from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const args=process.argv.slice(2);
const valueOf=(name,fallback="")=>String(args.find(x=>x.startsWith(`${name}=`))?.slice(name.length+1)||fallback).trim();
const stateDir=path.resolve(valueOf("--state-dir",process.env.CIEAV_STATE_DIR||process.env.LATCH_STATE_DIR||path.join(ROOT,".cieav")));
const dbFile=path.resolve(valueOf("--db",process.env.CIEAV_SQLITE_PATH||path.join(stateDir,"receipts.sqlite3")));
const output=path.resolve(valueOf("--output",path.join(ROOT,"ml","data","live","finalized-receipt-evidence.jsonl")));
const limit=Math.max(1,Math.min(10000,Number(valueOf("--limit","1000"))||1000));
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`:JSON.stringify(value)??"undefined";
const digest=value=>crypto.createHash("sha256").update(canonical(value)).digest("hex");
const finalStatus=new Set(["COMMITTED","UNDONE","UNDO_FAILED"]);

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

const db=new DatabaseSync(dbFile,{readOnly:true});
try{
  const rows=db.prepare("SELECT receipt_json FROM receipts ORDER BY created_at ASC LIMIT ?").all(limit);
  const records=[];let rejected=0;
  for(const row of rows){let receipt;try{receipt=JSON.parse(row.receipt_json)}catch{rejected++;continue}const out=normalize(receipt);if(out)records.push(out);else rejected++}
  await mkdir(path.dirname(output),{recursive:true});
  await writeFile(output,records.map(x=>JSON.stringify(x)).join("\n")+(records.length?"\n":""),"utf8");
  console.log(JSON.stringify({schemaVersion:1,kind:"CIEAV_FINALIZED_RECEIPT_LEARNING_EXPORT_V1",authority:false,productionAuthority:false,authorityGrade:false,realityBound:false,dbFile,output,scanned:rows.length,exported:records.length,rejected},null,2));
  if(!records.length)process.exitCode=3;
}finally{db.close()}
