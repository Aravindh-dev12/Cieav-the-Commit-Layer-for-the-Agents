import crypto from "node:crypto";
import {chmod,mkdir,open,readFile,rename,writeFile} from "node:fs/promises";
import path from "node:path";
import {z} from "zod";
import type {CieavContinuingAuthorityStore} from "./continuing-authority.js";

const ScalarSchema=z.union([z.number().finite(),z.string().max(4096),z.boolean()]);
const RuleSchema=z.object({
  id:z.string().min(1).max(200),metric:z.string().min(1).max(200),operator:z.enum(["EQ","NEQ","LT","LTE","GT","GTE","TRUE","FALSE"]),
  threshold:ScalarSchema.optional(),maxAgeMs:z.number().int().positive().max(60_000),action:z.enum(["STOP","BLOCK","SAFE_STATE"]),reason:z.string().min(1).max(1000)
}).superRefine((v,ctx)=>{
  if(["EQ","NEQ","LT","LTE","GT","GTE"].includes(v.operator)&&v.threshold===undefined)ctx.addIssue({code:z.ZodIssueCode.custom,message:"comparison rule requires threshold"});
  if(["LT","LTE","GT","GTE"].includes(v.operator)&&typeof v.threshold!=="number")ctx.addIssue({code:z.ZodIssueCode.custom,message:"numeric comparison requires numeric threshold"});
});
const PolicySchema=z.object({
  id:z.string().min(1).max(200),version:z.literal(1),enabled:z.boolean(),scope:z.string().min(1).max(500),rules:z.array(RuleSchema).min(1).max(200),updatedAt:z.string().datetime()
});
const SignalSchema=z.object({metric:z.string().min(1).max(200),value:ScalarSchema,observedAt:z.string().datetime(),evidenceRef:z.string().min(1).max(1000)});
const DecisionSchema=z.object({
  id:z.string().uuid(),version:z.literal(1),authority:z.literal(false),executionAuthorityIssued:z.literal(false),policyId:z.string().min(1),scope:z.string().min(1),
  continuingAuthorityId:z.string().uuid().optional(),decision:z.enum(["CONTINUE","STOP_REQUIRED","BLOCKED","SAFE_STATE_REQUIRED"]),triggeredRuleIds:z.array(z.string()),
  reasons:z.array(z.string()),signalDigest:z.string().regex(/^[a-f0-9]{64}$/),createdAt:z.string().datetime()
});
export type ReflexPolicy=z.infer<typeof PolicySchema>;
export type ReflexDecision=z.infer<typeof DecisionSchema>;
type Payload={version:1;policies:ReflexPolicy[];decisions:ReflexDecision[]};
type Envelope={payload:Payload;mac:string};
type ContinuingAuthorityView=Pick<CieavContinuingAuthorityStore,"assertMayContinue"|"revoke">;

