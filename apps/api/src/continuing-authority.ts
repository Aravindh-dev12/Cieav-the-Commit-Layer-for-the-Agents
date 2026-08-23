import crypto from "node:crypto";
import {chmod,mkdir,open,readFile,rename,writeFile} from "node:fs/promises";
import path from "node:path";
import {z} from "zod";
import type {CieavExecutionFabricStore} from "./execution-fabric.js";

const ObservationValueSchema=z.union([z.number().finite(),z.string().max(4096),z.boolean()]);
const ConditionSchema=z.object({
  id:z.string().min(1).max(200),
  metric:z.string().min(1).max(200),
  operator:z.enum(["EQ","LTE","GTE","BETWEEN","TRUE","FRESH"]),
  expected:ObservationValueSchema.optional(),
  min:z.number().finite().optional(),
  max:z.number().finite().optional(),
  maxAgeMs:z.number().int().positive().max(86_400_000)
}).superRefine((value,ctx)=>{
  if(value.operator==="EQ"&&value.expected===undefined)ctx.addIssue({code:z.ZodIssueCode.custom,message:"EQ requires expected"});
  if(value.operator==="BETWEEN"&&(value.min===undefined||value.max===undefined||value.min>value.max))ctx.addIssue({code:z.ZodIssueCode.custom,message:"BETWEEN requires ordered min/max"});
  if((value.operator==="LTE"||value.operator==="GTE")&&typeof value.expected!=="number")ctx.addIssue({code:z.ZodIssueCode.custom,message:`${value.operator} requires numeric expected`});
});
const BudgetSchema=z.object({dimension:z.string().min(1).max(100),limit:z.number().positive().finite(),consumed:z.number().nonnegative().finite().default(0)});
const ObservationSchema=z.object({metric:z.string().min(1).max(200),value:ObservationValueSchema,observedAt:z.string().datetime(),evidenceRef:z.string().min(1).max(1000)});
const SessionSchema=z.object({
  id:z.string().uuid(),version:z.literal(1),authority:z.literal(false),executionAuthorityIssued:z.literal(false),
  subjectId:z.string().min(1).max(500),taskId:z.string().min(1).max(500),proposalId:z.string().min(1).max(500),
  realityBoundCommitId:z.string().min(1).max(500),executionTicketId:z.string().min(1).max(500),
  operation:z.string().min(1).max(500),normalizedArgumentsDigest:z.string().regex(/^[a-f0-9]{64}$/),
  bindingDigest:z.string().regex(/^[a-f0-9]{64}$/),createdAt:z.string().datetime(),expiresAt:z.string().datetime(),
  state:z.enum(["ACTIVE","STOP_REQUIRED","REVOKED","EXPIRED","COMPLETED"]),stopReason:z.string().max(1000).optional(),
  conditions:z.array(ConditionSchema).max(100),budgets:z.array(BudgetSchema).max(100),observations:z.array(ObservationSchema).max(10_000)
});
const CreateSchema=SessionSchema.pick({subjectId:true,taskId:true,proposalId:true,realityBoundCommitId:true,executionTicketId:true,operation:true,normalizedArgumentsDigest:true,expiresAt:true,conditions:true}).extend({budgets:z.array(BudgetSchema.omit({consumed:true}).extend({consumed:z.number().nonnegative().finite().optional()})).max(100)});

export type ContinuingAuthoritySession=z.infer<typeof SessionSchema>;
export type ContinuingAuthorityObservation=z.infer<typeof ObservationSchema>;
type CreateInput=z.infer<typeof CreateSchema>;
type Payload={version:1;sessions:ContinuingAuthoritySession[]};
type Envelope={payload:Payload;mac:string};
type ExecutionFabricView=Pick<CieavExecutionFabricStore,"listTickets"|"getProposalRecord">;

const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value as Record<string,unknown>).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(",")}}`:JSON.stringify(value)??"undefined";
const digest=(value:unknown)=>crypto.createHash("sha256").update(canonical(value)).digest("hex");

async function durableReplace(file:string,contents:string){
  const dir=path.dirname(file),tmp=`${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await writeFile(tmp,contents,{encoding:"utf8",mode:0o600,flag:"wx"});
  const fh=await open(tmp,"r+");try{await fh.sync()}finally{await fh.close()}
  await rename(tmp,file);try{await chmod(file,0o600)}catch{}
  if(process.platform!=="win32")try{const dh=await open(dir,"r");try{await dh.sync()}finally{await dh.close()}}catch{}
}

