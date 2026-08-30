import crypto from "node:crypto";
import {mkdtemp,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach,describe,expect,it} from "vitest";
import {digest} from "@cieav/core/execution-fabric";
import {CieavAgentKernelStore} from "./agent-kernel.js";
import {makeRealityWitness,semanticEffectKey,sha256} from "./intent-reality-engine.js";

const dirs:string[]=[];
afterEach(async()=>{await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})))});

const stateSecret="k".repeat(64);
const intentId="73333333-3333-4333-8333-333333333333";
const deviceId="dev_tx_recovery_12345678";
const sessionId="75555555-5555-4555-8555-555555555555";
const owner={id:"user-1",kind:"HUMAN" as const};
const actor={id:"agent-1",kind:"AGENT" as const};
const commitment={id:"72222222-2222-4222-8222-222222222222",version:1 as const,intentId,owner,actor,authoritySource:"local-human-approval",summary:"Send governed update",desiredState:"Update sent",createdAt:"2026-08-19T00:00:00.000Z",state:"AUTHORIZED" as const,risk:"HIGH" as const,consequenceGraph:{version:1 as const,nodes:[{id:"send",kind:"COMMUNICATE" as const,summary:"Send update",affectedEntities:[],dataCategories:["MESSAGE"],risk:"HIGH" as const,reversibility:"COMPENSABLE" as const,external:true,dependsOn:[]}]},proofObligation:{version:1 as const,requirements:[{id:"delivery",kind:"EMAIL" as const,description:"Trusted delivery observation",required:true,minimumConfidence:.8,independentOfActor:true}],forbiddenShortcuts:["agent self-report"]},recovery:{kind:"ESCALATE" as const,requiresAuthorization:true,instructions:["Escalate unresolved delivery"]},metadata:{}};
const effect={kind:"COMMUNICATE" as const,target:"customer@example.com",objectRef:"customer-update-42",attributes:{channel:"email"}};
const normalizedArguments={to:"customer@example.com",subject:"Invoice reminder",template:"approved-v4"};
const preState=makeRealityWitness([{key:"message.customer-update-42",value:{status:"NOT_SENT"},source:"provider-readback"}],"2026-08-19T00:01:00.000Z");
const postState=makeRealityWitness([{key:"message.customer-update-42",value:{status:"SENT"},source:"provider-readback"}],"2026-08-19T00:01:00.000Z");
const consequenceContract={version:"CIEAV_TRUSTED_TOOL_CONSEQUENCE_CONTRACT_V1" as const,effectKinds:["COMMUNICATE" as const],targetBinding:"ROUTE_TARGET" as const,targetPrefixes:["mailto:customer@"],requiredAttributeKeys:["channel"],duplicateSemantics:"RECONCILE_BEFORE_RETRY" as const,canonicalResolverId:"cieav.mail.address.v1",canonicalResolverVersion:"1",authority:false as const};
const tool=(overrides:Record<string,unknown>={})=>({id:"gmail.send",displayName:"Gmail Send",protocol:"MCP" as const,operation:"send",downstreamRef:"mcp://gmail/send",credentialMode:"CIEAV_INJECTED" as const,risk:"HIGH" as const,consequenceCapable:true,proofSources:["provider-readback"],enabled:true,consequenceContract,...overrides});

