import crypto from "node:crypto";
import {mkdtemp,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach,describe,expect,it} from "vitest";
import {ProofCaseSchema,type ProofProvenance} from "@cieav/contracts/proof";
import {digest} from "@cieav/core/execution-fabric";
import {CieavAgentKernelStore} from "./agent-kernel.js";
import {CieavProofStore} from "./proof-api.js";
import {exportAuthorityGradeTrajectory} from "./authority-grade-learning-export.js";
import {makeRealityWitness,sha256} from "./intent-reality-engine.js";

const dirs:string[]=[];
afterEach(async()=>{await Promise.all(dirs.splice(0).map(dir=>rm(dir,{recursive:true,force:true})))});

const intentId="33333333-3333-4333-8333-333333333333";
const deviceId="dev_export_12345678";
const sessionId="55555555-5555-4555-8555-555555555555";
const owner={id:"user-1",kind:"HUMAN" as const};
const actor={id:"agent-1",kind:"AGENT" as const};
const effect={kind:"COMMUNICATE" as const,target:"customer@example.com",objectRef:"customer-update-42",attributes:{channel:"email"}};
const normalizedArguments={to:"customer@example.com",subject:"Invoice reminder",template:"approved-v4"};
const preState=makeRealityWitness([{key:"message.customer-update-42",value:{status:"NOT_SENT"},source:"provider-readback"}],"2026-08-22T17:00:00.000Z");
const postState=makeRealityWitness([{key:"message.customer-update-42",value:{status:"SENT"},source:"provider-readback"}],"2026-08-22T17:00:01.000Z");
const commitment={
  id:"22222222-2222-4222-8222-222222222222",version:1 as const,intentId,owner,actor,authoritySource:"local-human-approval",
  summary:"Send governed update",desiredState:"Update sent",createdAt:"2026-08-22T16:59:00.000Z",state:"AUTHORIZED" as const,risk:"HIGH" as const,
  consequenceGraph:{version:1 as const,nodes:[{id:"send",kind:"COMMUNICATE" as const,summary:"Send update",affectedEntities:[],dataCategories:["MESSAGE"],risk:"HIGH" as const,reversibility:"COMPENSABLE" as const,external:true,dependsOn:[]}]},
  proofObligation:{version:1 as const,requirements:[{id:"delivery",kind:"EMAIL" as const,description:"Trusted delivery observation",required:true,minimumConfidence:.8,independentOfActor:true}],forbiddenShortcuts:["agent self-report"]},
  recovery:{kind:"ESCALATE" as const,requiresAuthorization:true,instructions:["Escalate unresolved delivery"]},metadata:{}
};

