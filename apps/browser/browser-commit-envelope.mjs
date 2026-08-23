import crypto from "node:crypto";
import {mkdir,open,readFile,rename,writeFile} from "node:fs/promises";
import path from "node:path";

const DOMAIN="CIEAV_BROWSER_COMMIT_DISPATCH_V1";
const JOURNAL_DOMAIN="CIEAV_BROWSER_COMMIT_REPLAY_V1";
const SHA256=/^[0-9a-f]{64}$/;
const ID=/^[A-Za-z0-9._:-]{1,240}$/;
const MAX_ENTRIES=100_000;
const sha256=value=>crypto.createHash("sha256").update(value).digest("hex");
const hmac=(secret,value)=>crypto.createHmac("sha256",secret).update(value).digest("hex");
const safeEqual=(a,b)=>{const x=Buffer.from(String(a??"")),y=Buffer.from(String(b??""));return x.length===y.length&&crypto.timingSafeEqual(x,y)};
const exactKeys=(value,keys,label)=>{if(!value||typeof value!=="object"||Array.isArray(value))throw new Error(`${label}_invalid`);const actual=Object.keys(value).sort(),expected=[...keys].sort();if(actual.length!==expected.length||actual.some((key,index)=>key!==expected[index]))throw new Error(`${label}_fields_invalid`)};
const bounded=(value,label,max=240)=>{const text=String(value??"");if(!text||text.length>max)throw new Error(`${label}_invalid`);return text};
const digestField=(value,label)=>{const text=String(value??"").toLowerCase();if(!SHA256.test(text))throw new Error(`${label}_invalid`);return text};
const idField=(value,label)=>{const text=String(value??"");if(!ID.test(text))throw new Error(`${label}_invalid`);return text};
const iso=(value,label)=>{const text=String(value??"");const ms=Date.parse(text);if(!Number.isFinite(ms))throw new Error(`${label}_invalid`);return{text,ms}};

export function browserCommitActionDigest(raw){
  exactKeys(raw,raw?.operation==="NAVIGATE"?["operation","url"]:raw?.operation==="CLICK"?["operation","pageUrl","selector"]:raw?.operation==="TYPE"?["operation","pageUrl","selector","text"]:[],"browser_commit_action");
  const operation=String(raw.operation??"").toUpperCase();
  if(operation==="NAVIGATE")return sha256(`NAVIGATE\n${bounded(raw.url,"browser_commit_action_url",4000)}`);
  if(operation==="CLICK")return sha256(`CLICK\n${bounded(raw.pageUrl,"browser_commit_action_page_url",4000)}\n${bounded(raw.selector,"browser_commit_action_selector",4096)}`);
  if(operation==="TYPE"){
    if(typeof raw.text!=="string"||Buffer.byteLength(raw.text,"utf8")>64*1024||raw.text.includes("\0"))throw new Error("browser_commit_action_text_invalid");
    return sha256(`TYPE\n${bounded(raw.pageUrl,"browser_commit_action_page_url",4000)}\n${bounded(raw.selector,"browser_commit_action_selector",4096)}\n${Buffer.byteLength(raw.text,"utf8")}\n${sha256(raw.text)}`);
  }
  throw new Error("browser_commit_action_operation_invalid");
}

export function browserCommitEnvelopeMaterial(raw){
  exactKeys(raw,["version","ticketId","proposalId","realityBoundCommitId","toolId","authorizationDigest","routeDigest","normalizedArgumentsDigest","downstreamRef","ticketIssuedAt","ticketExpiresAt","ticketConsumedAt","actionDigest"],"browser_commit_envelope");
  if(raw.version!==1)throw new Error("browser_commit_envelope_version_invalid");
  const ticketId=idField(raw.ticketId,"browser_commit_ticket_id"),proposalId=idField(raw.proposalId,"browser_commit_proposal_id"),realityBoundCommitId=idField(raw.realityBoundCommitId,"browser_commit_rbc_id"),toolId=idField(raw.toolId,"browser_commit_tool_id"),authorizationDigest=digestField(raw.authorizationDigest,"browser_commit_authorization_digest"),routeDigest=digestField(raw.routeDigest,"browser_commit_route_digest"),normalizedArgumentsDigest=digestField(raw.normalizedArgumentsDigest,"browser_commit_arguments_digest"),downstreamRef=bounded(raw.downstreamRef,"browser_commit_downstream_ref",1000),actionDigest=digestField(raw.actionDigest,"browser_commit_action_digest"),issued=iso(raw.ticketIssuedAt,"browser_commit_ticket_issued_at"),expires=iso(raw.ticketExpiresAt,"browser_commit_ticket_expires_at"),consumed=iso(raw.ticketConsumedAt,"browser_commit_ticket_consumed_at");
  if(!(issued.ms<=consumed.ms&&consumed.ms<=expires.ms))throw new Error("browser_commit_ticket_time_order_invalid");
  return[DOMAIN,"1",ticketId,proposalId,realityBoundCommitId,toolId,authorizationDigest,routeDigest,normalizedArgumentsDigest,downstreamRef,issued.text,expires.text,consumed.text,actionDigest].join("\n");
}

export function signBrowserCommitEnvelope(raw,secret){
  if(typeof secret!=="string"||secret.length<43)throw new Error("browser_commit_signing_capability_invalid");
  const material=browserCommitEnvelopeMaterial(raw);
  return hmac(secret,material);
}

