import crypto from "node:crypto";
import {ReceiptSchema,type Receipt} from "@cieav/contracts";
import {verifyReceiptPublic} from "./receipt.js";

const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value as Record<string,unknown>).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(",")}}`:JSON.stringify(value)??"undefined";
const digest=(value:unknown)=>crypto.createHash("sha256").update(canonical(value)).digest("hex");
const finalStatus=new Set(["COMMITTED","UNDONE","UNDO_FAILED"]);

export type ConsequenceReceiptEvidence={
  authority:false;
  productionAuthority:false;
  provenance:{sourceKind:"CIEAV_SIGNED_RECEIPT_V3";evidenceClass:"FINALIZED_RECEIPT";cryptographicallyVerified:true;authorityGrade:false;realityBound:false;sourceDigest:string};
  trajectoryId:string;
  createdAt:string;
  taskId:string;
  intentId:string;
  subject:{subjectId:string;agentId:string;modelProvider:string;modelFamily:string};
  action:{toolId:string;protocol:"BROWSER";operation:string;risk:string;semanticEffect:unknown;argumentsDigest:string};
  authorization:{decision:"ALLOW";mode:"RECEIPT_COMMIT";complete:false};
  reality:{};
  execution:{startedAt:string|null;finishedAt:string;receiptDigest:string};
  outcome:{status:string;confidence:number;observedAt:string;evidence:Array<{kind:string;summary:string;digest:string}>};
  recovery:{attempted:boolean;status:string;undoVerified:boolean;evidenceDigest:string|null};
};

function normalizeReceipt(raw:unknown):ConsequenceReceiptEvidence|null{
  const parsed=ReceiptSchema.safeParse(raw);if(!parsed.success)return null;
  const receipt=parsed.data as Receipt;
  if(receipt.receiptVersion!=="3"||receipt.signatureAlgorithm!=="Ed25519"||!verifyReceiptPublic(receipt))return null;
  if(!finalStatus.has(receipt.status)||!receipt.outcome)return null;
  const sourceDigest=digest(receipt),manifest=receipt.manifest,outcome=receipt.outcome;
  const actionArgsDigest=digest({requestId:manifest.requestId,actionType:manifest.actionType,target:manifest.target??null,recipients:manifest.recipients,dataCategories:manifest.dataCategories,policyVersion:manifest.policyVersion});
  const recoveryAttempted=receipt.status==="UNDONE"||receipt.status==="UNDO_FAILED";
  return{
    authority:false,productionAuthority:false,
    provenance:{sourceKind:"CIEAV_SIGNED_RECEIPT_V3",evidenceClass:"FINALIZED_RECEIPT",cryptographicallyVerified:true,authorityGrade:false,realityBound:false,sourceDigest},
    trajectoryId:`receipt:${receipt.id}`,createdAt:receipt.createdAt,
    taskId:`receipt:${receipt.id}`,intentId:`request:${manifest.requestId}`,
    subject:{subjectId:`device:${digest(receipt.deviceId).slice(0,24)}`,agentId:`actor:${digest(manifest.actor).slice(0,24)}`,modelProvider:manifest.modelUsed?"cieav-routed":"deterministic",modelFamily:"receipt-observed"},
    action:{toolId:"cieav-browser",protocol:"BROWSER",operation:manifest.actionType,risk:manifest.risk,semanticEffect:{effectDigests:manifest.effects.map(digest),reversibility:manifest.reversibility,dataCategories:manifest.dataCategories},argumentsDigest:actionArgsDigest},
    authorization:{decision:"ALLOW",mode:"RECEIPT_COMMIT",complete:false},reality:{},
    execution:{startedAt:receipt.committedAt??null,finishedAt:outcome.observedAt,receiptDigest:sourceDigest},
    outcome:{status:outcome.status,confidence:outcome.confidence,observedAt:outcome.observedAt,evidence:outcome.evidence.map(e=>({kind:e.kind,summary:`finalized ${e.kind.toLowerCase()} evidence`,digest:digest(e.summary)}))},
    recovery:{attempted:recoveryAttempted,status:receipt.status,undoVerified:receipt.status==="UNDONE",evidenceDigest:recoveryAttempted?digest({receiptStatus:receipt.status,receiptId:receipt.id}):null}
  };
}

export function exportFinalizedReceiptEvidence(values:unknown[]){
  const evidence:ConsequenceReceiptEvidence[]=[];let rejected=0;
  for(const value of values){const row=normalizeReceipt(value);if(row)evidence.push(row);else rejected++}
  return{schemaVersion:1,kind:"CIEAV_FINALIZED_RECEIPT_LEARNING_EXPORT_V1",authority:false,productionAuthority:false,evidenceClass:"FINALIZED_RECEIPT",authorityGrade:false,records:evidence,rejected};
}