const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value as Record<string,unknown>).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(",")}}`:JSON.stringify(value)??"undefined";
const digest=(value:unknown)=>crypto.createHash("sha256").update(canonical(value)).digest("hex");
async function durableReplace(file:string,contents:string){const dir=path.dirname(file),tmp=`${file}.${process.pid}.${crypto.randomUUID()}.tmp`;await writeFile(tmp,contents,{encoding:"utf8",mode:0o600,flag:"wx"});const fh=await open(tmp,"r+");try{await fh.sync()}finally{await fh.close()}await rename(tmp,file);try{await chmod(file,0o600)}catch{}if(process.platform!=="win32")try{const dh=await open(dir,"r");try{await dh.sync()}finally{await dh.close()}}catch{}}

export class CieavReflexLayer{
  private loaded=false;private payload:Payload={version:1,policies:[],decisions:[]};private chain:Promise<void>=Promise.resolve();
  constructor(private readonly file:string,private readonly secret:string,private readonly continuingAuthority:ContinuingAuthorityView){if(secret.length<32)throw new Error("CIEAV reflex-layer secret is too weak")}
  private mac(payload:Payload){return crypto.createHmac("sha256",this.secret).update(`cieav-reflex-layer-state-v1\n${canonical(payload)}`).digest("base64url")}
  private enqueue<T>(fn:()=>Promise<T>):Promise<T>{const task=this.chain.then(fn,fn);this.chain=task.then(()=>undefined,()=>undefined);return task}
  private async load(){if(this.loaded)return;await mkdir(path.dirname(this.file),{recursive:true,mode:0o700});try{const env=JSON.parse(await readFile(this.file,"utf8")) as Envelope;if(env?.payload?.version!==1||!Array.isArray(env.payload.policies)||!Array.isArray(env.payload.decisions)||typeof env.mac!=="string")throw new Error("invalid envelope");const expected=this.mac(env.payload);if(expected.length!==env.mac.length||!crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(env.mac)))throw new Error("integrity check failed");this.payload={version:1,policies:env.payload.policies.map(x=>PolicySchema.parse(x)),decisions:env.payload.decisions.map(x=>DecisionSchema.parse(x))}}catch(err:any){if(err?.code!=="ENOENT")throw new Error(`CIEAV reflex-layer store is unreadable, corrupt, or unauthenticated: ${String(err?.message??err)}`)}this.loaded=true}
  private async persist(){this.payload={version:1,policies:this.payload.policies.slice(-10_000),decisions:this.payload.decisions.slice(-100_000)};await durableReplace(this.file,JSON.stringify({payload:this.payload,mac:this.mac(this.payload)},null,2)+"\n")}
  private triggered(rule:z.infer<typeof RuleSchema>,signal:z.infer<typeof SignalSchema>){const v=signal.value,t=rule.threshold;switch(rule.operator){case"EQ":return v===t;case"NEQ":return v!==t;case"LT":return typeof v==="number"&&v<(t as number);case"LTE":return typeof v==="number"&&v<=(t as number);case"GT":return typeof v==="number"&&v>(t as number);case"GTE":return typeof v==="number"&&v>=(t as number);case"TRUE":return v===true;case"FALSE":return v===false}}
  putPolicy(raw:unknown){return this.enqueue(async()=>{await this.load();const input=PolicySchema.omit({version:true,updatedAt:true}).parse(raw);if(new Set(input.rules.map(x=>x.id)).size!==input.rules.length)throw new Error("duplicate_reflex_rule");const policy=PolicySchema.parse({...input,version:1,updatedAt:new Date().toISOString()});this.payload.policies=this.payload.policies.filter(x=>x.id!==policy.id);this.payload.policies.push(policy);await this.persist();return policy})}
  listPolicies(){return this.enqueue(async()=>{await this.load();return this.payload.policies.slice().sort((a,b)=>a.id.localeCompare(b.id))})}
  listDecisions(){return this.enqueue(async()=>{await this.load();return this.payload.decisions.slice().reverse()})}
  evaluate(policyId:string,signalsRaw:unknown,continuingAuthorityId?:string){return this.enqueue(async()=>{
    await this.load();const policy=this.payload.policies.find(x=>x.id===policyId&&x.enabled);if(!policy)throw new Error("reflex_policy_not_active");const signals=z.array(SignalSchema).max(500).parse(signalsRaw),latest=new Map<string,z.infer<typeof SignalSchema>>();for(const signal of signals){const current=latest.get(signal.metric);if(!current||current.observedAt<signal.observedAt)latest.set(signal.metric,signal)}
    const now=Date.now(),triggeredRules:z.infer<typeof RuleSchema>[]=[],reasons:string[]=[];
    for(const rule of policy.rules){const signal=latest.get(rule.metric);if(!signal){triggeredRules.push({...rule,action:"STOP",reason:`missing required reflex signal ${rule.metric}`});reasons.push(`missing required reflex signal ${rule.metric}`);continue}const age=now-Date.parse(signal.observedAt);if(!Number.isFinite(age)||age< -5_000||age>rule.maxAgeMs){triggeredRules.push({...rule,action:"STOP",reason:`stale reflex signal ${rule.metric}`});reasons.push(`stale reflex signal ${rule.metric}`);continue}if(this.triggered(rule,signal)){triggeredRules.push(rule);reasons.push(rule.reason)}}
    const severity=(action:string)=>action==="SAFE_STATE"?3:action==="STOP"?2:action==="BLOCK"?1:0;const strongest=triggeredRules.reduce((best,rule)=>severity(rule.action)>severity(best)?rule.action:best,"CONTINUE" as "CONTINUE"|"STOP"|"BLOCK"|"SAFE_STATE");const decisionValue=strongest==="SAFE_STATE"?"SAFE_STATE_REQUIRED":strongest==="STOP"?"STOP_REQUIRED":strongest==="BLOCK"?"BLOCKED":"CONTINUE";
    if(continuingAuthorityId){if(decisionValue==="CONTINUE")await this.continuingAuthority.assertMayContinue(continuingAuthorityId);else await this.continuingAuthority.revoke(continuingAuthorityId,`reflex:${decisionValue}:${reasons.join("; ").slice(0,800)}`)}
    const decision=DecisionSchema.parse({id:crypto.randomUUID(),version:1,authority:false,executionAuthorityIssued:false,policyId:policy.id,scope:policy.scope,...(continuingAuthorityId?{continuingAuthorityId}:{}),decision:decisionValue,triggeredRuleIds:triggeredRules.map(x=>x.id),reasons,signalDigest:digest(signals),createdAt:new Date().toISOString()});this.payload.decisions.push(decision);await this.persist();return decision;
  })}
  async close(){await this.chain}
}