async function createExecutedTask(){
  const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-authority-grade-export-"));dirs.push(dir);
  const kernel=new CieavAgentKernelStore(path.join(dir,"kernel.json"),"k".repeat(64));
  const proofStore=new CieavProofStore(path.join(dir,"proof.json"),"p".repeat(64));
  const created=await kernel.create({scopeDeviceId:deviceId,sessionId,intentId,owner,actor,goal:"Send governed update"});
  const taskId=created.task.id;
  await kernel.transition(taskId,"QUEUED");
  await kernel.transition(taskId,"PLANNING");
  await kernel.requireCommitment(taskId);
  await kernel.bindCommitmentTrusted(taskId,commitment);

  const now=Date.now();
  const attestation=await kernel.executionFabric.registerAttestation({
    version:1,subjectId:actor.id,provider:"test-agent",method:"LOCAL_KEY",keyId:"agent-key-1",
    publicKeyFingerprint:"a".repeat(64),claimsDigest:"b".repeat(64),issuedAt:new Date(now-1_000).toISOString(),expiresAt:new Date(now+600_000).toISOString()
  });
  await kernel.executionFabric.putTool({id:"gmail.send",displayName:"Gmail Send",protocol:"MCP",operation:"send",downstreamRef:"mcp://gmail/send",credentialMode:"CIEAV_INJECTED",risk:"HIGH",consequenceCapable:true,proofSources:["provider-readback"],enabled:true});
  const leaseBase={version:1 as const,sessionId,identityAttestationId:attestation.id,scopeDeviceId:deviceId,audience:"tool:gmail.send",allowedIntentIds:[intentId],allowedToolIds:["gmail.send"],allowedOperations:["send"],maxRisk:"HIGH" as const,credentialRefDigest:"c".repeat(64),issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+300_000).toISOString(),maxUses:2};
  const lease=await kernel.executionFabric.issueLease({id:crypto.randomUUID(),...leaseBase,bindingDigest:digest(leaseBase),used:0});
  await kernel.executionFabric.putPermissionGraph({id:crypto.randomUUID(),version:1,scopeDeviceId:deviceId,rootIntentId:intentId,defaultDecision:"DENY",edges:[{id:crypto.randomUUID(),effect:"ALLOW",subjectIds:[actor.id],intentIds:[intentId],toolIds:["gmail.send"],operations:["send"],targetPrefixes:["mailto:customer@"],maxRisk:"HIGH",evidenceRefs:["intent:root","policy:customer-contact"],reason:"Governed customer communication is within root Intent."}],createdAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString()});

  const proposal={id:crypto.randomUUID(),version:1 as const,taskId,intentId,scopeDeviceId:deviceId,subjectId:actor.id,identityAttestationId:attestation.id,credentialLeaseId:lease.id,toolId:"gmail.send",protocol:"MCP" as const,operation:"send",target:"mailto:customer@example.com",risk:"HIGH" as const,normalizedArgumentsDigest:digest(normalizedArguments),semanticEffect:effect,realityWitness:preState,expectedPostStateDigest:postState.digest,proofObligationDigest:sha256(commitment.proofObligation),attenuationWitnessIds:[],createdAt:new Date(now).toISOString()};
  const realityCommit=await kernel.intentReality.issueRealityBoundCommit({taskId,intentId,commitment,proposal,effect,preState,expectedPostState:postState,ttlSeconds:60});
  await kernel.bindRealityCommitTrusted(taskId,realityCommit.id,realityCommit.effectKey);
  const authorized=await kernel.executionFabric.authorize(proposal);
  expect(authorized.decision.decision).toBe("ALLOW");
  await kernel.intentReality.consumeRealityBoundCommit(realityCommit.id,preState);
  await kernel.consumeRealityCommitTrusted(taskId,realityCommit.id);
  const ticket=await kernel.executionFabric.issueTicket(proposal.id,realityCommit.id);
  await kernel.executionFabric.consumeTicket(ticket.id,normalizedArguments);
  await kernel.transition(taskId,"RUNNING");
  return{dir,kernel,proofStore,taskId,ticket};
}

async function settleWithProof(x:Awaited<ReturnType<typeof createExecutedTask>>,provenance:ProofProvenance){
  await x.kernel.executionFabric.recordExecutionAttempt(x.ticket.id,"ACCEPTED","Provider accepted exact authorized send request.",{providerRequestId:"provider-42"});
  await x.kernel.transition(x.taskId,"OBSERVING");
  const at=new Date().toISOString();
  const observation={id:crypto.randomUUID(),kind:"EMAIL" as const,signal:"SUPPORTS" as const,summary:"Provider readback confirms the governed message was sent.",observedAt:at,source:"provider-readback",digest:"d".repeat(64),confidence:.99,provenance};
  const proof=ProofCaseSchema.parse({
    id:crypto.randomUUID(),intentId,
    plan:{expectedState:["message customer-update-42 is SENT"],requirements:[{kind:"EMAIL",required:true,minConfidence:.8}]},
    observations:[observation],
    assessment:{status:"PROVEN",confidence:.99,evaluatedAt:at,supporting:[observation],contradicting:[],neutral:[],missingRequired:[],warnings:[]},
    createdAt:at,updatedAt:at
  });
  await x.proofStore.save(deviceId,proof);
  await x.kernel.bindProofTrusted(x.taskId,proof.id);
  await x.kernel.settleTrusted(x.taskId,"PROVEN");
  return proof;
}

