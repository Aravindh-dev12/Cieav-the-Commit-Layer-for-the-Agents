import crypto from "node:crypto";
import {mkdtemp,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach,describe,expect,it} from "vitest";
import {digest} from "@cieav/core/execution-fabric";
import {CieavAgentKernelStore} from "./agent-kernel.js";
import {makeRealityWitness,sha256} from "./intent-reality-engine.js";

const dirs:string[]=[];
afterEach(async()=>{await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})))});
const intentId="33333333-3333-4333-8333-333333333333",deviceId="dev_test_12345678",sessionId="55555555-5555-4555-8555-555555555555";
const owner={id:"user-1",kind:"HUMAN" as const},actor={id:"agent-1",kind:"AGENT" as const};
const commitment={id:"22222222-2222-4222-8222-222222222222",version:1 as const,intentId,owner,actor,authoritySource:"local-human-approval",summary:"Send governed update",desiredState:"Update sent",createdAt:"2026-08-19T00:00:00.000Z",state:"AUTHORIZED" as const,risk:"HIGH" as const,consequenceGraph:{version:1 as const,nodes:[{id:"send",kind:"COMMUNICATE" as const,summary:"Send update",affectedEntities:[],dataCategories:["MESSAGE"],risk:"HIGH" as const,reversibility:"COMPENSABLE" as const,external:true,dependsOn:[]}]},proofObligation:{version:1 as const,requirements:[{id:"delivery",kind:"EMAIL" as const,description:"Trusted delivery observation",required:true,minimumConfidence:.8,independentOfActor:true}],forbiddenShortcuts:["agent self-report"]},recovery:{kind:"ESCALATE" as const,requiresAuthorization:true,instructions:["Escalate unresolved delivery"]},metadata:{}};
const effect={kind:"COMMUNICATE" as const,target:"customer@example.com",objectRef:"customer-update-42",attributes:{channel:"email"}};
const normalizedArguments={to:"customer@example.com",subject:"Invoice reminder",template:"approved-v4"};
const preState=makeRealityWitness([{key:"message.customer-update-42",value:{status:"NOT_SENT"},source:"provider-readback"}],"2026-08-19T00:01:00.000Z");
const postState=makeRealityWitness([{key:"message.customer-update-42",value:{status:"SENT"},source:"provider-readback"}],"2026-08-19T00:01:00.000Z");

async function setup(){
  const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-execution-fabric-"));dirs.push(dir);
  const kernel=new CieavAgentKernelStore(path.join(dir,"kernel.json"),"k".repeat(64));
  const created=await kernel.create({scopeDeviceId:deviceId,sessionId,intentId,owner,actor,goal:"Send governed update"}),taskId=created.task.id;
  await kernel.transition(taskId,"QUEUED");await kernel.transition(taskId,"PLANNING");await kernel.requireCommitment(taskId);await kernel.bindCommitmentTrusted(taskId,commitment);
  return{kernel,fabric:kernel.executionFabric,taskId};
}
async function setupFabric(){
  const x=await setup(),now=Date.now();
  const attestation=await x.fabric.registerAttestation({version:1,subjectId:"agent-1",provider:"openclaw",method:"LOCAL_KEY",keyId:"agent-key-1",publicKeyFingerprint:"a".repeat(64),claimsDigest:"b".repeat(64),issuedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+600_000).toISOString()});
  await x.fabric.putTool({id:"gmail.send",displayName:"Gmail Send",protocol:"MCP",operation:"send",downstreamRef:"mcp://gmail/send",credentialMode:"CIEAV_INJECTED",risk:"HIGH",consequenceCapable:true,proofSources:["provider-readback"],enabled:true});
  const leaseBase={version:1 as const,sessionId,identityAttestationId:attestation.id,scopeDeviceId:deviceId,audience:"tool:gmail.send",allowedIntentIds:[intentId],allowedToolIds:["gmail.send"],allowedOperations:["send"],maxRisk:"HIGH" as const,credentialRefDigest:"c".repeat(64),issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+300_000).toISOString(),maxUses:2};
  const lease=await x.fabric.issueLease({id:crypto.randomUUID(),...leaseBase,bindingDigest:digest(leaseBase),used:0});
  await x.fabric.putPermissionGraph({id:crypto.randomUUID(),version:1,scopeDeviceId:deviceId,rootIntentId:intentId,defaultDecision:"DENY",edges:[{id:crypto.randomUUID(),effect:"ALLOW",subjectIds:["agent-1"],intentIds:[intentId],toolIds:["gmail.send"],operations:["send"],targetPrefixes:["mailto:customer@"],maxRisk:"HIGH",evidenceRefs:["intent:root","policy:customer-contact"],reason:"Governed customer communication is within root Intent."}],createdAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString()});
  const proposal={id:crypto.randomUUID(),version:1 as const,taskId:x.taskId,intentId,scopeDeviceId:deviceId,subjectId:"agent-1",identityAttestationId:attestation.id,credentialLeaseId:lease.id,toolId:"gmail.send",protocol:"MCP" as const,operation:"send",target:"mailto:customer@example.com",risk:"HIGH" as const,normalizedArgumentsDigest:digest(normalizedArguments),semanticEffect:effect,realityWitness:preState,expectedPostStateDigest:postState.digest,proofObligationDigest:sha256(commitment.proofObligation),attenuationWitnessIds:[],createdAt:new Date(now).toISOString()};
  const realityCommit=await x.kernel.intentReality.issueRealityBoundCommit({taskId:x.taskId,intentId,commitment,proposal,effect,preState,expectedPostState:postState,ttlSeconds:60});
  await x.kernel.bindRealityCommitTrusted(x.taskId,realityCommit.id,realityCommit.effectKey);
  return{...x,attestation,lease,proposal,realityCommit};
}

