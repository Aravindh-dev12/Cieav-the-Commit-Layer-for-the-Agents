import crypto from "node:crypto";
import {chmod,mkdir,open,readFile,rename,writeFile} from "node:fs/promises";
import path from "node:path";
import {
  AgentIdentityAttestationSchema,
  ExecutionAuditEventSchema,
  ExecutionProposalSchema,
  ExecutionTicketSchema,
  FederatedToolSchema,
  FormalAuthorizationDecisionSchema,
  FormalPermissionGraphSchema,
  ScopedCredentialLeaseSchema,
  type AgentIdentityAttestation,
  type ExecutionAuditEvent,
  type ExecutionProposal,
  type ExecutionTicket,
  type FederatedTool,
  type FormalAuthorizationDecision,
  type FormalPermissionGraph,
  type ScopedCredentialLease
} from "@cieav/contracts/execution-fabric";
import {digest,evaluateFormalAuthorization,executionBindingDigest,permissionGraphDigest} from "@cieav/core/execution-fabric";
import type {CieavAgentKernelStore} from "./agent-kernel.js";
import {semanticEffectKey} from "./intent-reality-engine.js";

const riskRank={LOW:0,MEDIUM:1,HIGH:2,CRITICAL:3} as const;
const member=(items:string[],value:string)=>items.includes("*")||items.includes(value);
const canonical=(value:unknown):string=>
  Array.isArray(value)?`[${value.map(canonical).join(",")}]`:
  value&&typeof value==="object"?`{${Object.keys(value as Record<string,unknown>).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(",")}}`:
  JSON.stringify(value)??"undefined";

type ProposalRecord={proposal:ExecutionProposal;decision:FormalAuthorizationDecision};
type Payload={
  version:1;
  attestations:AgentIdentityAttestation[];
  tools:FederatedTool[];
  leases:ScopedCredentialLease[];
  graphs:FormalPermissionGraph[];
  proposals:ProposalRecord[];
  tickets:ExecutionTicket[];
  audit:ExecutionAuditEvent[];
};
type Envelope={payload:Payload;mac:string};
const empty=():Payload=>({version:1,attestations:[],tools:[],leases:[],graphs:[],proposals:[],tickets:[],audit:[]});

