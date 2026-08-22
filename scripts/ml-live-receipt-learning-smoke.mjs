#!/usr/bin/env node
import crypto from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {mkdtemp,readFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`:JSON.stringify(value)??"undefined";
const {publicKey,privateKey}=crypto.generateKeyPairSync("ed25519");
const publicDer=publicKey.export({type:"spki",format:"der"});
const signingPublicKey=publicDer.toString("base64url"),signatureKeyId=`ed25519:${crypto.createHash("sha256").update(publicDer).digest("base64url")}`;
const now=()=>new Date().toISOString();

function receipt(status,idx,receiptStatus="COMMITTED"){
  const base={
    id:crypto.randomUUID(),deviceId:"device-fixture-12345678",createdAt:now(),committedAt:now(),status:receiptStatus,
    manifest:{requestId:`request-${idx}-12345678`,actionType:"fixture.submit",summary:"Fixture consequential action",actor:"fixture-agent",target:"fixture-target",recipients:[],dataCategories:["WORK"],effects:["fixture state changed"],reversibility:"REVERSIBLE",undo:{kind:"SITE_ADAPTER",label:"Undo fixture"},risk:"HIGH",confidence:.95,modelUsed:true,warnings:[],evidence:["fixture evidence"],policyVersion:"fixture-v1"},
    source:{url:"https://example.invalid/fixture",origin:"https://example.invalid",title:"Fixture"},
    outcome:{status,confidence:status==="UNKNOWN"?.2:.97,observedAt:now(),evidence:[{kind:"DOM_STATE",summary:`secret-ish fixture ${idx} verified state`}]},
    receiptVersion:"3",signatureAlgorithm:"Ed25519",signatureKeyId,signingPublicKey
  };
  const signature=crypto.sign(null,Buffer.from(canonical(base)),privateKey).toString("base64url");
  return{...base,signature};
}

const td=await mkdtemp(path.join(os.tmpdir(),"cieav-live-receipt-learning-"));
const dbFile=path.join(td,"receipts.sqlite3"),rawFile=path.join(td,"evidence.jsonl"),trajectoryFile=path.join(td,"trajectories.jsonl"),datasetDir=path.join(td,"dataset");
const db=new DatabaseSync(dbFile);
db.exec("CREATE TABLE receipts (id TEXT PRIMARY KEY, device_id TEXT NOT NULL, created_at TEXT NOT NULL, receipt_json TEXT NOT NULL)");
const insert=db.prepare("INSERT INTO receipts(id,device_id,created_at,receipt_json) VALUES(?,?,?,?)");
const valid=[receipt("OBSERVED_SUCCESS",1),receipt("OBSERVED_FAILURE",2),receipt("UNKNOWN",3,"UNDONE")];
for(const r of valid)insert.run(r.id,r.deviceId,r.createdAt,JSON.stringify(r));
const bad=receipt("OBSERVED_SUCCESS",4);bad.outcome.evidence[0].summary="tampered after signing";insert.run(bad.id,bad.deviceId,bad.createdAt,JSON.stringify(bad));
db.close();

function run(cmd,args){const r=spawnSync(cmd,args,{cwd:ROOT,encoding:"utf8",shell:false});if(r.error)throw r.error;if(r.status!==0)throw new Error(`${cmd} ${args.join(" ")} failed (${r.status})\n${r.stdout}\n${r.stderr}`);return r.stdout}
const python=process.platform==="win32"?"python":"python3";
const exportOut=run(process.execPath,["scripts/export-finalized-receipts-for-learning.mjs",`--db=${dbFile}`,`--output=${rawFile}`]);
const report=JSON.parse(exportOut);if(report.exported!==3||report.rejected!==1||report.authorityGrade!==false)throw new Error(`receipt export contract mismatch: ${exportOut}`);
const raw=(await readFile(rawFile,"utf8")).trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
if(raw.some(x=>x.provenance?.authorityGrade!==false||x.provenance?.realityBound!==false||x.provenance?.cryptographicallyVerified!==true))throw new Error("receipt evidence provenance boundary failed");
run(python,["ml/consequence_learning_cli.py","normalize-jsonl","--input",rawFile,"--output",trajectoryFile]);
const trajectories=(await readFile(trajectoryFile,"utf8")).trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
if(trajectories.length!==3)throw new Error("trajectory count mismatch");
if(trajectories.some(x=>x.learning?.trainingScope!=="OUTCOME_PROOF"||x.learning?.eligibleAgenticRl!==false||x.provenance?.authorityGrade!==false))throw new Error("receipt-derived trajectory escaped OUTCOME_PROOF scope");
run(python,["ml/build_consequence_dataset.py","--input",trajectoryFile,"--output-dir",datasetDir]);
const manifest=JSON.parse(await readFile(path.join(datasetDir,"manifest.json"),"utf8"));
if(manifest.authority!==false||manifest.provenance?.authorityGradeRecords!==0||manifest.provenance?.agenticRlEligibleRecords!==0||manifest.provenance?.nonAuthorityGradeRestrictedToOutcomeProof!==true)throw new Error("dataset provenance boundary failed");
console.log("CIEAV live receipt learning smoke PASS - signed SQLite receipts -> Ed25519 verification -> OUTCOME_PROOF trajectories -> provenance-bound datasets; tampered receipt rejected");
