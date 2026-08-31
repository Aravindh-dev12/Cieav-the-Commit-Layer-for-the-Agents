import crypto from "node:crypto";
import {mkdtemp,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach,describe,expect,it} from "vitest";
import type {EvidenceProviderBinding,EvidenceQuorumRequirement} from "@cieav/contracts";
import {digest} from "@cieav/core/execution-fabric";
import {CieavAgentKernelStore} from "./agent-kernel.js";
import {makeRealityWitness,sha256} from "./intent-reality-engine.js";

const dirs:string[]=[];
afterEach(async()=>{await Promise.all(dirs.splice(0).map(dir=>rm(dir,{recursive:true,force:true})))});

const intentId="33333333-3333-4333-8333-333333333333",deviceId="dev_test_12345678",sessionId="55555555-5555-4555-8555-555555555555";
const owner={id:"user-1",kind:"HUMAN" as const},actor={id:"agent-1",kind:"AGENT" as const};
const commitment={id:"22222222-2222-4222-8222-222222222222",version:1 as const,intentId,owner,actor,authoritySource:"local-human-approval",summary:"Send governed update",desiredState:"Update sent",createdAt:"2026-08-19T00:00:00.000Z",state:"AUTHORIZED" as const,risk:"HIGH" as const,consequenceGraph:{version:1 as const,nodes:[{id:"send",kind:"COMMUNICATE" as const,summary:"Send update",affectedEntities:[],dataCategories:["MESSAGE"],risk:"HIGH" as const,reversibility:"COMPENSABLE" as const,external:true,dependsOn:[]}]},proofObligation:{version:1 as const,requirements:[{id:"delivery",kind:"EMAIL" as const,description:"Trusted delivery observation",required:true,minimumConfidence:.8,independentOfActor:true}],forbiddenShortcuts:["agent self-report"]},recovery:{kind:"ESCALATE" as const,requiresAuthorization:true,instructions:["Escalate unresolved delivery"]},metadata:{}};
const effect={kind:"COMMUNICATE" as const,target:"customer@example.com",objectRef:"customer-update-42",attributes:{channel:"email"}};
const normalizedArguments={to:"customer@example.com",subject:"Invoice reminder",template:"approved-v4"};
const preState=makeRealityWitness([{key:"message.customer-update-42",value:{status:"NOT_SENT"},source:"provider-readback"}],"2026-08-19T00:01:00.000Z");
const postState=makeRealityWitness([{key:"message.customer-update-42",value:{status:"SENT"},source:"provider-readback"}],"2026-08-19T00:01:00.000Z");
const consequenceContract={version:"CIEAV_TRUSTED_TOOL_CONSEQUENCE_CONTRACT_V1" as const,effectKinds:["COMMUNICATE" as const],targetBinding:"ROUTE_TARGET" as const,targetPrefixes:["mailto:customer@"],requiredAttributeKeys:["channel"],duplicateSemantics:"RECONCILE_BEFORE_RETRY" as const,canonicalResolverId:"cieav.mail.address.v1",canonicalResolverVersion:"1",authority:false as const};
const gmailTool={id:"gmail.send",displayName:"Gmail Send",protocol:"MCP" as const,operation:"send",downstreamRef:"mcp://gmail/send",credentialMode:"CIEAV_INJECTED" as const,risk:"HIGH" as const,consequenceCapable:true,proofSources:["provider-readback"],enabled:true,consequenceContract};
const h=(c:string)=>c.repeat(64);

function provider(ref:string,domain:string,evidenceClasses:string|string[],digestChar:string,overrides:Partial<EvidenceProviderBinding>={}):EvidenceProviderBinding{return{version:"CIEAV_EVIDENCE_PROVIDER_BINDING_V1",ref,enabled:true,versionDigest:h(digestChar),independenceDomain:domain,evidenceClasses:Array.isArray(evidenceClasses)?evidenceClasses:[evidenceClasses],sourceClass:"REMOTE_API",health:"AVAILABLE",evidenceRefs:[`qualification:${ref}`],authority:false,mayMintExecutionAuthority:false,...overrides}}
function requirement(id=crypto.randomUUID()):EvidenceQuorumRequirement{return{id,version:"CIEAV_EVIDENCE_QUORUM_REQUIREMENT_V1",enabled:true,priority:100,toolIds:["gmail.send"],effectClasses:["COMMUNICATE"],minRisk:"HIGH",minimumProviders:2,minimumIndependenceDomains:2,requiredEvidenceClasses:["DELIVERY_READBACK","SIGNED_RECEIPT"],maxEvidenceAgeMs:120000,timeoutOutcome:"UNKNOWN",evidenceRefs:["policy:critical-communication-proof"],reason:"High-risk communication requires independent delivery evidence.",authority:false,mayMintExecutionAuthority:false}}