export function verifyBrowserCommitRequest(raw,secret,{now=Date.now(),clockSkewMs=30_000}={}){
  exactKeys(raw,["version","envelope","action"],"browser_commit_request");
  if(raw.version!==1)throw new Error("browser_commit_request_version_invalid");
  exactKeys(raw.envelope,["version","ticketId","proposalId","realityBoundCommitId","toolId","authorizationDigest","routeDigest","normalizedArgumentsDigest","downstreamRef","ticketIssuedAt","ticketExpiresAt","ticketConsumedAt","actionDigest","signature"],"browser_commit_signed_envelope");
  const {signature,...unsigned}=raw.envelope,material=browserCommitEnvelopeMaterial(unsigned),expected=hmac(secret,material);
  if(!/^[0-9a-f]{64}$/.test(String(signature??""))||!safeEqual(signature,expected))throw new Error("browser_commit_envelope_signature_invalid");
  const actionDigest=browserCommitActionDigest(raw.action);if(actionDigest!==unsigned.actionDigest)throw new Error("browser_commit_action_digest_mismatch");
  const expires=Date.parse(unsigned.ticketExpiresAt),consumed=Date.parse(unsigned.ticketConsumedAt);if(expires<=now)throw new Error("browser_commit_ticket_expired");if(consumed>now+clockSkewMs)throw new Error("browser_commit_ticket_consumed_in_future");
  const dispatchDigest=sha256(material);
  return{...unsigned,signature:String(signature),action:raw.action,dispatchDigest};
}

async function durableWrite(file,value){
  const dir=path.dirname(file),tmp=`${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await mkdir(dir,{recursive:true,mode:0o700});await writeFile(tmp,value,{encoding:"utf8",mode:0o600,flag:"wx"});const fh=await open(tmp,"r+");try{await fh.sync()}finally{await fh.close()}await rename(tmp,file);if(process.platform!=="win32")try{const dh=await open(dir,"r");try{await dh.sync()}finally{await dh.close()}}catch{}
}

export class BrowserCommitReplayJournal{
  constructor(file,secret,{maxEntries=MAX_ENTRIES}={}){if(!path.isAbsolute(file))throw new Error("browser_commit_replay_file_must_be_absolute");if(typeof secret!=="string"||secret.length<43)throw new Error("browser_commit_replay_capability_invalid");if(!Number.isInteger(maxEntries)||maxEntries<1||maxEntries>1_000_000)throw new Error("browser_commit_replay_capacity_invalid");this.file=file;this.secret=secret;this.maxEntries=maxEntries;this.keyId=sha256(secret);this.payload=null;this.chain=Promise.resolve()}
  mac(payload){return hmac(this.secret,`${JOURNAL_DOMAIN}\n${JSON.stringify(payload)}`)}
  fresh(){return{version:1,keyId:this.keyId,spent:[]}}
  async persist(){const envelope={payload:this.payload,mac:this.mac(this.payload)};await durableWrite(this.file,JSON.stringify(envelope)+"\n")}
  async load(){if(this.payload)return;try{const envelope=JSON.parse(await readFile(this.file,"utf8"));if(!envelope?.payload||envelope.payload.version!==1||!Array.isArray(envelope.payload.spent)||typeof envelope.mac!=="string")throw new Error("browser_commit_replay_journal_invalid");if(envelope.payload.keyId!==this.keyId){this.payload=this.fresh();await this.persist();return}const expected=this.mac(envelope.payload);if(!safeEqual(envelope.mac,expected))throw new Error("browser_commit_replay_journal_integrity_failed");for(const row of envelope.payload.spent){exactKeys(row,["ticketId","realityBoundCommitId","dispatchDigest","spentAt"],"browser_commit_replay_entry");idField(row.ticketId,"browser_commit_replay_ticket_id");idField(row.realityBoundCommitId,"browser_commit_replay_rbc_id");digestField(row.dispatchDigest,"browser_commit_replay_dispatch_digest");iso(row.spentAt,"browser_commit_replay_spent_at")}if(envelope.payload.spent.length>this.maxEntries)throw new Error("browser_commit_replay_journal_capacity_exceeded");this.payload=envelope.payload}catch(error){if(error?.code!=="ENOENT")throw error;this.payload=this.fresh();await this.persist()}}
  consume(dispatch){const task=this.chain.then(async()=>{await this.load();if(this.payload.spent.some(row=>row.ticketId===dispatch.ticketId||row.realityBoundCommitId===dispatch.realityBoundCommitId))throw new Error("browser_commit_replay_detected");if(this.payload.spent.length>=this.maxEntries)throw new Error("browser_commit_replay_journal_capacity_exhausted");const spentAt=new Date().toISOString();this.payload={...this.payload,spent:[...this.payload.spent,{ticketId:dispatch.ticketId,realityBoundCommitId:dispatch.realityBoundCommitId,dispatchDigest:dispatch.dispatchDigest,spentAt}]};await this.persist();return{spentAt,dispatchDigest:dispatch.dispatchDigest}});this.chain=task.then(()=>undefined,()=>undefined);return task}
}

export const BrowserCommitEnvelopeConstants={DOMAIN,JOURNAL_DOMAIN,MAX_ENTRIES};