export class CieavContinuingAuthorityStore{
  private loaded=false;
  private sessions=new Map<string,ContinuingAuthoritySession>();
  private chain:Promise<void>=Promise.resolve();
  constructor(private readonly file:string,private readonly secret:string,private readonly executionFabric:ExecutionFabricView){
    if(secret.length<32)throw new Error("CIEAV continuing-authority secret is too weak");
  }
  private mac(payload:Payload){return crypto.createHmac("sha256",this.secret).update(`cieav-continuing-authority-state-v1\n${canonical(payload)}`).digest("base64url")}
  private enqueue<T>(fn:()=>Promise<T>):Promise<T>{const task=this.chain.then(fn,fn);this.chain=task.then(()=>undefined,()=>undefined);return task}
  private async load(){
    if(this.loaded)return;
    await mkdir(path.dirname(this.file),{recursive:true,mode:0o700});
    try{
      const env=JSON.parse(await readFile(this.file,"utf8")) as Envelope;
      if(env?.payload?.version!==1||!Array.isArray(env.payload.sessions)||typeof env.mac!=="string")throw new Error("invalid envelope");
      const expected=this.mac(env.payload);
      if(expected.length!==env.mac.length||!crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(env.mac)))throw new Error("integrity check failed");
      for(const raw of env.payload.sessions){const session=SessionSchema.parse(raw);this.sessions.set(session.id,session)}
    }catch(err:any){if(err?.code!=="ENOENT")throw new Error(`CIEAV continuing-authority store is unreadable, corrupt, or unauthenticated: ${String(err?.message??err)}`)}
    this.loaded=true;
  }
  private async persist(){
    const sessions=[...this.sessions.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,10_000),payload:Payload={version:1,sessions};
    await durableReplace(this.file,JSON.stringify({payload,mac:this.mac(payload)},null,2)+"\n");
    this.sessions=new Map(sessions.map(x=>[x.id,x]));
  }
  private expectedBinding(input:Pick<ContinuingAuthoritySession,"subjectId"|"taskId"|"proposalId"|"realityBoundCommitId"|"executionTicketId"|"operation"|"normalizedArgumentsDigest"|"expiresAt"|"conditions"|"budgets">){
    return digest({protocol:"CIEAV_CONTINUING_AUTHORITY_V1",...input,budgets:input.budgets.map(x=>({dimension:x.dimension,limit:x.limit}))});
  }
  private async assertExecutionBinding(input:Pick<ContinuingAuthoritySession,"subjectId"|"taskId"|"proposalId"|"realityBoundCommitId"|"executionTicketId"|"operation"|"normalizedArgumentsDigest">){
    const tickets=await this.executionFabric.listTickets(),ticket=tickets.find(x=>x.id===input.executionTicketId);
    if(!ticket||ticket.status!=="CONSUMED")throw new Error("consumed_execution_ticket_required");
    if(ticket.proposalId!==input.proposalId||ticket.realityBoundCommitId!==input.realityBoundCommitId)throw new Error("continuing_authority_ticket_binding_mismatch");
    const record=await this.executionFabric.getProposalRecord(input.proposalId);
    if(!record)throw new Error("execution_proposal_not_found");
    const proposal=record.proposal;
    if(proposal.taskId!==input.taskId||proposal.subjectId!==input.subjectId||proposal.operation!==input.operation||proposal.normalizedArgumentsDigest!==input.normalizedArgumentsDigest)throw new Error("continuing_authority_proposal_binding_mismatch");
  }
  private conditionFailure(session:ContinuingAuthoritySession,nowMs:number):string|null{
    const latest=new Map<string,ContinuingAuthorityObservation>();
    for(const observation of session.observations){const current=latest.get(observation.metric);if(!current||current.observedAt<observation.observedAt)latest.set(observation.metric,observation)}
    for(const condition of session.conditions){
      const observation=latest.get(condition.metric);
      if(!observation)return `condition ${condition.id} has no evidence`;
      const age=nowMs-Date.parse(observation.observedAt);
      if(!Number.isFinite(age)||age< -60_000||age>condition.maxAgeMs)return `condition ${condition.id} evidence is stale`;
      const value=observation.value;
      if(condition.operator==="FRESH")continue;
      if(condition.operator==="TRUE"&&value!==true)return `condition ${condition.id} is false`;
      if(condition.operator==="EQ"&&value!==condition.expected)return `condition ${condition.id} does not equal required value`;
      if(condition.operator==="LTE"&&(typeof value!=="number"||value>(condition.expected as number)))return `condition ${condition.id} exceeds maximum`;
      if(condition.operator==="GTE"&&(typeof value!=="number"||value<(condition.expected as number)))return `condition ${condition.id} is below minimum`;
      if(condition.operator==="BETWEEN"&&(typeof value!=="number"||value<(condition.min as number)||value>(condition.max as number)))return `condition ${condition.id} is outside range`;
    }
    for(const budget of session.budgets)if(budget.consumed>budget.limit)return `autonomy budget ${budget.dimension} exhausted`;
    return null;
  }
  private withTerminalState(session:ContinuingAuthoritySession,nowMs:number){
    if(session.state!=="ACTIVE")return session;
    if(Date.parse(session.expiresAt)<=nowMs)return SessionSchema.parse({...session,state:"EXPIRED",stopReason:"continuing authority expired"});
    const failure=this.conditionFailure(session,nowMs);
    return failure?SessionSchema.parse({...session,state:"STOP_REQUIRED",stopReason:failure}):session;
  }

  create(raw:unknown){return this.enqueue(async()=>{
    await this.load();const input:CreateInput=CreateSchema.parse(raw),now=Date.now();
    if(Date.parse(input.expiresAt)<=now)throw new Error("continuing_authority_expiry_invalid");
    if(new Set(input.conditions.map(x=>x.id)).size!==input.conditions.length)throw new Error("duplicate_continuing_authority_condition");
    if(new Set(input.budgets.map(x=>x.dimension)).size!==input.budgets.length)throw new Error("duplicate_autonomy_budget_dimension");
    await this.assertExecutionBinding(input);
    const budgets=input.budgets.map(x=>BudgetSchema.parse({...x,consumed:x.consumed??0}));
    const base={...input,budgets},createdAt=new Date(now).toISOString();
    const session=SessionSchema.parse({id:crypto.randomUUID(),version:1,authority:false,executionAuthorityIssued:false,...base,bindingDigest:this.expectedBinding(base),state:"ACTIVE",observations:[]});
    this.sessions.set(session.id,session);await this.persist();return session;
  })}
  get(id:string){return this.enqueue(async()=>{await this.load();return this.sessions.get(id)??null})}
  list(){return this.enqueue(async()=>{await this.load();return[...this.sessions.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt))})}
  recordObservation(id:string,raw:unknown){return this.enqueue(async()=>{
    await this.load();const current=this.sessions.get(id);if(!current)throw new Error("continuing_authority_not_found");
    if(current.state!=="ACTIVE")throw new Error("continuing_authority_not_active");
    const observation=ObservationSchema.parse(raw),now=Date.now();
    if(Date.parse(observation.observedAt)>now+60_000)throw new Error("continuing_authority_observation_from_future");
    const observations=[...current.observations,observation].slice(-10_000),next=SessionSchema.parse({...current,observations});
    this.sessions.set(id,next);await this.persist();return next;
  })}
  consumeBudget(id:string,dimension:string,amount:number){return this.enqueue(async()=>{
    await this.load();if(!Number.isFinite(amount)||amount<=0)throw new Error("invalid_autonomy_budget_consumption");
    const current=this.sessions.get(id);if(!current)throw new Error("continuing_authority_not_found");
    await this.assertExecutionBinding(current);
    let next=this.withTerminalState(current,Date.now());
    if(next.state!=="ACTIVE"){this.sessions.set(id,next);await this.persist();throw new Error(next.stopReason??"continuing_authority_not_active")}
    const index=next.budgets.findIndex(x=>x.dimension===dimension);if(index<0)throw new Error("autonomy_budget_dimension_not_found");
    const budgets=next.budgets.slice(),budget=budgets[index]!;budgets[index]=BudgetSchema.parse({...budget,consumed:budget.consumed+amount});
    next=SessionSchema.parse({...next,budgets});next=this.withTerminalState(next,Date.now());this.sessions.set(id,next);await this.persist();
    if(next.state!=="ACTIVE")throw new Error(next.stopReason??"continuing_authority_stop_required");return next;
  })}
  assertMayContinue(id:string,now=new Date()){return this.enqueue(async()=>{
    await this.load();const current=this.sessions.get(id);if(!current)throw new Error("continuing_authority_not_found");
    await this.assertExecutionBinding(current);const next=this.withTerminalState(current,now.getTime());
    if(next!==current){this.sessions.set(id,next);await this.persist()}
    if(next.state!=="ACTIVE")throw new Error(next.stopReason??`continuing_authority_${next.state.toLowerCase()}`);
    return{session:next,bindingDigest:next.bindingDigest,mayContinue:true as const,authority:false as const,executionAuthorityIssued:false as const};
  })}
  revoke(id:string,reason="continuing authority revoked"){return this.enqueue(async()=>{await this.load();const current=this.sessions.get(id);if(!current)throw new Error("continuing_authority_not_found");if(current.state==="COMPLETED")throw new Error("continuing_authority_already_completed");const next=SessionSchema.parse({...current,state:"REVOKED",stopReason:reason.slice(0,1000)});this.sessions.set(id,next);await this.persist();return next})}
  complete(id:string){return this.enqueue(async()=>{await this.load();const current=this.sessions.get(id);if(!current)throw new Error("continuing_authority_not_found");if(current.state!=="ACTIVE")throw new Error("continuing_authority_not_active");await this.assertExecutionBinding(current);const checked=this.withTerminalState(current,Date.now());if(checked.state!=="ACTIVE"){this.sessions.set(id,checked);await this.persist();throw new Error(checked.stopReason??"continuing_authority_stop_required")}const next=SessionSchema.parse({...checked,state:"COMPLETED"});this.sessions.set(id,next);await this.persist();return next})}
  async close(){await this.chain}
}