async function setup(){
  const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-execution-quorum-"));dirs.push(dir);
  const kernel=new CieavAgentKernelStore(path.join(dir,"kernel.json"),"k".repeat(64));
  const created=await kernel.create({scopeDeviceId:deviceId,sessionId,intentId,owner,actor,goal:"Send governed update"}),taskId=created.task.id;
  await kernel.transition(taskId,"QUEUED");await kernel.transition(taskId,"PLANNING");await kernel.requireCommitment(taskId);await kernel.bindCommitmentTrusted(taskId,commitment);
  const fabric=kernel.executionFabric,now=Date.now();
  const attestation=await fabric.registerAttestation({version:1,subjectId:"agent-1",provider:"openclaw",method:"LOCAL_KEY",keyId:"agent-key-1",publicKeyFingerprint:h("a"),claimsDigest:h("b"),issuedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+600_000).toISOString()});
  await fabric.putTool(gmailTool);
  const leaseBase={version:1 as const,sessionId,identityAttestationId:attestation.id,scopeDeviceId:deviceId,audience:"tool:gmail.send",allowedIntentIds:[intentId],allowedToolIds:["gmail.send"],allowedOperations:["send"],maxRisk:"HIGH" as const,credentialRefDigest:h("c"),issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+300_000).toISOString(),maxUses:2};
  const lease=await fabric.issueLease({id:crypto.randomUUID(),...leaseBase,bindingDigest:digest(leaseBase),used:0});
  await fabric.putPermissionGraph({id:crypto.randomUUID(),version:1,scopeDeviceId:deviceId,rootIntentId:intentId,defaultDecision:"DENY",edges:[{id:crypto.randomUUID(),effect:"ALLOW",subjectIds:["agent-1"],intentIds:[intentId],toolIds:["gmail.send"],operations:["send"],targetPrefixes:["mailto:customer@"],maxRisk:"HIGH",evidenceRefs:["intent:root","policy:customer-contact"],reason:"Governed customer communication is within root Intent."}],createdAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString()});
  const proposal={id:crypto.randomUUID(),version:1 as const,taskId,intentId,scopeDeviceId:deviceId,subjectId:"agent-1",identityAttestationId:attestation.id,credentialLeaseId:lease.id,toolId:"gmail.send",protocol:"MCP" as const,operation:"send",target:"mailto:customer@example.com",risk:"HIGH" as const,normalizedArgumentsDigest:digest(normalizedArguments),semanticEffect:effect,realityWitness:preState,expectedPostStateDigest:postState.digest,proofObligationDigest:sha256(commitment.proofObligation),attenuationWitnessIds:[],createdAt:new Date(now).toISOString()};
  const realityCommit=await kernel.intentReality.issueRealityBoundCommit({taskId,intentId,commitment,proposal,effect,preState,expectedPostState:postState,ttlSeconds:60});await kernel.bindRealityCommitTrusted(taskId,realityCommit.id,realityCommit.effectKey);
  return{kernel,fabric,proposal,realityCommit};
}

async function consumeReality(x:Awaited<ReturnType<typeof setup>>){await x.kernel.intentReality.consumeRealityBoundCommit(x.realityCommit.id,preState);await x.kernel.consumeRealityCommitTrusted(x.proposal.taskId,x.realityCommit.id)}

describe("Execution Fabric evidence quorum binding",()=>{
  it("rejects consumption of an issued ticket when selected proof provider drifts before dispatch",async()=>{
    const x=await setup(),r=requirement(),a=provider("gmail-readback","gmail","DELIVERY_READBACK","1"),b=provider("audit-receipt","audit-ledger","SIGNED_RECEIPT","2"),policy=await x.fabric.consequenceAlgebra.getPolicy();
    await x.fabric.consequenceAlgebra.putPolicy({...policy,proofabilityRisks:["HIGH","CRITICAL"],evidenceProviders:[a,b],evidenceQuorumRequirements:[r]});
    const authorized=await x.fabric.authorize(x.proposal);expect(authorized.algebraAdmission?.proofPlanReservation?.evidenceQuorumPlan?.availabilityState).toBe("SATISFIABLE");
    await consumeReality(x);const ticket=await x.fabric.issueTicket(x.proposal.id,x.realityCommit.id);expect(ticket.status).toBe("ISSUED");
    const current=await x.fabric.consequenceAlgebra.getPolicy();await x.fabric.consequenceAlgebra.putPolicy({...current,evidenceProviders:[a,{...b,health:"UNAVAILABLE"}]});
    await expect(x.fabric.consumeTicket(ticket.id,normalizedArguments)).rejects.toThrow(/evidence_quorum_provider_unavailable/);expect((await x.fabric.listTickets()).find(candidate=>candidate.id===ticket.id)?.status).toBe("ISSUED");
  });
});