async function setup(){
  const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-authority-tx-recovery-"));dirs.push(dir);
  const kernel=new CieavAgentKernelStore(path.join(dir,"kernel.json"),stateSecret);
  const created=await kernel.create({scopeDeviceId:deviceId,sessionId,intentId,owner,actor,goal:"Send governed update"}),taskId=created.task.id;
  await kernel.transition(taskId,"QUEUED");await kernel.transition(taskId,"PLANNING");await kernel.requireCommitment(taskId);await kernel.bindCommitmentTrusted(taskId,commitment);
  const fabric=kernel.executionFabric,now=Date.now();
  const attestation=await fabric.registerAttestation({version:1,subjectId:"agent-1",provider:"openclaw",method:"LOCAL_KEY",keyId:"agent-key-1",publicKeyFingerprint:"a".repeat(64),claimsDigest:"b".repeat(64),issuedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+600_000).toISOString()});
  await fabric.putTool(tool());
  const leaseBase={version:1 as const,sessionId,identityAttestationId:attestation.id,scopeDeviceId:deviceId,audience:"tool:gmail.send",allowedIntentIds:[intentId],allowedToolIds:["gmail.send"],allowedOperations:["send"],maxRisk:"HIGH" as const,credentialRefDigest:"c".repeat(64),issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+300_000).toISOString(),maxUses:2};
  const lease=await fabric.issueLease({id:crypto.randomUUID(),...leaseBase,bindingDigest:digest(leaseBase),used:0});
  await fabric.putPermissionGraph({id:crypto.randomUUID(),version:1,scopeDeviceId:deviceId,rootIntentId:intentId,defaultDecision:"DENY",edges:[{id:crypto.randomUUID(),effect:"ALLOW",subjectIds:["agent-1"],intentIds:[intentId],toolIds:["gmail.send"],operations:["send"],targetPrefixes:["mailto:customer@"],maxRisk:"HIGH",evidenceRefs:["intent:root","policy:customer-contact"],reason:"Governed customer communication is within root Intent."}],createdAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString()});
  const proposal={id:crypto.randomUUID(),version:1 as const,taskId,intentId,scopeDeviceId:deviceId,subjectId:"agent-1",identityAttestationId:attestation.id,credentialLeaseId:lease.id,toolId:"gmail.send",protocol:"MCP" as const,operation:"send",target:"mailto:customer@example.com",risk:"HIGH" as const,normalizedArgumentsDigest:digest(normalizedArguments),semanticEffect:effect,realityWitness:preState,expectedPostStateDigest:postState.digest,proofObligationDigest:sha256(commitment.proofObligation),attenuationWitnessIds:[],createdAt:new Date(now).toISOString()};
  const realityCommit=await kernel.intentReality.issueRealityBoundCommit({taskId,intentId,commitment,proposal,effect,preState,expectedPostState:postState,ttlSeconds:60});
  await kernel.bindRealityCommitTrusted(taskId,realityCommit.id,realityCommit.effectKey);
  await fabric.authorize(proposal);
  await kernel.intentReality.consumeRealityBoundCommit(realityCommit.id,preState);await kernel.consumeRealityCommitTrusted(taskId,realityCommit.id);
  return{dir,kernel,fabric,taskId,proposal,realityCommit,lease};
}

type ProposalRecord=NonNullable<Awaited<ReturnType<Awaited<ReturnType<typeof setup>>["fabric"]["getProposalRecord"]>>>;
function requireBindings(record:ProposalRecord){if(!record.trustedToolBinding||!record.consequenceBundle)throw new Error("missing proposal trusted-tool/bundle record");return{trusted:record.trustedToolBinding,bundle:record.consequenceBundle}}
function buildTicket(x:Awaited<ReturnType<typeof setup>>,record:ProposalRecord){
  const {trusted,bundle}=requireBindings(record),now=Date.now();
  return {id:crypto.randomUUID(),version:1 as const,proposalId:x.proposal.id,intentId,taskId:x.taskId,toolId:x.proposal.toolId,authorizationDigest:digest({decision:record.decision,trustedToolBindingDigest:trusted.bindingDigest,consequenceBundleDigest:bundle.bundleDigest}),realityBoundCommitId:x.realityCommit.id,credentialLeaseId:x.lease.id,routeDigest:digest({toolId:x.proposal.toolId,protocol:x.proposal.protocol,operation:x.proposal.operation,target:x.proposal.target??null,normalizedArgumentsDigest:x.proposal.normalizedArgumentsDigest,trustedToolBindingDigest:trusted.bindingDigest,consequenceBundleDigest:bundle.bundleDigest}),issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+30_000).toISOString(),status:"ISSUED" as const};
}
async function setupConsumedTicket(){const x=await setup(),ticket=await x.fabric.issueTicket(x.proposal.id,x.realityCommit.id);await x.fabric.consumeTicket(ticket.id,normalizedArguments);return{...x,ticket}}