describe("authority-grade learning export",()=>{
  it("exports an RL-eligible SUCCESS only from the complete authenticated authority and trusted-proof chain",async()=>{
    const x=await createExecutedTask();
    await settleWithProof(x,"TRUSTED_ADAPTER");
    const result=await exportAuthorityGradeTrajectory(x.kernel,x.proofStore,x.ticket.id,{redactionProfile:"training-redaction-v1",consentScope:"local-training"});
    expect(result.assessment.cryptographicallyVerified).toBe(true);
    expect(result.assessment.authorityGrade).toBe(true);
    expect(result.assessment.outcome).toBe("SUCCESS");
    expect(result.assessment.hardFailures).toEqual([]);
    expect(result.trajectory.authorityGrade).toBe(true);
    expect(result.trajectory.realityBound).toBe(true);
    expect(result.trajectory.eligibleAgenticRl).toBe(true);
    expect(result.trajectory.outcome).toBe("SUCCESS");
    expect(result.trajectory.worldBeforeDigest).toBe(preState.digest);
    expect(result.trajectory.worldAfterDigest).toBeUndefined();
    expect(result.trajectory.authority).toBe(false);
    expect(result.trajectory.productionAuthority).toBe(false);
    await x.kernel.close();await x.proofStore.close();
  });

  it("does not let an agent self-report create authority-grade success",async()=>{
    const x=await createExecutedTask();
    await settleWithProof(x,"AGENT_REPORT");
    const result=await exportAuthorityGradeTrajectory(x.kernel,x.proofStore,x.ticket.id,{redactionProfile:"training-redaction-v1"});
    expect(result.assessment.trustedOutcomeEvidence).toBe(false);
    expect(result.assessment.authorityGrade).toBe(false);
    expect(result.assessment.outcome).toBe("UNKNOWN");
    expect(result.trajectory.eligibleAgenticRl).toBe(false);
    expect(result.trajectory.outcome).toBe("UNKNOWN");
    await x.kernel.close();await x.proofStore.close();
  });

  it("rejects duplicate execution-attempt evidence as non-authority-grade and preserves UNKNOWN",async()=>{
    const x=await createExecutedTask();
    await x.kernel.executionFabric.recordExecutionAttempt(x.ticket.id,"ACCEPTED","first dispatch",{attempt:1});
    await x.kernel.executionFabric.recordExecutionAttempt(x.ticket.id,"ACCEPTED","duplicate dispatch record",{attempt:2});
    await x.kernel.transition(x.taskId,"OBSERVING");
    const at=new Date().toISOString(),observation={id:crypto.randomUUID(),kind:"EMAIL" as const,signal:"SUPPORTS" as const,summary:"Trusted provider confirms delivery.",observedAt:at,source:"provider-readback",confidence:.99,provenance:"TRUSTED_ADAPTER" as const};
    const proof=ProofCaseSchema.parse({id:crypto.randomUUID(),intentId,plan:{expectedState:["sent"],requirements:[{kind:"EMAIL",required:true,minConfidence:.8}]},observations:[observation],assessment:{status:"PROVEN",confidence:.99,evaluatedAt:at,supporting:[observation],contradicting:[],neutral:[],missingRequired:[],warnings:[]},createdAt:at,updatedAt:at});
    await x.proofStore.save(deviceId,proof);await x.kernel.bindProofTrusted(x.taskId,proof.id);await x.kernel.settleTrusted(x.taskId,"PROVEN");
    const result=await exportAuthorityGradeTrajectory(x.kernel,x.proofStore,x.ticket.id,{redactionProfile:"training-redaction-v1"});
    expect(result.assessment.hardFailures).toContain("multiple_execution_attempts_for_ticket");
    expect(result.assessment.authorityGrade).toBe(false);
    expect(result.assessment.outcome).toBe("UNKNOWN");
    expect(result.trajectory.eligibleAgenticRl).toBe(false);
    await x.kernel.close();await x.proofStore.close();
  });
});
