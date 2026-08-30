import crypto from "node:crypto";
import {chmod,mkdir,open,readFile,rename,writeFile} from "node:fs/promises";
import path from "node:path";
import {CanonicalRealityResolutionSchema,ConsequenceBundleSchema,type CanonicalRealityResolution,type ConsequenceBundle} from "@cieav/contracts";
import {
  AgentIdentityAttestationSchema,
  ExecutionAuditEventSchema,
  ExecutionProposalSchema,
  ExecutionTicketSchema,
  FederatedToolSchema,
  FormalAuthorizationDecisionSchema,
  FormalPermissionGraphSchema,
  ScopedCredentialLeaseSchema,
  TrustedToolAuthorizationBindingSchema,
  type AgentIdentityAttestation,
  type ExecutionAuditEvent,
  type ExecutionProposal,
  type ExecutionTicket,
  type FederatedTool,
  type FormalAuthorizationDecision,
  type FormalPermissionGraph,
  type ScopedCredentialLease,
  type TrustedToolAuthorizationBinding
} from "@cieav/contracts/execution-fabric";
import {
  assertTrustedToolAuthorizationBinding,
  assertTrustedToolAuthorizationBindingIntegrity,
  digest,
  evaluateFormalAuthorization,
  executionBindingDigest,
  permissionGraphDigest,
  trustedToolAuthorizationBinding
} from "@cieav/core/execution-fabric";
import {compileExecutionConsequenceBundle,verifyConsequenceBundleDigest} from "@cieav/core/consequence-bundle";
import {assertCurrentCanonicalRealityResolution,defaultCanonicalRealityResolverRegistry,resolveExecutionProposalReality,verifyCanonicalRealityResolution} from "@cieav/core/reality-resolver";
import {materializeResolvedExecutionProposal} from "@cieav/core/resolved-consequence-materialization";
import type {CieavAgentKernelStore} from "./agent-kernel.js";
import {semanticEffectKey} from "./intent-reality-engine.js";
import {CieavConsequenceAlgebraStore} from "./consequence-algebra-store.js";
import {CieavAuthorityTransactionJournal,type AuthorityTransactionEntry} from "./authority-transaction-journal.js";

const riskRank={LOW:0,MEDIUM:1,HIGH:2,CRITICAL:3} as const;
const member=(items:string[],value:string)=>items.includes("*")||items.includes(value);
const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value as Record<string,unknown>).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(",")}}`:JSON.stringify(value)??"undefined";
type ProposalRecord={proposal:ExecutionProposal;decision:FormalAuthorizationDecision;trustedToolBinding?:TrustedToolAuthorizationBinding;canonicalRealityResolution?:CanonicalRealityResolution;consequenceBundle?:ConsequenceBundle};
type Payload={version:1;attestations:AgentIdentityAttestation[];tools:FederatedTool[];leases:ScopedCredentialLease[];graphs:FormalPermissionGraph[];proposals:ProposalRecord[];tickets:ExecutionTicket[];audit:ExecutionAuditEvent[]};
type Envelope={payload:Payload;mac:string};
type IssueTicketTransaction={ticket:ExecutionTicket;proposalId:string;trustedToolBindingDigest:string;canonicalRealityResolutionDigest?:string;consequenceBundleDigest:string;scopeDeviceId:string;intentId:string;taskId:string};
type ConsumeTicketTransaction={ticketId:string;consumed:ExecutionTicket;proposalId:string;trustedToolBindingDigest:string;canonicalRealityResolutionDigest?:string;consequenceBundleDigest:string;leaseId:string;leaseUsedBefore:number;argumentsDigest:string;scopeDeviceId:string;intentId:string;taskId:string};
type ExecutionAttemptTransport="ACCEPTED"|"REJECTED"|"UNKNOWN";
type ExecutionAttemptTransaction={ticketId:string;proposalId:string;trustedToolBindingDigest:string;canonicalRealityResolutionDigest?:string;consequenceBundleDigest:string;scopeDeviceId:string;intentId:string;taskId:string;transport:ExecutionAttemptTransport;summary:string;detailsDigest:string;effectKey:string};
const empty=():Payload=>({version:1,attestations:[],tools:[],leases:[],graphs:[],proposals:[],tickets:[],audit:[]});

async function durableReplace(file:string,contents:string){
  const dir=path.dirname(file),tmp=`${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await writeFile(tmp,contents,{encoding:"utf8",mode:0o600,flag:"wx"});
  const fh=await open(tmp,"r+");try{await fh.sync()}finally{await fh.close()}
  await rename(tmp,file);try{await chmod(file,0o600)}catch{}
  if(process.platform!=="win32")try{const dh=await open(dir,"r");try{await dh.sync()}finally{await dh.close()}}catch{}
}

export class CieavExecutionFabricStore{
  private loaded=false;
  private recovering=false;
  private payload:Payload=empty();
  private chain:Promise<void>=Promise.resolve();
  readonly consequenceAlgebra:CieavConsequenceAlgebraStore;
  readonly authorityTransactions:CieavAuthorityTransactionJournal;
  readonly realityResolvers=defaultCanonicalRealityResolverRegistry();

  constructor(private readonly file:string,private readonly secret:string,private readonly kernel:CieavAgentKernelStore){
    if(secret.length<32)throw new Error("CIEAV execution-fabric secret is too weak");
    const algebraSecret=crypto.createHmac("sha256",secret).update("cieav-consequence-algebra-state-v1").digest("base64url");
    const journalSecret=crypto.createHmac("sha256",secret).update("cieav-authority-transaction-journal-v1").digest("base64url");
    this.consequenceAlgebra=new CieavConsequenceAlgebraStore(path.join(path.dirname(file),"consequence-algebra-state.json"),algebraSecret);
    this.authorityTransactions=new CieavAuthorityTransactionJournal(path.join(path.dirname(file),"authority-transaction-journal.json"),journalSecret);
  }