describe("CIEAV authority transaction crash recovery",()=>{
  it("recovers a prepared ticket issue exactly once after reopen",async()=>{
    const x=await setup(),record=await x.fabric.getProposalRecord(x.proposal.id);if(!record)throw new Error("missing proposal record");const {trusted,bundle}=requireBindings(record),ticket=buildTicket(x,record);
    await x.fabric.authorityTransactions.begin("ISSUE_TICKET",`issue:${x.proposal.id}:${x.realityCommit.id}`,{ticket,proposalId:x.proposal.id,trustedToolBindingDigest:trusted.bindingDigest,consequenceBundleDigest:bundle.bundleDigest,scopeDeviceId:deviceId,intentId,taskId:x.taskId});
    expect((await x.fabric.authorityTransactions.health()).pending).toBe(1);await x.kernel.close();
    const reopened=new CieavAgentKernelStore(path.join(x.dir,"kernel.json"),stateSecret),tickets=await reopened.executionFabric.listTickets();
    expect(tickets.filter(t=>t.id===ticket.id)).toHaveLength(1);expect((await reopened.executionFabric.consequenceAlgebra.getNode(x.proposal.id))?.state).toBe("COMMITTED");
    const health=await reopened.executionFabric.authorityTransactionHealth();expect(health).toMatchObject({pending:0,localFencingOnly:true,clusterHaQualified:false,authority:false,mayMintExecutionAuthority:false});
    expect((await reopened.executionFabric.listAudit()).filter(a=>a.ticketId===ticket.id&&a.phase==="COMMIT"&&a.outcome==="PASS")).toHaveLength(1);
    await reopened.executionFabric.recoverAuthorityTransactionsOnStartup();expect((await reopened.executionFabric.listAudit()).filter(a=>a.ticketId===ticket.id&&a.phase==="COMMIT"&&a.outcome==="PASS")).toHaveLength(1);await reopened.close();
  });

  it("recovers a prepared ticket consumption without double-spending the lease",async()=>{
    const x=await setup(),record=await x.fabric.getProposalRecord(x.proposal.id);if(!record)throw new Error("missing proposal record");const {trusted,bundle}=requireBindings(record);
    const ticket=await x.fabric.issueTicket(x.proposal.id,x.realityCommit.id),consumed={...ticket,status:"CONSUMED" as const,consumedAt:new Date().toISOString()};
    await x.fabric.authorityTransactions.begin("CONSUME_TICKET",`consume:${ticket.id}`,{ticketId:ticket.id,consumed,proposalId:x.proposal.id,trustedToolBindingDigest:trusted.bindingDigest,consequenceBundleDigest:bundle.bundleDigest,leaseId:x.lease.id,leaseUsedBefore:x.lease.used,argumentsDigest:x.proposal.normalizedArgumentsDigest,scopeDeviceId:deviceId,intentId,taskId:x.taskId});
    expect((await x.fabric.authorityTransactions.health()).pending).toBe(1);await x.kernel.close();
    const reopened=new CieavAgentKernelStore(path.join(x.dir,"kernel.json"),stateSecret),recovered=(await reopened.executionFabric.listTickets()).find(t=>t.id===ticket.id);
    expect(recovered?.status).toBe("CONSUMED");expect((await reopened.executionFabric.consequenceAlgebra.getNode(x.proposal.id))?.state).toBe("DISPATCHED");expect((await reopened.executionFabric.listLeases()).find(l=>l.id===x.lease.id)?.used).toBe(x.lease.used+1);
    expect((await reopened.executionFabric.listAudit()).filter(a=>a.ticketId===ticket.id&&a.phase==="ROUTE"&&a.outcome==="PASS")).toHaveLength(1);await reopened.executionFabric.recoverAuthorityTransactionsOnStartup();
    expect((await reopened.executionFabric.listLeases()).find(l=>l.id===x.lease.id)?.used).toBe(x.lease.used+1);expect((await reopened.executionFabric.listAudit()).filter(a=>a.ticketId===ticket.id&&a.phase==="ROUTE"&&a.outcome==="PASS")).toHaveLength(1);expect((await reopened.executionFabric.authorityTransactionHealth()).pending).toBe(0);await reopened.close();
  });

  it("records UNKNOWN execution once and blocks semantic retry",async()=>{
    const x=await setupConsumedTicket(),details={provider:"gmail",error:"socket closed after request write"},first=await x.fabric.recordExecutionAttempt(x.ticket.id,"UNKNOWN","Provider outcome could not be determined.",details),second=await x.fabric.recordExecutionAttempt(x.ticket.id,"UNKNOWN","Provider outcome could not be determined.",details);
    expect(first.quarantine?.id).toBe(second.quarantine?.id);expect((await x.kernel.intentReality.listQuarantines()).filter(q=>q.effectKey===x.realityCommit.effectKey&&q.status==="OPEN")).toHaveLength(1);expect((await x.kernel.get(x.taskId))?.effectQuarantined).toBe(true);expect((await x.fabric.consequenceAlgebra.getNode(x.proposal.id))?.state).toBe("QUARANTINED");expect((await x.fabric.listAudit()).filter(a=>a.ticketId===x.ticket.id&&a.phase==="EXECUTE"&&a.outcome==="UNKNOWN")).toHaveLength(1);await expect(x.kernel.intentReality.assertRetryAllowed(x.realityCommit.effectKey)).rejects.toThrow("semantic_effect_quarantined");expect((await x.fabric.authorityTransactionHealth()).pending).toBe(0);await expect(x.fabric.recordExecutionAttempt(x.ticket.id,"UNKNOWN","Provider outcome could not be determined.",{provider:"gmail",error:"different evidence"})).rejects.toThrow("authority transaction committed key conflict");
  });

  it("recovers a prepared UNKNOWN observation after the tool changes post-dispatch",async()=>{
    const x=await setupConsumedTicket(),record=await x.fabric.getProposalRecord(x.proposal.id);if(!record)throw new Error("missing proposal record");const {trusted,bundle}=requireBindings(record),effectKey=semanticEffectKey(intentId,x.proposal.semanticEffect),summary="Provider outcome could not be determined.",detailsDigest=digest({provider:"gmail",error:"connection reset"});
    await x.fabric.authorityTransactions.begin("RECORD_EXECUTION_ATTEMPT",`execute:${x.ticket.id}`,{ticketId:x.ticket.id,proposalId:x.proposal.id,trustedToolBindingDigest:trusted.bindingDigest,consequenceBundleDigest:bundle.bundleDigest,scopeDeviceId:deviceId,intentId,taskId:x.taskId,transport:"UNKNOWN",summary,detailsDigest,effectKey});
    await x.fabric.putTool(tool({enabled:false,consequenceContract:{...consequenceContract,canonicalResolverVersion:"2"}}));await x.kernel.close();
    const reopened=new CieavAgentKernelStore(path.join(x.dir,"kernel.json"),stateSecret);await reopened.recoverOnStartup();expect((await reopened.executionFabric.listAudit()).filter(a=>a.ticketId===x.ticket.id&&a.phase==="EXECUTE"&&a.outcome==="UNKNOWN")).toHaveLength(1);expect((await reopened.executionFabric.consequenceAlgebra.getNode(x.proposal.id))?.state).toBe("QUARANTINED");expect((await reopened.executionFabric.authorityTransactionHealth()).pending).toBe(0);await reopened.close();
  });

  it("recovers a partially applied UNKNOWN execution with the same quarantine id",async()=>{
    const x=await setupConsumedTicket(),record=await x.fabric.getProposalRecord(x.proposal.id);if(!record)throw new Error("missing proposal record");const {trusted,bundle}=requireBindings(record),effectKey=semanticEffectKey(intentId,x.proposal.semanticEffect),summary="Provider outcome could not be determined.",details={provider:"gmail",error:"connection reset"},detailsDigest=digest(details),quarantine=await x.kernel.intentReality.quarantineUnknown(effectKey,x.taskId,intentId,"UNKNOWN_OUTCOME");
    await x.fabric.authorityTransactions.begin("RECORD_EXECUTION_ATTEMPT",`execute:${x.ticket.id}`,{ticketId:x.ticket.id,proposalId:x.proposal.id,trustedToolBindingDigest:trusted.bindingDigest,consequenceBundleDigest:bundle.bundleDigest,scopeDeviceId:deviceId,intentId,taskId:x.taskId,transport:"UNKNOWN",summary,detailsDigest,effectKey});
    expect((await x.fabric.authorityTransactions.health()).pending).toBe(1);await x.kernel.close();
    const reopened=new CieavAgentKernelStore(path.join(x.dir,"kernel.json"),stateSecret);await reopened.recoverOnStartup();const quarantines=(await reopened.intentReality.listQuarantines()).filter(q=>q.effectKey===effectKey&&q.status==="OPEN");expect(quarantines).toHaveLength(1);expect(quarantines[0]?.id).toBe(quarantine.id);expect((await reopened.get(x.taskId))?.effectQuarantined).toBe(true);expect((await reopened.executionFabric.consequenceAlgebra.getNode(x.proposal.id))?.state).toBe("QUARANTINED");expect((await reopened.executionFabric.listAudit()).filter(a=>a.ticketId===x.ticket.id&&a.phase==="EXECUTE"&&a.outcome==="UNKNOWN")).toHaveLength(1);await expect(reopened.intentReality.assertRetryAllowed(effectKey)).rejects.toThrow(`semantic_effect_quarantined:${quarantine.id}`);expect((await reopened.executionFabric.authorityTransactionHealth()).pending).toBe(0);await reopened.recoverOnStartup();expect((await reopened.executionFabric.listAudit()).filter(a=>a.ticketId===x.ticket.id&&a.phase==="EXECUTE"&&a.outcome==="UNKNOWN")).toHaveLength(1);await reopened.close();
  });
});