async function consumeReality(x:Awaited<ReturnType<typeof setupFabric>>){await x.kernel.intentReality.consumeRealityBoundCommit(x.realityCommit.id,preState);await x.kernel.consumeRealityCommitTrusted(x.taskId,x.realityCommit.id)}

describe("CIEAV universal execution fabric",()=>{
  it("requires identity, scoped credential, formal authorization and consumed reality commit before issuing a one-use ticket",async()=>{const x=await setupFabric();const authorized=await x.fabric.authorize(x.proposal);expect(authorized.decision.decision).toBe("ALLOW");await expect(x.fabric.issueTicket(x.proposal.id,x.realityCommit.id)).rejects.toThrow("consumed_reality_bound_commit_required");await consumeReality(x);const ticket=await x.fabric.issueTicket(x.proposal.id,x.realityCommit.id);expect(ticket.status).toBe("ISSUED");const routed=await x.fabric.consumeTicket(ticket.id,normalizedArguments);expect(routed.ticket.status).toBe("CONSUMED");await expect(x.fabric.consumeTicket(ticket.id,normalizedArguments)).rejects.toThrow("execution_ticket_not_issuable")});

  it("blocks a second ticket from the same proposal or consumed reality commit",async()=>{const x=await setupFabric();await x.fabric.authorize(x.proposal);await consumeReality(x);await x.fabric.issueTicket(x.proposal.id,x.realityCommit.id);await expect(x.fabric.issueTicket(x.proposal.id,x.realityCommit.id)).rejects.toThrow("execution_ticket_already_issued")});

  it("re-hashes actual router arguments and rejects argument swapping",async()=>{const x=await setupFabric();await x.fabric.authorize(x.proposal);await consumeReality(x);const ticket=await x.fabric.issueTicket(x.proposal.id,x.realityCommit.id);await expect(x.fabric.consumeTicket(ticket.id,{...normalizedArguments,to:"attacker@example.net"})).rejects.toThrow("execution_arguments_changed_after_authorization");expect((await x.fabric.consumeTicket(ticket.id,normalizedArguments)).ticket.status).toBe("CONSUMED")});

  it("blocks agent identity substitution",async()=>{const x=await setupFabric();await expect(x.fabric.authorize({...x.proposal,subjectId:"agent-other"})).rejects.toThrow("execution_proposal_task_binding_mismatch")});

  it("blocks credential lease tool and risk escape",async()=>{const x=await setupFabric();await expect(x.fabric.authorize({...x.proposal,toolId:"stripe.refund"})).rejects.toThrow("credential_lease_scope_violation");await expect(x.fabric.authorize({...x.proposal,risk:"CRITICAL" as const})).rejects.toThrow("credential_lease_scope_violation")});

  it("requires continuing-authority and exact reflex binding before authorization",async()=>{const x=await setupFabric();await x.fabric.putTool({id:"gmail.send",displayName:"Gmail Send",protocol:"MCP",operation:"send",downstreamRef:"mcp://gmail/send",credentialMode:"CIEAV_INJECTED",risk:"HIGH",consequenceCapable:true,proofSources:["provider-readback"],enabled:true,executionMode:"CONTINUING",requiredReflexPolicyId:"reflex-safe-v1"});await expect(x.fabric.authorize(x.proposal)).rejects.toThrow("continuing_authority_requirement_missing");const withWrongReflex={...x.proposal,continuingAuthority:{ttlSeconds:60,conditions:[],budgets:[],reflexPolicyId:"reflex-other-v1"}};await expect(x.fabric.authorize(withWrongReflex)).rejects.toThrow("required_reflex_policy_mismatch")});

  it("blocks a mismatched semantic effect even after the original reality commit was consumed",async()=>{const x=await setupFabric();const changed={...x.proposal,id:crypto.randomUUID(),semanticEffect:{...effect,target:"other@example.com"}};await x.fabric.authorize(changed);await consumeReality(x);await expect(x.fabric.issueTicket(changed.id,x.realityCommit.id)).rejects.toThrow("execution_proposal_reality_commit_binding_mismatch")});

  it("rejects a proposal that differs from the exact proposal digest committed before execution",async()=>{const x=await setupFabric();const changed={...x.proposal,id:crypto.randomUUID(),target:"mailto:customer+changed@example.com"};await x.fabric.authorize(changed);await consumeReality(x);await expect(x.fabric.issueTicket(changed.id,x.realityCommit.id)).rejects.toThrow("execution_proposal_reality_commit_binding_mismatch")});

  it("revoked credential lease cannot authorize or route",async()=>{const x=await setupFabric();await x.fabric.revokeLease(x.lease.id);await expect(x.fabric.authorize(x.proposal)).rejects.toThrow("credential_lease_scope_violation")});

  it("rechecks formal authorization before ticket issuance",async()=>{const x=await setupFabric();await x.fabric.authorize(x.proposal);await consumeReality(x);const now=new Date().toISOString();await x.fabric.putPermissionGraph({id:crypto.randomUUID(),version:1,scopeDeviceId:deviceId,rootIntentId:intentId,defaultDecision:"DENY",edges:[],createdAt:now,updatedAt:now});await expect(x.fabric.issueTicket(x.proposal.id,x.realityCommit.id)).rejects.toThrow("formal_authorization_changed_before_execution")});

  it("maintains a hash-linked execution audit trail",async()=>{const x=await setupFabric();await x.fabric.authorize(x.proposal);const audit=(await x.fabric.listAudit()).slice().reverse();expect(audit.length).toBeGreaterThanOrEqual(2);for(let i=1;i<audit.length;i++)expect(audit[i]!.previousHash).toBe(audit[i-1]!.eventHash)});
});