  private mac(payload:Payload){return crypto.createHmac("sha256",this.secret).update(canonical(payload)).digest("base64url")}
  private signAttestationBase(base:Omit<AgentIdentityAttestation,"id"|"signature">){return crypto.createHmac("sha256",this.secret).update(`cieav-agent-attestation-v1\n${canonical(base)}`).digest("base64url")}
  private verifyAttestation(attestation:AgentIdentityAttestation){const {id:_,signature,...base}=attestation,expected=this.signAttestationBase(base);return signature.length===expected.length&&crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected))}
  private enqueue<T>(fn:()=>Promise<T>):Promise<T>{const task=this.chain.then(fn,fn);this.chain=task.then(()=>undefined,()=>undefined);return task}
  private verifyAuditChain(events:ExecutionAuditEvent[]){let previous:string|undefined;for(const event of events){if(event.previousHash!==previous)throw new Error("execution audit previous-hash chain mismatch");const {id:_,eventHash,...base}=event;if(eventHash!==digest(base))throw new Error("execution audit event hash mismatch");previous=eventHash}}

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
        proposals:(env.payload.proposals??[]).map(x=>({proposal:ExecutionProposalSchema.parse(x.proposal),decision:FormalAuthorizationDecisionSchema.parse(x.decision),...(x.trustedToolBinding?{trustedToolBinding:TrustedToolAuthorizationBindingSchema.parse(x.trustedToolBinding)}:{}),...(x.canonicalRealityResolution?{canonicalRealityResolution:CanonicalRealityResolutionSchema.parse(x.canonicalRealityResolution)}:{}),...(x.consequenceBundle?{consequenceBundle:ConsequenceBundleSchema.parse(x.consequenceBundle)}:{})})),
        tickets:(env.payload.tickets??[]).map(x=>ExecutionTicketSchema.parse(x)),
        audit:(env.payload.audit??[]).map(x=>ExecutionAuditEventSchema.parse(x))
      };
      if(this.payload.attestations.some(a=>!this.verifyAttestation(a)))throw new Error("agent attestation signature verification failed");
      for(const record of this.payload.proposals){if(record.trustedToolBinding)assertTrustedToolAuthorizationBindingIntegrity(record.trustedToolBinding);if(record.canonicalRealityResolution&&!verifyCanonicalRealityResolution(record.canonicalRealityResolution))throw new Error("canonical_reality_resolution_integrity_mismatch");if(record.consequenceBundle)this.assertRecordConsequenceBundle(record)}
      this.verifyAuditChain(this.payload.audit);
    }catch(err:any){if(err?.code!=="ENOENT")throw new Error(`CIEAV execution fabric is unreadable, corrupt, or unauthenticated: ${String(err?.message??err)}`)}
    this.loaded=true;
    await this.recoverPendingAuthorityTransactions();
  }

  private async persist(){
    const p:Payload={version:1,attestations:this.payload.attestations.slice(-10000),tools:this.payload.tools.slice(-10000),leases:this.payload.leases.slice(-50000),graphs:this.payload.graphs.slice(-10000),proposals:this.payload.proposals.slice(-100000),tickets:this.payload.tickets.slice(-100000),audit:this.payload.audit.slice(-250000)};
    for(const record of p.proposals){if(record.trustedToolBinding)assertTrustedToolAuthorizationBindingIntegrity(record.trustedToolBinding);if(record.canonicalRealityResolution&&!verifyCanonicalRealityResolution(record.canonicalRealityResolution))throw new Error("canonical_reality_resolution_integrity_mismatch");if(record.consequenceBundle)this.assertRecordConsequenceBundle(record)}
    this.verifyAuditChain(p.audit);
    await durableReplace(this.file,JSON.stringify({payload:p,mac:this.mac(p)},null,2)+"\n");
    this.payload=p;
  }

  private appendAudit(input:Omit<ExecutionAuditEvent,"id"|"version"|"previousHash"|"eventHash"|"createdAt">){
    const previous=this.payload.audit.at(-1)?.eventHash,createdAt=new Date().toISOString(),base={version:1 as const,...input,...(previous?{previousHash:previous}:{}),createdAt},event=ExecutionAuditEventSchema.parse({...base,id:crypto.randomUUID(),eventHash:digest(base)});
    this.payload.audit.push(event);return event;
  }
  private activeAttestation(id:string,subjectId?:string){const a=this.payload.attestations.find(x=>x.id===id);return a&&this.verifyAttestation(a)&&Date.parse(a.expiresAt)>Date.now()&&(!subjectId||a.subjectId===subjectId)?a:null}
  private activeLease(id:string){const l=this.payload.leases.find(x=>x.id===id);return l&&!l.revokedAt&&Date.parse(l.expiresAt)>Date.now()&&l.used<l.maxUses?l:null}
  private activeTool(id:string){return this.payload.tools.find(x=>x.id===id&&x.enabled)??null}
  private assertContinuingContract(tool:FederatedTool,proposal:ExecutionProposal){if(tool.executionMode!=="CONTINUING")return;const requirement=proposal.continuingAuthority;if(!requirement)throw new Error("continuing_authority_requirement_missing");if(tool.requiredReflexPolicyId&&requirement.reflexPolicyId!==tool.requiredReflexPolicyId)throw new Error("required_reflex_policy_mismatch")}
  private makeTrustedToolBinding(tool:FederatedTool,proposal:ExecutionProposal){return trustedToolAuthorizationBinding(tool,proposal,{requireContract:tool.consequenceCapable})}
  private historicalTrustedToolBinding(record:ProposalRecord){if(!record.trustedToolBinding)throw new Error("trusted_tool_authorization_binding_required");return assertTrustedToolAuthorizationBindingIntegrity(record.trustedToolBinding)}
  private assertRecordTrustedToolBinding(record:ProposalRecord,tool:FederatedTool){const historical=this.historicalTrustedToolBinding(record);return assertTrustedToolAuthorizationBinding(tool,record.proposal,historical,{requireContract:tool.consequenceCapable})}
  private historicalCanonicalRealityResolution(record:ProposalRecord){const resolution=record.canonicalRealityResolution;if(!resolution)throw new Error("canonical_reality_resolution_required");if(!verifyCanonicalRealityResolution(resolution))throw new Error("canonical_reality_resolution_integrity_mismatch");return resolution}
  private assertRecordCurrentCanonicalRealityResolution(record:ProposalRecord){const trusted=this.historicalTrustedToolBinding(record),resolution=this.historicalCanonicalRealityResolution(record);return assertCurrentCanonicalRealityResolution(record.proposal,trusted,resolution,this.realityResolvers)}
  private assertRecordConsequenceBundle(record:ProposalRecord){
    const bundle=record.consequenceBundle;if(!bundle)throw new Error("consequence_bundle_required");if(!verifyConsequenceBundleDigest(bundle))throw new Error("consequence_bundle_integrity_mismatch");
    const trusted=this.historicalTrustedToolBinding(record),proposal=record.proposal;
    if(bundle.id!==proposal.id||bundle.taskId!==proposal.taskId||bundle.intentId!==proposal.intentId||bundle.scopeDeviceId!==proposal.scopeDeviceId||bundle.principalRef!==proposal.subjectId||bundle.toolId!==proposal.toolId||bundle.operation!==proposal.operation||bundle.normalizedArgumentsDigest!==proposal.normalizedArgumentsDigest||bundle.trustedToolBindingDigest!==trusted.bindingDigest)throw new Error("consequence_bundle_execution_binding_mismatch");
    if(record.canonicalRealityResolution){const resolution=this.historicalCanonicalRealityResolution(record),bound=bundle.primaryEffects.some(effect=>effect.realityAddresses.some(address=>address.digest===resolution.address.digest)&&effect.footprint.realityWrite.includes(resolution.canonicalRealityRef));if(!bound)throw new Error("consequence_bundle_canonical_reality_mismatch")}
    return bundle;
  }
  private historicalConsequenceBundle(record:ProposalRecord){return this.assertRecordConsequenceBundle(record)}
  private authorizationDigest(record:ProposalRecord){const trusted=this.historicalTrustedToolBinding(record),bundle=this.historicalConsequenceBundle(record);if(!record.canonicalRealityResolution)return digest({decision:record.decision,trustedToolBindingDigest:trusted.bindingDigest,consequenceBundleDigest:bundle.bundleDigest});const resolution=this.historicalCanonicalRealityResolution(record);return digest({decision:record.decision,trustedToolBindingDigest:trusted.bindingDigest,canonicalRealityResolutionDigest:resolution.resolutionDigest,consequenceBundleDigest:bundle.bundleDigest})}

  private async ensureAlgebraAtLeast(consequenceRef:string,target:"COMMITTED"|"DISPATCHED"){
    const node=await this.consequenceAlgebra.getNode(consequenceRef);
    if(!node)throw new Error(`authority_transaction_consequence_missing:${consequenceRef}`);
    const laterForCommitted=new Set(["COMMITTED","DISPATCHED","OBSERVING","QUARANTINED","SETTLED_UNKNOWN","SETTLED_SUCCESS","SETTLED_FAILURE"]);
    const laterForDispatched=new Set(["DISPATCHED","OBSERVING","QUARANTINED","SETTLED_UNKNOWN","SETTLED_SUCCESS","SETTLED_FAILURE"]);
    if(target==="COMMITTED"){
      if(laterForCommitted.has(node.state))return node;
      if(node.state!=="RESERVED"&&node.state!=="AUTHORIZED")throw new Error(`authority_transaction_invalid_algebra_state:${node.state}`);
      return this.consequenceAlgebra.mark(consequenceRef,"COMMITTED");
    }
    if(laterForDispatched.has(node.state))return node;
    if(node.state!=="COMMITTED")throw new Error(`authority_transaction_invalid_algebra_state:${node.state}`);
    return this.consequenceAlgebra.mark(consequenceRef,"DISPATCHED");
  }

  private async applyIssueTicketTransaction(tx:AuthorityTransactionEntry<IssueTicketTransaction>){
    const data=tx.payload,ticket=ExecutionTicketSchema.parse(data.ticket),record=this.payload.proposals.find(x=>x.proposal.id===data.proposalId);
    if(!record||record.proposal.id!==ticket.proposalId||record.decision.decision!=="ALLOW")throw new Error("authority_transaction_issue_ticket_proposal_conflict");
    const tool=this.activeTool(record.proposal.toolId);if(!tool)throw new Error("registered_tool_not_active");
    const trusted=this.assertRecordTrustedToolBinding(record,tool),resolution=this.assertRecordCurrentCanonicalRealityResolution(record),bundle=this.historicalConsequenceBundle(record);if(data.trustedToolBindingDigest!==trusted.bindingDigest)throw new Error("authority_transaction_trusted_tool_binding_conflict");if(data.canonicalRealityResolutionDigest!==resolution.resolutionDigest)throw new Error("authority_transaction_canonical_reality_resolution_conflict");if(data.consequenceBundleDigest!==bundle.bundleDigest)throw new Error("authority_transaction_consequence_bundle_conflict");
    if(ticket.authorizationDigest!==this.authorizationDigest(record))throw new Error("authority_transaction_authorization_digest_conflict");
    await this.ensureAlgebraAtLeast(data.proposalId,"COMMITTED");
    const existingById=this.payload.tickets.find(x=>x.id===ticket.id);
    const conflicting=this.payload.tickets.find(x=>x.id!==ticket.id&&(x.proposalId===ticket.proposalId||x.realityBoundCommitId===ticket.realityBoundCommitId)&&["ISSUED","CONSUMED"].includes(x.status));
    if(conflicting)throw new Error("authority_transaction_issue_ticket_conflict");
    if(existingById&&canonical(existingById)!==canonical(ticket))throw new Error("authority_transaction_issue_ticket_payload_conflict");
    if(!existingById)this.payload.tickets.push(ticket);
    if(!this.payload.audit.some(x=>x.ticketId===ticket.id&&x.phase==="COMMIT"&&x.outcome==="PASS"))this.appendAudit({scopeDeviceId:data.scopeDeviceId,intentId:data.intentId,taskId:data.taskId,proposalId:data.proposalId,ticketId:ticket.id,phase:"COMMIT",outcome:"PASS",summary:"Execution ticket transaction recovered or committed with exact Consequence Algebra, canonical reality resolution, ConsequenceBundle and trusted tool binding.",detailsDigest:digest({ticket,trustedToolBindingDigest:trusted.bindingDigest,canonicalRealityResolutionDigest:resolution.resolutionDigest,consequenceBundleDigest:bundle.bundleDigest,transactionId:tx.id,fenceToken:tx.fenceToken})});
    await this.persist();
    if(tx.stage==="PREPARED")tx=await this.authorityTransactions.advance(tx.id,"APPLIED") as AuthorityTransactionEntry<IssueTicketTransaction>;
    if(tx.stage!=="COMMITTED")await this.authorityTransactions.advance(tx.id,"COMMITTED");
    return ticket;
  }

  private async applyConsumeTicketTransaction(tx:AuthorityTransactionEntry<ConsumeTicketTransaction>){
    const data=tx.payload,consumed=ExecutionTicketSchema.parse(data.consumed),ticketIndex=this.payload.tickets.findIndex(x=>x.id===data.ticketId);
    if(ticketIndex<0)throw new Error("authority_transaction_consume_ticket_missing");
    const current=this.payload.tickets[ticketIndex]!;
    const record=this.payload.proposals.find(x=>x.proposal.id===data.proposalId);if(!record)throw new Error("authority_transaction_consume_ticket_proposal_conflict");
    const tool=this.activeTool(record.proposal.toolId);if(!tool)throw new Error("registered_tool_not_active");
    const trusted=this.assertRecordTrustedToolBinding(record,tool),resolution=this.assertRecordCurrentCanonicalRealityResolution(record),bundle=this.historicalConsequenceBundle(record);if(data.trustedToolBindingDigest!==trusted.bindingDigest)throw new Error("authority_transaction_trusted_tool_binding_conflict");if(data.canonicalRealityResolutionDigest!==resolution.resolutionDigest)throw new Error("authority_transaction_canonical_reality_resolution_conflict");if(data.consequenceBundleDigest!==bundle.bundleDigest)throw new Error("authority_transaction_consequence_bundle_conflict");
    if(current.authorizationDigest!==this.authorizationDigest(record)||consumed.authorizationDigest!==current.authorizationDigest)throw new Error("authority_transaction_authorization_digest_conflict");
    if(current.proposalId!==data.proposalId||consumed.id!==current.id||consumed.status!=="CONSUMED")throw new Error("authority_transaction_consume_ticket_conflict");
    if(current.status==="ISSUED")this.payload.tickets[ticketIndex]=consumed;
    else if(current.status==="CONSUMED"&&canonical(current)!==canonical(consumed))throw new Error("authority_transaction_consumed_ticket_payload_conflict");
    else if(current.status!=="CONSUMED")throw new Error(`authority_transaction_ticket_not_consumable:${current.status}`);
    const leaseIndex=this.payload.leases.findIndex(x=>x.id===data.leaseId);if(leaseIndex<0)throw new Error("authority_transaction_credential_lease_missing");
    const lease=this.payload.leases[leaseIndex]!;
    if(lease.used===data.leaseUsedBefore)this.payload.leases[leaseIndex]=ScopedCredentialLeaseSchema.parse({...lease,used:lease.used+1});
    else if(lease.used!==data.leaseUsedBefore+1)throw new Error("authority_transaction_credential_lease_counter_conflict");
    await this.ensureAlgebraAtLeast(data.proposalId,"DISPATCHED");
    if(!this.payload.audit.some(x=>x.ticketId===consumed.id&&x.phase==="ROUTE"&&x.outcome==="PASS"))this.appendAudit({scopeDeviceId:data.scopeDeviceId,intentId:data.intentId,taskId:data.taskId,proposalId:data.proposalId,ticketId:consumed.id,phase:"ROUTE",outcome:"PASS",summary:"Single-use execution ticket transaction recovered or consumed with exact arguments, credential use, canonical reality resolution, ConsequenceBundle and trusted tool binding.",detailsDigest:digest({ticket:consumed.id,argumentsDigest:data.argumentsDigest,trustedToolBindingDigest:trusted.bindingDigest,canonicalRealityResolutionDigest:resolution.resolutionDigest,consequenceBundleDigest:bundle.bundleDigest,transactionId:tx.id,fenceToken:tx.fenceToken})});
    await this.persist();
    if(tx.stage==="PREPARED")tx=await this.authorityTransactions.advance(tx.id,"APPLIED") as AuthorityTransactionEntry<ConsumeTicketTransaction>;
    if(tx.stage!=="COMMITTED")await this.authorityTransactions.advance(tx.id,"COMMITTED");
    return consumed;
  }

  private executionOutcome(transport:ExecutionAttemptTransport):ExecutionAuditEvent["outcome"]{return transport==="ACCEPTED"?"PASS":transport==="UNKNOWN"?"UNKNOWN":"ERROR"}

  private async committedExecutionAttemptResult(tx:AuthorityTransactionEntry<ExecutionAttemptTransaction>){
    const data=tx.payload,outcome=this.executionOutcome(data.transport),audit=this.payload.audit.find(x=>x.ticketId===data.ticketId&&x.phase==="EXECUTE");
    if(!audit||audit.outcome!==outcome||audit.summary!==data.summary||audit.detailsDigest!==data.detailsDigest)throw new Error("authority_transaction_execution_audit_conflict");
    if(data.transport!=="UNKNOWN")return{audit};
    const quarantines=await this.kernel.intentReality.listQuarantines(),quarantine=quarantines.find(q=>q.effectKey===data.effectKey&&q.status==="OPEN");
    if(!quarantine||quarantine.taskId!==data.taskId||quarantine.intentId!==data.intentId||quarantine.reason!=="UNKNOWN_OUTCOME")throw new Error("semantic_effect_quarantine_binding_conflict");
    return{audit,quarantine};
  }

  private async applyExecutionAttemptTransaction(tx:AuthorityTransactionEntry<ExecutionAttemptTransaction>){
    if(tx.stage==="COMMITTED")return this.committedExecutionAttemptResult(tx);
    const data=tx.payload,ticket=this.payload.tickets.find(x=>x.id===data.ticketId),record=this.payload.proposals.find(x=>x.proposal.id===data.proposalId);
    if(!ticket||ticket.status!=="CONSUMED"||ticket.proposalId!==data.proposalId)throw new Error("authority_transaction_execution_ticket_conflict");
    if(!record||record.proposal.taskId!==data.taskId||record.proposal.intentId!==data.intentId||record.proposal.scopeDeviceId!==data.scopeDeviceId)throw new Error("authority_transaction_execution_proposal_conflict");
    const historical=this.historicalTrustedToolBinding(record),resolution=record.canonicalRealityResolution?this.historicalCanonicalRealityResolution(record):null,bundle=this.historicalConsequenceBundle(record);if(data.trustedToolBindingDigest!==historical.bindingDigest)throw new Error("authority_transaction_trusted_tool_binding_conflict");if((data.canonicalRealityResolutionDigest??null)!==(resolution?.resolutionDigest??null))throw new Error("authority_transaction_canonical_reality_resolution_conflict");if(data.consequenceBundleDigest!==bundle.bundleDigest)throw new Error("authority_transaction_consequence_bundle_conflict");
    if(ticket.authorizationDigest!==this.authorizationDigest(record))throw new Error("authority_transaction_authorization_digest_conflict");
    const expectedEffectKey=semanticEffectKey(record.proposal.intentId,record.proposal.semanticEffect);if(expectedEffectKey!==data.effectKey)throw new Error("authority_transaction_execution_effect_conflict");
    let quarantine;
    const node=await this.consequenceAlgebra.getNode(data.proposalId);if(!node)throw new Error(`authority_transaction_consequence_missing:${data.proposalId}`);
    if(data.transport==="UNKNOWN"){
      quarantine=await this.kernel.intentReality.quarantineUnknown(data.effectKey,data.taskId,data.intentId,"UNKNOWN_OUTCOME");
      if(quarantine.effectKey!==data.effectKey||quarantine.taskId!==data.taskId||quarantine.intentId!==data.intentId||quarantine.reason!=="UNKNOWN_OUTCOME"||quarantine.status!=="OPEN")throw new Error("semantic_effect_quarantine_binding_conflict");
      await this.kernel.quarantineEffectTrusted(data.taskId,quarantine.id);
      if(node.state!=="QUARANTINED"){
        if(!["DISPATCHED","OBSERVING"].includes(node.state))throw new Error(`authority_transaction_invalid_unknown_algebra_state:${node.state}`);
        await this.consequenceAlgebra.mark(data.proposalId,"QUARANTINED");
      }
    }else if(node.state!=="OBSERVING"){
      if(node.state!=="DISPATCHED")throw new Error(`authority_transaction_invalid_execution_algebra_state:${node.state}`);
      await this.consequenceAlgebra.mark(data.proposalId,"OBSERVING");
    }
    const outcome=this.executionOutcome(data.transport),existing=this.payload.audit.find(x=>x.ticketId===data.ticketId&&x.phase==="EXECUTE");
    if(existing){if(existing.outcome!==outcome||existing.summary!==data.summary||existing.detailsDigest!==data.detailsDigest)throw new Error("authority_transaction_execution_audit_conflict")}
    else this.appendAudit({scopeDeviceId:data.scopeDeviceId,intentId:data.intentId,taskId:data.taskId,proposalId:data.proposalId,ticketId:data.ticketId,phase:"EXECUTE",outcome,summary:data.summary,detailsDigest:data.detailsDigest});
    await this.persist();
    if(tx.stage==="PREPARED")tx=await this.authorityTransactions.advance(tx.id,"APPLIED") as AuthorityTransactionEntry<ExecutionAttemptTransaction>;
    if(tx.stage!=="COMMITTED")await this.authorityTransactions.advance(tx.id,"COMMITTED");
    const audit=this.payload.audit.find(x=>x.ticketId===data.ticketId&&x.phase==="EXECUTE")!;
    return{audit,...(quarantine?{quarantine}:{})};
  }

  private async recoverPendingAuthorityTransactions(){
    if(this.recovering)return;
    this.recovering=true;
    try{
      const pending=await this.authorityTransactions.pending();
      for(const raw of pending){
        if(raw.kind==="ISSUE_TICKET")await this.applyIssueTicketTransaction(raw as AuthorityTransactionEntry<IssueTicketTransaction>);
        else if(raw.kind==="CONSUME_TICKET")await this.applyConsumeTicketTransaction(raw as AuthorityTransactionEntry<ConsumeTicketTransaction>);
        else if(raw.kind==="RECORD_EXECUTION_ATTEMPT")await this.applyExecutionAttemptTransaction(raw as AuthorityTransactionEntry<ExecutionAttemptTransaction>);
        else throw new Error(`unsupported authority transaction kind:${raw.kind}`);
      }
    }finally{this.recovering=false}
  }

  recoverAuthorityTransactionsOnStartup(){return this.enqueue(async()=>{await this.load();await this.recoverPendingAuthorityTransactions();return this.authorityTransactions.health()})}
  authorityTransactionHealth(){return this.enqueue(async()=>{await this.load();return this.authorityTransactions.health()})}

  registerAttestation(raw:unknown){return this.enqueue(async()=>{await this.load();const unsigned=AgentIdentityAttestationSchema.omit({id:true,signature:true,issuer:true}).parse(raw),base={...unsigned,issuer:"cieav-local-authority"},attestation=AgentIdentityAttestationSchema.parse({...base,id:crypto.randomUUID(),signature:this.signAttestationBase(base)});if(Date.parse(attestation.expiresAt)<=Date.now()||Date.parse(attestation.issuedAt)>Date.now()+60000)throw new Error("invalid_attestation_time_window");this.payload.attestations.push(attestation);this.appendAudit({scopeDeviceId:"dev_identity_registry",phase:"IDENTITY",outcome:"PASS",summary:`CIEAV locally attested agent identity ${attestation.subjectId}.`,detailsDigest:digest({...attestation,signature:"redacted"})});await this.persist();return attestation})}
  listAttestations(){return this.enqueue(async()=>{await this.load();return this.payload.attestations.slice().reverse()})}

  putTool(raw:unknown){return this.enqueue(async()=>{
    await this.load();
    const tool=FederatedToolSchema.parse(raw);
    this.payload.tools=this.payload.tools.filter(x=>x.id!==tool.id);this.payload.tools.push(tool);
    for(const record of this.payload.proposals.filter(x=>x.proposal.toolId===tool.id&&x.trustedToolBinding)){
      try{this.assertRecordTrustedToolBinding(record,tool);if(record.canonicalRealityResolution)this.assertRecordCurrentCanonicalRealityResolution(record)}catch(err){
        for(let i=0;i<this.payload.tickets.length;i++){
          const ticket=this.payload.tickets[i]!;
          if(ticket.proposalId!==record.proposal.id||ticket.status!=="ISSUED")continue;
          this.payload.tickets[i]=ExecutionTicketSchema.parse({...ticket,status:"INVALIDATED"});
          this.appendAudit({scopeDeviceId:record.proposal.scopeDeviceId,intentId:record.proposal.intentId,taskId:record.proposal.taskId,proposalId:record.proposal.id,ticketId:ticket.id,phase:"STATE_REVALIDATE",outcome:"BLOCK",summary:"Issued execution ticket invalidated because the registered trusted tool consequence contract or canonical reality resolution changed or disappeared.",detailsDigest:digest({error:String((err as any)?.message??err),previousBindingDigest:record.trustedToolBinding?.bindingDigest,canonicalRealityResolutionDigest:record.canonicalRealityResolution?.resolutionDigest??null,currentTool:tool})});
        }
      }
    }
    await this.persist();return tool;
  })}
  listTools(){return this.enqueue(async()=>{await this.load();return this.payload.tools.slice().sort((a,b)=>a.id.localeCompare(b.id))})}
  issueLease(raw:unknown){return this.enqueue(async()=>{await this.load();const candidate=ScopedCredentialLeaseSchema.parse(raw),attestation=this.activeAttestation(candidate.identityAttestationId);if(!attestation)throw new Error("verified_agent_attestation_required");if(Date.parse(candidate.expiresAt)<=Date.now()||Date.parse(candidate.expiresAt)>Date.parse(attestation.expiresAt))throw new Error("credential_lease_time_window_invalid");const expected=digest({version:candidate.version,sessionId:candidate.sessionId,identityAttestationId:candidate.identityAttestationId,scopeDeviceId:candidate.scopeDeviceId,audience:candidate.audience,allowedIntentIds:candidate.allowedIntentIds,allowedToolIds:candidate.allowedToolIds,allowedOperations:candidate.allowedOperations,maxRisk:candidate.maxRisk,credentialRefDigest:candidate.credentialRefDigest,issuedAt:candidate.issuedAt,expiresAt:candidate.expiresAt,maxUses:candidate.maxUses});if(candidate.bindingDigest!==expected)throw new Error("credential_lease_binding_mismatch");this.payload.leases=this.payload.leases.filter(x=>x.id!==candidate.id);this.payload.leases.push(candidate);await this.persist();return candidate})}
  revokeLease(id:string){return this.enqueue(async()=>{await this.load();const i=this.payload.leases.findIndex(x=>x.id===id);if(i<0)throw new Error("credential_lease_not_found");const current=this.payload.leases[i]!,next=ScopedCredentialLeaseSchema.parse({...current,revokedAt:current.revokedAt??new Date().toISOString()});this.payload.leases[i]=next;await this.persist();return next})}
  listLeases(){return this.enqueue(async()=>{await this.load();return this.payload.leases.slice().reverse()})}
  putPermissionGraph(raw:unknown){return this.enqueue(async()=>{await this.load();const input=FormalPermissionGraphSchema.omit({digest:true}).parse(raw),graph=FormalPermissionGraphSchema.parse({...input,digest:permissionGraphDigest(input)});this.payload.graphs=this.payload.graphs.filter(x=>!(x.scopeDeviceId===graph.scopeDeviceId&&x.rootIntentId===graph.rootIntentId));this.payload.graphs.push(graph);await this.persist();return graph})}
  listPermissionGraphs(){return this.enqueue(async()=>{await this.load();return this.payload.graphs.slice().reverse()})}
  getProposalRecord(proposalId:string){return this.enqueue(async()=>{await this.load();const record=this.payload.proposals.find(x=>x.proposal.id===proposalId);return record?{proposal:record.proposal,decision:record.decision,trustedToolBinding:record.trustedToolBinding??null,canonicalRealityResolution:record.canonicalRealityResolution??null,consequenceBundle:record.consequenceBundle??null}:null})}

  authorize(raw:unknown){return this.enqueue(async()=>{
    await this.load();
    const proposal=ExecutionProposalSchema.parse(raw),task=await this.kernel.get(proposal.taskId);
    if(!task||task.intentId!==proposal.intentId||task.scopeDeviceId!==proposal.scopeDeviceId||task.actor.id!==proposal.subjectId)throw new Error("execution_proposal_task_binding_mismatch");
    const attestation=this.activeAttestation(proposal.identityAttestationId,proposal.subjectId);if(!attestation)throw new Error("verified_agent_attestation_required");
    const lease=this.activeLease(proposal.credentialLeaseId);if(!lease||lease.identityAttestationId!==attestation.id||lease.sessionId!==task.sessionId||lease.scopeDeviceId!==proposal.scopeDeviceId||!lease.allowedIntentIds.includes(proposal.intentId)||!member(lease.allowedToolIds,proposal.toolId)||!member(lease.allowedOperations,proposal.operation)||!(["*",`tool:${proposal.toolId}`,proposal.toolId].includes(lease.audience))||riskRank[proposal.risk]>riskRank[lease.maxRisk])throw new Error("credential_lease_scope_violation");
    const tool=this.activeTool(proposal.toolId);if(!tool||tool.protocol!==proposal.protocol||tool.operation!==proposal.operation||riskRank[proposal.risk]>riskRank[tool.risk])throw new Error("registered_tool_scope_violation");
    this.assertContinuingContract(tool,proposal);
    let trustedToolBinding:TrustedToolAuthorizationBinding;
    try{trustedToolBinding=this.makeTrustedToolBinding(tool,proposal)}catch(err){
      this.appendAudit({scopeDeviceId:proposal.scopeDeviceId,intentId:proposal.intentId,taskId:proposal.taskId,proposalId:proposal.id,phase:"AUTHORIZE",outcome:"BLOCK",summary:`Trusted tool consequence validation blocked authorization: ${String((err as any)?.message??err)}`.slice(0,1200),detailsDigest:digest({toolId:tool.id,protocol:tool.protocol,operation:tool.operation,consequenceContract:tool.consequenceContract??null,proposalSemanticEffect:proposal.semanticEffect})});
      await this.persist();throw err;
    }
    const graph=this.payload.graphs.find(x=>x.scopeDeviceId===proposal.scopeDeviceId&&x.rootIntentId===proposal.intentId);if(!graph)throw new Error("formal_permission_graph_required");
    const decision=evaluateFormalAuthorization(graph,proposal);let algebraAdmission;let canonicalRealityResolution:CanonicalRealityResolution|undefined;let consequenceBundle:ConsequenceBundle|undefined;
    if(decision.decision==="ALLOW"){
      canonicalRealityResolution=resolveExecutionProposalReality(proposal,trustedToolBinding,this.realityResolvers);if(!verifyCanonicalRealityResolution(canonicalRealityResolution,this.realityResolvers))throw new Error("canonical_reality_resolution_integrity_mismatch");
      const materialization=materializeResolvedExecutionProposal(proposal,canonicalRealityResolution);consequenceBundle=compileExecutionConsequenceBundle(proposal,trustedToolBinding,materialization);
      const existing=await this.consequenceAlgebra.getNode(proposal.id),aggregationLimits=Object.fromEntries((proposal.continuingAuthority?.budgets??[]).map(b=>[b.dimension,b.limit])),proofProviders=(tool.proofSources??[]).map(ref=>({ref})),algebraOptions={aggregationLimits,proofProviders};
      if(existing&&canonical(existing.materialization)!==canonical(materialization))throw new Error("consequence_algebra_materialization_changed_after_first_admission");
      let algebra;
      if(!existing)algebra=await this.consequenceAlgebra.admit(materialization,algebraOptions);
      else if(existing.state==="MATERIALIZED")algebra=await this.consequenceAlgebra.reconsiderWaiting(proposal.id,algebraOptions);
      else await this.consequenceAlgebra.ensureAdmitted(proposal.id);
      if(algebra){
        algebraAdmission=algebra.admission;
        if(algebra.admission.decision!=="ADMIT"){
          this.appendAudit({scopeDeviceId:proposal.scopeDeviceId,intentId:proposal.intentId,taskId:proposal.taskId,proposalId:proposal.id,phase:"AUTHORIZE",outcome:"BLOCK",summary:`Consequence Algebra ${algebra.admission.decision}: ${algebra.admission.reasons.join(" ")}`.slice(0,1200),detailsDigest:digest({admission:algebra.admission,canonicalRealityResolutionDigest:canonicalRealityResolution.resolutionDigest,consequenceBundleDigest:consequenceBundle.bundleDigest,reconsidered:existing?.state==="MATERIALIZED"})});await this.persist();throw new Error(`consequence_algebra_${algebra.admission.decision.toLowerCase()}`);
        }
      }
      if(!existing||existing.state==="RESERVED"||existing.state==="MATERIALIZED")await this.consequenceAlgebra.mark(proposal.id,"AUTHORIZED");
    }
    this.payload.proposals=this.payload.proposals.filter(x=>x.proposal.id!==proposal.id);this.payload.proposals.push({proposal,decision,trustedToolBinding,...(canonicalRealityResolution?{canonicalRealityResolution}:{}),...(consequenceBundle?{consequenceBundle}:{})});
    this.appendAudit({scopeDeviceId:proposal.scopeDeviceId,intentId:proposal.intentId,taskId:proposal.taskId,proposalId:proposal.id,phase:"AUTHORIZE",outcome:decision.decision==="ALLOW"?"PASS":decision.decision==="ASK"?"ASK":"BLOCK",summary:decision.reasons.join(" ").slice(0,1200),detailsDigest:digest({decision,trustedToolBinding,canonicalRealityResolutionDigest:canonicalRealityResolution?.resolutionDigest??null,consequenceBundleDigest:consequenceBundle?.bundleDigest??null,algebraAdmission:algebraAdmission??null})});
    await this.persist();
    return{proposal,decision,trustedToolBinding,...(canonicalRealityResolution?{canonicalRealityResolution}:{}),...(consequenceBundle?{consequenceBundle}:{}),bindingDigest:executionBindingDigest(proposal,graph.digest,trustedToolBinding.bindingDigest),...(algebraAdmission?{algebraAdmission}:{}),executionAuthorityIssued:false as const};
  })}

  issueTicket(proposalId:string,realityBoundCommitId:string,ttlSeconds=30){return this.enqueue(async()=>{
    await this.load();
    const record=this.payload.proposals.find(x=>x.proposal.id===proposalId);if(!record)throw new Error("execution_proposal_not_found");if(record.decision.decision!=="ALLOW")throw new Error("formal_authorization_not_allow");
    if(this.payload.tickets.some(x=>(x.proposalId===proposalId||x.realityBoundCommitId===realityBoundCommitId)&&["ISSUED","CONSUMED"].includes(x.status)))throw new Error("execution_ticket_already_issued");
    const proposal=record.proposal,task=await this.kernel.get(proposal.taskId);if(!task||task.realityBoundCommitId!==realityBoundCommitId||!task.realityCommitConsumedAt)throw new Error("consumed_reality_bound_commit_required");
    const bundle=this.historicalConsequenceBundle(record);
    await this.consequenceAlgebra.ensureAdmitted(proposal.id);await this.consequenceAlgebra.assertProofPlanValid(proposal.id);await this.consequenceAlgebra.assertFencesSatisfied(proposal.id);
    if(!this.activeAttestation(proposal.identityAttestationId,proposal.subjectId))throw new Error("verified_agent_attestation_required");
    const lease=this.activeLease(proposal.credentialLeaseId);if(!lease||lease.sessionId!==task.sessionId)throw new Error("credential_lease_not_active");
    const tool=this.activeTool(proposal.toolId);if(!tool||tool.protocol!==proposal.protocol||tool.operation!==proposal.operation)throw new Error("registered_tool_not_active");this.assertContinuingContract(tool,proposal);
    const trusted=this.assertRecordTrustedToolBinding(record,tool),resolution=this.assertRecordCurrentCanonicalRealityResolution(record);
    const graph=this.payload.graphs.find(x=>x.scopeDeviceId===proposal.scopeDeviceId&&x.rootIntentId===proposal.intentId);if(!graph||graph.digest!==record.decision.graphDigest||evaluateFormalAuthorization(graph,proposal).decision!=="ALLOW")throw new Error("formal_authorization_changed_before_execution");
    const commits=await this.kernel.intentReality.listRealityBoundCommits(),commit=commits.find(x=>x.id===realityBoundCommitId);if(!commit||commit.status!=="CONSUMED"||commit.taskId!==proposal.taskId||commit.intentId!==proposal.intentId||commit.proposalDigest!==digest(proposal)||commit.effectKey!==semanticEffectKey(proposal.intentId,proposal.semanticEffect)||commit.preStateDigest!==proposal.realityWitness.digest||commit.expectedPostStateDigest!==proposal.expectedPostStateDigest||commit.proofObligationDigest!==proposal.proofObligationDigest)throw new Error("execution_proposal_reality_commit_binding_mismatch");
    const ttl=Math.max(5,Math.min(60,Math.floor(ttlSeconds))),now=Date.now(),authorizationDigest=this.authorizationDigest(record),routeDigest=digest({toolId:proposal.toolId,protocol:proposal.protocol,operation:proposal.operation,target:proposal.target??null,normalizedArgumentsDigest:proposal.normalizedArgumentsDigest,trustedToolBindingDigest:trusted.bindingDigest,canonicalRealityResolutionDigest:resolution.resolutionDigest,consequenceBundleDigest:bundle.bundleDigest});
    const ticket=ExecutionTicketSchema.parse({id:crypto.randomUUID(),version:1,proposalId:proposal.id,intentId:proposal.intentId,taskId:proposal.taskId,toolId:proposal.toolId,authorizationDigest,realityBoundCommitId,credentialLeaseId:lease.id,routeDigest,issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+ttl*1000).toISOString(),status:"ISSUED"});
    const tx=await this.authorityTransactions.begin("ISSUE_TICKET",`issue:${proposal.id}:${realityBoundCommitId}`,{ticket,proposalId:proposal.id,trustedToolBindingDigest:trusted.bindingDigest,canonicalRealityResolutionDigest:resolution.resolutionDigest,consequenceBundleDigest:bundle.bundleDigest,scopeDeviceId:proposal.scopeDeviceId,intentId:proposal.intentId,taskId:proposal.taskId} satisfies IssueTicketTransaction);
    return this.applyIssueTicketTransaction(tx);
  })}

  inspectTicket(id:string){return this.enqueue(async()=>{await this.load();const ticket=this.payload.tickets.find(x=>x.id===id);if(!ticket)throw new Error("execution_ticket_not_found");if(ticket.status!=="ISSUED"||Date.parse(ticket.expiresAt)<=Date.now())throw new Error("execution_ticket_not_issuable");const record=this.payload.proposals.find(x=>x.proposal.id===ticket.proposalId);if(!record)throw new Error("execution_proposal_not_found");const tool=this.activeTool(record.proposal.toolId);if(!tool)throw new Error("registered_tool_not_active");this.assertContinuingContract(tool,record.proposal);const trustedToolBinding=this.assertRecordTrustedToolBinding(record,tool),canonicalRealityResolution=this.assertRecordCurrentCanonicalRealityResolution(record),consequenceBundle=this.historicalConsequenceBundle(record);if(ticket.authorizationDigest!==this.authorizationDigest(record))throw new Error("execution_authorization_binding_invalid");return{ticket,proposal:record.proposal,tool,trustedToolBinding,canonicalRealityResolution,consequenceBundle}})}

  verifyConsumedDispatch(id:string,binding:{protocol:string;operation:string;target:string|null;normalizedArgumentsDigest:string;downstreamRef:string}){return this.enqueue(async()=>{
    await this.load();const ticket=this.payload.tickets.find(x=>x.id===id);if(!ticket)throw new Error("execution_ticket_not_found");if(ticket.status!=="CONSUMED"||!ticket.consumedAt)throw new Error("consumed_execution_ticket_required");if(Date.parse(ticket.expiresAt)<=Date.now())throw new Error("execution_ticket_expired");
    const record=this.payload.proposals.find(x=>x.proposal.id===ticket.proposalId);if(!record)throw new Error("execution_proposal_not_found");const proposal=record.proposal;if(record.decision.decision!=="ALLOW"||this.authorizationDigest(record)!==ticket.authorizationDigest)throw new Error("execution_authorization_binding_invalid");
    if(proposal.id!==ticket.proposalId||proposal.intentId!==ticket.intentId||proposal.taskId!==ticket.taskId||proposal.toolId!==ticket.toolId||proposal.credentialLeaseId!==ticket.credentialLeaseId)throw new Error("execution_ticket_proposal_binding_invalid");
    if(binding.protocol!==proposal.protocol||binding.operation!==proposal.operation||(binding.target??null)!==(proposal.target??null)||binding.normalizedArgumentsDigest!==proposal.normalizedArgumentsDigest)throw new Error("execution_dispatch_proposal_binding_invalid");
    const tool=this.activeTool(proposal.toolId);if(!tool||tool.protocol!==proposal.protocol||tool.operation!==proposal.operation||tool.downstreamRef!==binding.downstreamRef)throw new Error("registered_tool_dispatch_binding_invalid");if(tool.executionMode==="CONTINUING")throw new Error("continuing_dispatch_not_supported_by_oneshot_verifier");
    const trusted=this.assertRecordTrustedToolBinding(record,tool),canonicalRealityResolution=this.assertRecordCurrentCanonicalRealityResolution(record),consequenceBundle=this.historicalConsequenceBundle(record);
    const expectedRoute=digest({toolId:proposal.toolId,protocol:proposal.protocol,operation:proposal.operation,target:proposal.target??null,normalizedArgumentsDigest:proposal.normalizedArgumentsDigest,trustedToolBindingDigest:trusted.bindingDigest,canonicalRealityResolutionDigest:canonicalRealityResolution.resolutionDigest,consequenceBundleDigest:consequenceBundle.bundleDigest});if(expectedRoute!==ticket.routeDigest)throw new Error("execution_route_binding_invalid");
    const routeEvents=this.payload.audit.filter(x=>x.ticketId===ticket.id&&x.phase==="ROUTE"&&x.outcome==="PASS");if(routeEvents.length!==1)throw new Error("execution_route_audit_required");if(this.payload.audit.some(x=>x.ticketId===ticket.id&&x.phase==="EXECUTE"))throw new Error("execution_attempt_already_recorded");
    return{ticket,proposal,tool,trustedToolBinding:trusted,canonicalRealityResolution,consequenceBundle,authorizationDigest:ticket.authorizationDigest,routeDigest:ticket.routeDigest,verifiedAt:new Date().toISOString(),authority:false as const,executionAuthorityIssued:false as const};
  })}

  consumeTicket(id:string,normalizedArguments:unknown){return this.enqueue(async()=>{
    await this.load();const i=this.payload.tickets.findIndex(x=>x.id===id);if(i<0)throw new Error("execution_ticket_not_found");const ticket=this.payload.tickets[i]!;if(ticket.status!=="ISSUED")throw new Error("execution_ticket_not_issuable");
    if(Date.parse(ticket.expiresAt)<=Date.now()){this.payload.tickets[i]=ExecutionTicketSchema.parse({...ticket,status:"EXPIRED"});await this.persist();throw new Error("execution_ticket_expired")}
    const record=this.payload.proposals.find(x=>x.proposal.id===ticket.proposalId);if(!record)throw new Error("execution_proposal_not_found");
    await this.consequenceAlgebra.ensureAdmitted(record.proposal.id);await this.consequenceAlgebra.assertProofPlanValid(record.proposal.id);await this.consequenceAlgebra.assertFencesSatisfied(record.proposal.id);
    if(digest(normalizedArguments)!==record.proposal.normalizedArgumentsDigest)throw new Error("execution_arguments_changed_after_authorization");
    if(ticket.authorizationDigest!==this.authorizationDigest(record))throw new Error("execution_authorization_binding_invalid");
    const task=await this.kernel.get(record.proposal.taskId);if(!task||!task.realityCommitConsumedAt||task.effectQuarantined)throw new Error("execution_task_no_longer_routable");if(!this.activeAttestation(record.proposal.identityAttestationId,record.proposal.subjectId))throw new Error("verified_agent_attestation_required");
    const tool=this.activeTool(record.proposal.toolId);if(!tool||tool.protocol!==record.proposal.protocol||tool.operation!==record.proposal.operation)throw new Error("registered_tool_not_active");this.assertContinuingContract(tool,record.proposal);const trusted=this.assertRecordTrustedToolBinding(record,tool),canonicalRealityResolution=this.assertRecordCurrentCanonicalRealityResolution(record),consequenceBundle=this.historicalConsequenceBundle(record);
    const leaseIndex=this.payload.leases.findIndex(x=>x.id===ticket.credentialLeaseId),lease=leaseIndex>=0?this.activeLease(ticket.credentialLeaseId):null;if(!lease||lease.sessionId!==task.sessionId)throw new Error("credential_lease_not_active");
    const consumed=ExecutionTicketSchema.parse({...ticket,status:"CONSUMED",consumedAt:new Date().toISOString()}),tx=await this.authorityTransactions.begin("CONSUME_TICKET",`consume:${ticket.id}`,{ticketId:ticket.id,consumed,proposalId:record.proposal.id,trustedToolBindingDigest:trusted.bindingDigest,canonicalRealityResolutionDigest:canonicalRealityResolution.resolutionDigest,consequenceBundleDigest:consequenceBundle.bundleDigest,leaseId:lease.id,leaseUsedBefore:lease.used,argumentsDigest:record.proposal.normalizedArgumentsDigest,scopeDeviceId:record.proposal.scopeDeviceId,intentId:record.proposal.intentId,taskId:record.proposal.taskId} satisfies ConsumeTicketTransaction);
    await this.applyConsumeTicketTransaction(tx);return{ticket:consumed,proposal:record.proposal,tool,trustedToolBinding:trusted,canonicalRealityResolution,consequenceBundle,normalizedArguments};
  })}

  recordExecutionAttempt(ticketId:string,transport:ExecutionAttemptTransport,summary:string,details:unknown){return this.enqueue(async()=>{
    await this.load();const ticket=this.payload.tickets.find(x=>x.id===ticketId);if(!ticket||ticket.status!=="CONSUMED")throw new Error("consumed_execution_ticket_required");
    const record=this.payload.proposals.find(x=>x.proposal.id===ticket.proposalId);if(!record)throw new Error("execution_proposal_not_found");const historical=this.historicalTrustedToolBinding(record),canonicalRealityResolution=record.canonicalRealityResolution?this.historicalCanonicalRealityResolution(record):null,consequenceBundle=this.historicalConsequenceBundle(record);
    if(ticket.authorizationDigest!==this.authorizationDigest(record))throw new Error("execution_authorization_binding_invalid");
    const effectKey=semanticEffectKey(record.proposal.intentId,record.proposal.semanticEffect),txData:ExecutionAttemptTransaction={ticketId,proposalId:record.proposal.id,trustedToolBindingDigest:historical.bindingDigest,...(canonicalRealityResolution?{canonicalRealityResolutionDigest:canonicalRealityResolution.resolutionDigest}:{}),consequenceBundleDigest:consequenceBundle.bundleDigest,scopeDeviceId:record.proposal.scopeDeviceId,intentId:record.proposal.intentId,taskId:record.proposal.taskId,transport,summary:summary.slice(0,1200),detailsDigest:digest(details),effectKey},tx=await this.authorityTransactions.begin("RECORD_EXECUTION_ATTEMPT",`execute:${ticketId}`,txData);
    return this.applyExecutionAttemptTransaction(tx)
  })}
  listTickets(){return this.enqueue(async()=>{await this.load();return this.payload.tickets.slice().reverse()})}
  listAudit(){return this.enqueue(async()=>{await this.load();return this.payload.audit.slice().reverse()})}
  async close(){await this.chain;await this.authorityTransactions.close();await this.consequenceAlgebra.close()}
}
