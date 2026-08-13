import crypto from "node:crypto";
import {chmod,mkdir,readFile,rename,writeFile} from "node:fs/promises";
import path from "node:path";
import {OrganizationPolicyCreateSchema,OrganizationPolicySchema,type EnterprisePolicyDecision,type OrganizationPolicy} from "@cieav/contracts/policy";
import type {ActionProposal,IntentContract} from "@cieav/contracts/reality";
import {evaluateEnterprisePolicy} from "@cieav/core/policy";

const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value as Record<string,unknown>).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(",")}}`:JSON.stringify(value);
type Payload={version:1;policies:OrganizationPolicy[]};type Envelope={payload:Payload;mac:string};
export class CieavPolicyStore{
  private loaded=false;private policies=new Map<string,OrganizationPolicy>();private chain:Promise<void>=Promise.resolve();
  constructor(private readonly file:string,private readonly secret:string){if(secret.length<32)throw new Error("CIEAV policy-store signing secret is too weak")}
  private mac(payload:Payload){return crypto.createHmac("sha256",this.secret).update(canonical(payload)).digest("base64url")}
  private async load(){if(this.loaded)return;await mkdir(path.dirname(this.file),{recursive:true,mode:0o700});try{const env=JSON.parse(await readFile(this.file,"utf8")) as Envelope;if(env?.payload?.version!==1||!Array.isArray(env.payload.policies)||typeof env.mac!=="string")throw new Error("invalid envelope");const expected=this.mac(env.payload);if(expected.length!==env.mac.length||!crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(env.mac)))throw new Error("integrity check failed");for(const raw of env.payload.policies){const value=OrganizationPolicySchema.parse(raw);this.policies.set(value.organizationId,value)}}catch(err:any){if(err?.code!=="ENOENT")throw new Error(`CIEAV policy store is unreadable, corrupt, or unauthenticated: ${String(err?.message??err)}`)}this.loaded=true}
  private enqueue<T>(fn:()=>Promise<T>):Promise<T>{const task=this.chain.then(fn,fn);this.chain=task.then(()=>undefined,()=>undefined);return task}
  private async persist(){const policies=[...this.policies.values()].sort((a,b)=>a.organizationId.localeCompare(b.organizationId)),payload:Payload={version:1,policies},env:Envelope={payload,mac:this.mac(payload)},tmp=`${this.file}.${process.pid}.${crypto.randomUUID()}.tmp`;await writeFile(tmp,JSON.stringify(env,null,2)+"\n",{encoding:"utf8",mode:0o600,flag:"wx"});await rename(tmp,this.file);try{await chmod(this.file,0o600)}catch{}}
  get(organizationId:string){return this.enqueue(async()=>{await this.load();return this.policies.get(organizationId)??null})}
  list(){return this.enqueue(async()=>{await this.load();return[...this.policies.values()].sort((a,b)=>a.organizationId.localeCompare(b.organizationId))})}
  put(raw:unknown){return this.enqueue(async()=>{await this.load();const input=OrganizationPolicyCreateSchema.parse(raw),existing=this.policies.get(input.organizationId),now=new Date().toISOString(),value=OrganizationPolicySchema.parse({id:existing?.id??crypto.randomUUID(),createdAt:existing?.createdAt??now,updatedAt:now,...input});this.policies.set(value.organizationId,value);await this.persist();return value})}
  async close(){await this.chain}
}

export class CieavPolicyApi{
  readonly store:CieavPolicyStore;
  constructor(file:string,secret:string){this.store=new CieavPolicyStore(file,secret)}
  async evaluate(intent:IntentContract,proposal:ActionProposal):Promise<EnterprisePolicyDecision|null>{const organizationId=intent.contextLabels.organizationId?.trim();if(!organizationId)return null;const policy=await this.store.get(organizationId);return policy?evaluateEnterprisePolicy(policy,intent,proposal):null}
}