async function durableReplace(file:string,contents:string){
  const dir=path.dirname(file),tmp=`${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await writeFile(tmp,contents,{encoding:"utf8",mode:0o600,flag:"wx"});
  const fh=await open(tmp,"r+");
  try{await fh.sync()}finally{await fh.close()}
  await rename(tmp,file);
  try{await chmod(file,0o600)}catch{}
  if(process.platform!=="win32"){
    try{const dh=await open(dir,"r");try{await dh.sync()}finally{await dh.close()}}catch{}
  }
}

export class CieavExecutionFabricStore{
  private loaded=false;
  private payload:Payload=empty();
  private chain:Promise<void>=Promise.resolve();

  constructor(private readonly file:string,private readonly secret:string,private readonly kernel:CieavAgentKernelStore){
    if(secret.length<32)throw new Error("CIEAV execution-fabric secret is too weak");
  }

  private mac(payload:Payload){return crypto.createHmac("sha256",this.secret).update(canonical(payload)).digest("base64url")}
  private signAttestationBase(base:Omit<AgentIdentityAttestation,"id"|"signature">){return crypto.createHmac("sha256",this.secret).update(`cieav-agent-attestation-v1\n${canonical(base)}`).digest("base64url")}
  private verifyAttestation(attestation:AgentIdentityAttestation){
    const {id:_,signature,...base}=attestation,expected=this.signAttestationBase(base);
    return signature.length===expected.length&&crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected));
  }
  private enqueue<T>(fn:()=>Promise<T>):Promise<T>{const task=this.chain.then(fn,fn);this.chain=task.then(()=>undefined,()=>undefined);return task}

  private verifyAuditChain(events:ExecutionAuditEvent[]){
    let previous:string|undefined;
    for(const event of events){
      if(event.previousHash!==previous)throw new Error("execution audit previous-hash chain mismatch");
      const {id:_,eventHash,...base}=event;
      if(eventHash!==digest(base))throw new Error("execution audit event hash mismatch");
      previous=eventHash;
    }
  }

  private async load(){
    if(this.loaded)return;
    await mkdir(path.dirname(this.file),{recursive:true,mode:0o700});
    try{
      const env=JSON.parse(await readFile(this.file,"utf8")) as Envelope;
      if(env?.payload?.version!==1||typeof env.mac!=="string")throw new Error("invalid envelope");
      const expected=this.mac(env.payload);
      if(expected.length!==env.mac.length||!crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(env.mac)))throw new Error("integrity check failed");
      this.payload={
        version:1,
        attestations:(env.payload.attestations??[]).map(x=>AgentIdentityAttestationSchema.parse(x)),
        tools:(env.payload.tools??[]).map(x=>FederatedToolSchema.parse(x)),
        leases:(env.payload.leases??[]).map(x=>ScopedCredentialLeaseSchema.parse(x)),
        graphs:(env.payload.graphs??[]).map(x=>FormalPermissionGraphSchema.parse(x)),
        proposals:(env.payload.proposals??[]).map(x=>({proposal:ExecutionProposalSchema.parse(x.proposal),decision:FormalAuthorizationDecisionSchema.parse(x.decision)})),
        tickets:(env.payload.tickets??[]).map(x=>ExecutionTicketSchema.parse(x)),
        audit:(env.payload.audit??[]).map(x=>ExecutionAuditEventSchema.parse(x))
      };
      if(this.payload.attestations.some(a=>!this.verifyAttestation(a)))throw new Error("agent attestation signature verification failed");
      this.verifyAuditChain(this.payload.audit);
    }catch(err:any){
      if(err?.code!=="ENOENT")throw new Error(`CIEAV execution fabric is unreadable, corrupt, or unauthenticated: ${String(err?.message??err)}`);
    }
    this.loaded=true;
  }

  private async persist(){
    const p:Payload={
      version:1,
      attestations:this.payload.attestations.slice(-10_000),
      tools:this.payload.tools.slice(-10_000),
      leases:this.payload.leases.slice(-50_000),
      graphs:this.payload.graphs.slice(-10_000),
      proposals:this.payload.proposals.slice(-100_000),
      tickets:this.payload.tickets.slice(-100_000),
      audit:this.payload.audit.slice(-250_000)
    };
    this.verifyAuditChain(p.audit);
    await durableReplace(this.file,JSON.stringify({payload:p,mac:this.mac(p)},null,2)+"\n");
    this.payload=p;
  }

  private appendAudit(input:Omit<ExecutionAuditEvent,"id"|"version"|"previousHash"|"eventHash"|"createdAt">){
    const previous=this.payload.audit.at(-1)?.eventHash,createdAt=new Date().toISOString();
    const base={version:1 as const,...input,...(previous?{previousHash:previous}:{}),createdAt};
    const event=ExecutionAuditEventSchema.parse({...base,id:crypto.randomUUID(),eventHash:digest(base)});
    this.payload.audit.push(event);
    return event;
  }

  private activeAttestation(id:string,subjectId?:string){
    const a=this.payload.attestations.find(x=>x.id===id);
    return a&&this.verifyAttestation(a)&&Date.parse(a.expiresAt)>Date.now()&&(!subjectId||a.subjectId===subjectId)?a:null;
  }
  private activeLease(id:string){const l=this.payload.leases.find(x=>x.id===id);return l&&!l.revokedAt&&Date.parse(l.expiresAt)>Date.now()&&l.used<l.maxUses?l:null}
  private activeTool(id:string){return this.payload.tools.find(x=>x.id===id&&x.enabled)??null}

  registerAttestation(raw:unknown){
    return this.enqueue(async()=>{
      await this.load();
      const unsigned=AgentIdentityAttestationSchema.omit({id:true,signature:true,issuer:true}).parse(raw);
      const base={...unsigned,issuer:"cieav-local-authority"};
      const attestation=AgentIdentityAttestationSchema.parse({...base,id:crypto.randomUUID(),signature:this.signAttestationBase(base)});
      if(Date.parse(attestation.expiresAt)<=Date.now()||Date.parse(attestation.issuedAt)>Date.now()+60_000)throw new Error("invalid_attestation_time_window");
      this.payload.attestations.push(attestation);
      this.appendAudit({scopeDeviceId:"dev_identity_registry",phase:"IDENTITY",outcome:"PASS",summary:`CIEAV locally attested agent identity ${attestation.subjectId}.`,detailsDigest:digest({...attestation,signature:"redacted"})});
      await this.persist();
      return attestation;
    });
  }
  listAttestations(){return this.enqueue(async()=>{await this.load();return this.payload.attestations.slice().reverse()})}

  putTool(raw:unknown){return this.enqueue(async()=>{await this.load();const tool=FederatedToolSchema.parse(raw);this.payload.tools=this.payload.tools.filter(x=>x.id!==tool.id);this.payload.tools.push(tool);await this.persist();return tool})}
  listTools(){return this.enqueue(async()=>{await this.load();return this.payload.tools.slice().sort((a,b)=>a.id.localeCompare(b.id))})}

  issueLease(raw:unknown){
    return this.enqueue(async()=>{
      await this.load();
      const candidate=ScopedCredentialLeaseSchema.parse(raw),attestation=this.activeAttestation(candidate.identityAttestationId);
      if(!attestation)throw new Error("verified_agent_attestation_required");
      if(Date.parse(candidate.expiresAt)<=Date.now()||Date.parse(candidate.expiresAt)>Date.parse(attestation.expiresAt))throw new Error("credential_lease_time_window_invalid");
      const expected=digest({version:candidate.version,sessionId:candidate.sessionId,identityAttestationId:candidate.identityAttestationId,scopeDeviceId:candidate.scopeDeviceId,audience:candidate.audience,allowedIntentIds:candidate.allowedIntentIds,allowedToolIds:candidate.allowedToolIds,allowedOperations:candidate.allowedOperations,maxRisk:candidate.maxRisk,credentialRefDigest:candidate.credentialRefDigest,issuedAt:candidate.issuedAt,expiresAt:candidate.expiresAt,maxUses:candidate.maxUses});
      if(candidate.bindingDigest!==expected)throw new Error("credential_lease_binding_mismatch");
      this.payload.leases=this.payload.leases.filter(x=>x.id!==candidate.id);
      this.payload.leases.push(candidate);
      await this.persist();
      return candidate;
    });
  }
  revokeLease(id:string){return this.enqueue(async()=>{await this.load();const i=this.payload.leases.findIndex(x=>x.id===id);if(i<0)throw new Error("credential_lease_not_found");const current=this.payload.leases[i]!,next=ScopedCredentialLeaseSchema.parse({...current,revokedAt:current.revokedAt??new Date().toISOString()});this.payload.leases[i]=next;await this.persist();return next})}
  listLeases(){return this.enqueue(async()=>{await this.load();return this.payload.leases.slice().reverse()})}

  putPermissionGraph(raw:unknown){
    return this.enqueue(async()=>{
      await this.load();
      const input=FormalPermissionGraphSchema.omit({digest:true}).parse(raw),graph=FormalPermissionGraphSchema.parse({...input,digest:permissionGraphDigest(input)});
      this.payload.graphs=this.payload.graphs.filter(x=>!(x.scopeDeviceId===graph.scopeDeviceId&&x.rootIntentId===graph.rootIntentId));
      this.payload.graphs.push(graph);
      await this.persist();
      return graph;
    });
  }
  listPermissionGraphs(){return this.enqueue(async()=>{await this.load();return this.payload.graphs.slice().reverse()})}

  authorize(raw:unknown){
    return this.enqueue(async()=>{
      await this.load();
      const proposal=ExecutionProposalSchema.parse(raw),task=await this.kernel.get(proposal.taskId);
      if(!task||task.intentId!==proposal.intentId||task.scopeDeviceId!==proposal.scopeDeviceId||task.actor.id!==proposal.subjectId)throw new Error("execution_proposal_task_binding_mismatch");
      const attestation=this.activeAttestation(proposal.identityAttestationId,proposal.subjectId);
      if(!attestation)throw new Error("verified_agent_attestation_required");
      const lease=this.activeLease(proposal.credentialLeaseId);
      if(!lease||lease.identityAttestationId!==attestation.id||lease.sessionId!==task.sessionId||lease.scopeDeviceId!==proposal.scopeDeviceId||!lease.allowedIntentIds.includes(proposal.intentId)||!member(lease.allowedToolIds,proposal.toolId)||!member(lease.allowedOperations,proposal.operation)||!(["*",`tool:${proposal.toolId}`,proposal.toolId].includes(lease.audience))||riskRank[proposal.risk]>riskRank[lease.maxRisk])throw new Error("credential_lease_scope_violation");
      const tool=this.activeTool(proposal.toolId);
      if(!tool||tool.protocol!==proposal.protocol||tool.operation!==proposal.operation||riskRank[proposal.risk]>riskRank[tool.risk])throw new Error("registered_tool_scope_violation");
      const graph=this.payload.graphs.find(x=>x.scopeDeviceId===proposal.scopeDeviceId&&x.rootIntentId===proposal.intentId);
      if(!graph)throw new Error("formal_permission_graph_required");
      const decision=evaluateFormalAuthorization(graph,proposal);
      this.payload.proposals=this.payload.proposals.filter(x=>x.proposal.id!==proposal.id);
      this.payload.proposals.push({proposal,decision});
      this.appendAudit({scopeDeviceId:proposal.scopeDeviceId,intentId:proposal.intentId,taskId:proposal.taskId,proposalId:proposal.id,phase:"AUTHORIZE",outcome:decision.decision==="ALLOW"?"PASS":decision.decision==="ASK"?"ASK":"BLOCK",summary:decision.reasons.join(" ").slice(0,1200),detailsDigest:digest(decision)});
      await this.persist();
      return{proposal,decision,bindingDigest:executionBindingDigest(proposal,graph.digest)};
    });
  }

  issueTicket(proposalId:string,realityBoundCommitId:string,ttlSeconds=30){
    return this.enqueue(async()=>{
      await this.load();
      const record=this.payload.proposals.find(x=>x.proposal.id===proposalId);
      if(!record)throw new Error("execution_proposal_not_found");
      if(record.decision.decision!=="ALLOW")throw new Error("formal_authorization_not_allow");
      if(this.payload.tickets.some(x=>(x.proposalId===proposalId||x.realityBoundCommitId===realityBoundCommitId)&&["ISSUED","CONSUMED"].includes(x.status)))throw new Error("execution_ticket_already_issued");
      const proposal=record.proposal,task=await this.kernel.get(proposal.taskId);
      if(!task||task.realityBoundCommitId!==realityBoundCommitId||!task.realityCommitConsumedAt)throw new Error("consumed_reality_bound_commit_required");
      if(!this.activeAttestation(proposal.identityAttestationId,proposal.subjectId))throw new Error("verified_agent_attestation_required");
      const lease=this.activeLease(proposal.credentialLeaseId);
      if(!lease||lease.sessionId!==task.sessionId)throw new Error("credential_lease_not_active");
      const tool=this.activeTool(proposal.toolId);
      if(!tool||tool.protocol!==proposal.protocol||tool.operation!==proposal.operation)throw new Error("registered_tool_not_active");
      const graph=this.payload.graphs.find(x=>x.scopeDeviceId===proposal.scopeDeviceId&&x.rootIntentId===proposal.intentId);
      if(!graph||graph.digest!==record.decision.graphDigest||evaluateFormalAuthorization(graph,proposal).decision!=="ALLOW")throw new Error("formal_authorization_changed_before_execution");
      const commits=await this.kernel.intentReality.listRealityBoundCommits(),commit=commits.find(x=>x.id===realityBoundCommitId);
      if(!commit||commit.status!=="CONSUMED"||commit.taskId!==proposal.taskId||commit.intentId!==proposal.intentId||commit.effectKey!==semanticEffectKey(proposal.intentId,proposal.semanticEffect)||commit.preStateDigest!==proposal.realityWitness.digest||commit.expectedPostStateDigest!==proposal.expectedPostStateDigest||commit.proofObligationDigest!==proposal.proofObligationDigest)throw new Error("execution_proposal_reality_commit_binding_mismatch");
      const ttl=Math.max(5,Math.min(60,Math.floor(ttlSeconds))),now=Date.now();
      const authorizationDigest=digest(record.decision),routeDigest=digest({toolId:proposal.toolId,protocol:proposal.protocol,operation:proposal.operation,target:proposal.target??null,normalizedArgumentsDigest:proposal.normalizedArgumentsDigest});
      const ticket=ExecutionTicketSchema.parse({id:crypto.randomUUID(),version:1,proposalId:proposal.id,intentId:proposal.intentId,taskId:proposal.taskId,toolId:proposal.toolId,authorizationDigest,realityBoundCommitId,credentialLeaseId:lease.id,routeDigest,issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+ttl*1000).toISOString(),status:"ISSUED"});
      this.payload.tickets.push(ticket);
      this.appendAudit({scopeDeviceId:proposal.scopeDeviceId,intentId:proposal.intentId,taskId:proposal.taskId,proposalId:proposal.id,ticketId:ticket.id,phase:"COMMIT",outcome:"PASS",summary:"Execution ticket issued only after fresh formal authorization and consumed Reality-Bound Commit.",detailsDigest:digest(ticket)});
      await this.persist();
      return ticket;
    });
  }

  inspectTicket(id:string){
    return this.enqueue(async()=>{
      await this.load();
      const ticket=this.payload.tickets.find(x=>x.id===id);
      if(!ticket)throw new Error("execution_ticket_not_found");
      if(ticket.status!=="ISSUED"||Date.parse(ticket.expiresAt)<=Date.now())throw new Error("execution_ticket_not_issuable");
      const record=this.payload.proposals.find(x=>x.proposal.id===ticket.proposalId);
      if(!record)throw new Error("execution_proposal_not_found");
      const tool=this.activeTool(record.proposal.toolId);
      if(!tool)throw new Error("registered_tool_not_active");
      return{ticket,proposal:record.proposal,tool};
    });
  }

  consumeTicket(id:string,normalizedArguments:unknown){
    return this.enqueue(async()=>{
      await this.load();
      const i=this.payload.tickets.findIndex(x=>x.id===id);
      if(i<0)throw new Error("execution_ticket_not_found");
      const ticket=this.payload.tickets[i]!;
      if(ticket.status!=="ISSUED")throw new Error("execution_ticket_not_issuable");
      if(Date.parse(ticket.expiresAt)<=Date.now()){
        this.payload.tickets[i]=ExecutionTicketSchema.parse({...ticket,status:"EXPIRED"});
        await this.persist();
        throw new Error("execution_ticket_expired");
      }
      const record=this.payload.proposals.find(x=>x.proposal.id===ticket.proposalId);
      if(!record)throw new Error("execution_proposal_not_found");
      if(digest(normalizedArguments)!==record.proposal.normalizedArgumentsDigest)throw new Error("execution_arguments_changed_after_authorization");
      const task=await this.kernel.get(record.proposal.taskId);
      if(!task||!task.realityCommitConsumedAt||task.effectQuarantined)throw new Error("execution_task_no_longer_routable");
      if(!this.activeAttestation(record.proposal.identityAttestationId,record.proposal.subjectId))throw new Error("verified_agent_attestation_required");
      const tool=this.activeTool(record.proposal.toolId);
      if(!tool||tool.protocol!==record.proposal.protocol||tool.operation!==record.proposal.operation)throw new Error("registered_tool_not_active");
      const leaseIndex=this.payload.leases.findIndex(x=>x.id===ticket.credentialLeaseId),lease=leaseIndex>=0?this.activeLease(ticket.credentialLeaseId):null;
      if(!lease||lease.sessionId!==task.sessionId)throw new Error("credential_lease_not_active");
      const consumed=ExecutionTicketSchema.parse({...ticket,status:"CONSUMED",consumedAt:new Date().toISOString()});
      this.payload.tickets[i]=consumed;
      this.payload.leases[leaseIndex]=ScopedCredentialLeaseSchema.parse({...lease,used:lease.used+1});
      this.appendAudit({scopeDeviceId:record.proposal.scopeDeviceId,intentId:record.proposal.intentId,taskId:record.proposal.taskId,proposalId:record.proposal.id,ticketId:consumed.id,phase:"ROUTE",outcome:"PASS",summary:"Single-use execution ticket consumed with exact authorized arguments at the trusted routing boundary.",detailsDigest:digest({ticket:consumed.id,argumentsDigest:record.proposal.normalizedArgumentsDigest})});
      await this.persist();
      return{ticket:consumed,proposal:record.proposal,tool,normalizedArguments};
    });
  }

  recordExecutionAttempt(ticketId:string,transport:"ACCEPTED"|"REJECTED"|"UNKNOWN",summary:string,details:unknown){
    return this.enqueue(async()=>{
      await this.load();
      const ticket=this.payload.tickets.find(x=>x.id===ticketId);
      if(!ticket||ticket.status!=="CONSUMED")throw new Error("consumed_execution_ticket_required");
      const record=this.payload.proposals.find(x=>x.proposal.id===ticket.proposalId);
      if(!record)throw new Error("execution_proposal_not_found");
      let quarantine;
      if(transport==="UNKNOWN"){
        const effectKey=semanticEffectKey(record.proposal.intentId,record.proposal.semanticEffect);
        quarantine=await this.kernel.intentReality.quarantineUnknown(effectKey,record.proposal.taskId,record.proposal.intentId);
        await this.kernel.quarantineEffectTrusted(record.proposal.taskId,quarantine.id);
      }
      const audit=this.appendAudit({scopeDeviceId:record.proposal.scopeDeviceId,intentId:record.proposal.intentId,taskId:record.proposal.taskId,proposalId:record.proposal.id,ticketId,phase:"EXECUTE",outcome:transport==="ACCEPTED"?"PASS":transport==="UNKNOWN"?"UNKNOWN":"ERROR",summary:summary.slice(0,1200),detailsDigest:digest(details)});
      await this.persist();
      return{audit,...(quarantine?{quarantine}:{})};
    });
  }

  listTickets(){return this.enqueue(async()=>{await this.load();return this.payload.tickets.slice().reverse()})}
  listAudit(){return this.enqueue(async()=>{await this.load();return this.payload.audit.slice().reverse()})}
  async close(){await this.chain}
}
