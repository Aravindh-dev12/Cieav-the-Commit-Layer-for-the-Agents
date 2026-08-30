import crypto from "node:crypto";
import {mkdtemp,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach,describe,expect,it} from "vitest";
import {digest} from "@cieav/core/execution-fabric";
import {CieavAgentKernelStore} from "./agent-kernel.js";
import {makeRealityWitness,sha256} from "./intent-reality-engine.js";

const dirs:string[]=[];
afterEach(async()=>{await Promise.all(dirs.splice(0).map(dir=>rm(dir,{recursive:true,force:true})))});

const intentId="91333333-3333-4333-8333-333333333333",deviceId="dev_m3_canonical_12345678",sessionId="91555555-5555-4555-8555-555555555555";
const owner={id:"user-1",kind:"HUMAN" as const},actor={id:"agent-1",kind:"AGENT" as const};
const commitment={id:"91222222-2222-4222-8222-222222222222",version:1 as const,intentId,owner,actor,authoritySource:"local-human-approval",summary:"Update governed Git ref",desiredState:"Main ref updated once",createdAt:"2026-08-30T00:00:00.000Z",state:"AUTHORIZED" as const,risk:"HIGH" as const,consequenceGraph:{version:1 as const,nodes:[{id:"update-main",kind:"UPDATE" as const,summary:"Update main ref",affectedEntities:[],dataCategories:["SOURCE_CODE"],risk:"HIGH" as const,reversibility:"COMPENSABLE" as const,external:true,dependsOn:[]}]},proofObligation:{version:1 as const,requirements:[{id:"git-readback",kind:"API_RESPONSE" as const,description:"Independent Git ref readback",required:true,minimumConfidence:.9,independentOfActor:true}],forbiddenShortcuts:["agent self-report"]},recovery:{kind:"ESCALATE" as const,requiresAuthorization:true,instructions:["Reconcile the canonical Git ref before any retry"]},metadata:{}};
const semanticEffect={kind:"UPDATE" as const,target:"git-ref:github.com/Acme/Platform#refs/heads/main",objectRef:"github.com/Acme/Platform#refs/heads/main",attributes:{ref:"refs/heads/main",transition:"fast-forward"}};
const args={repository:"Acme/Platform",ref:"refs/heads/main",newOid:"0123456789abcdef"};
const pre=makeRealityWitness([{key:"git.main",value:{oid:"old"},source:"git-readback"}],"2026-08-30T00:01:00.000Z");
const post=makeRealityWitness([{key:"git.main",value:{oid:"0123456789abcdef"},source:"git-readback"}],"2026-08-30T00:01:01.000Z");
const contract=(prefix:string)=>({version:"CIEAV_TRUSTED_TOOL_CONSEQUENCE_CONTRACT_V1" as const,effectKinds:["UPDATE" as const],targetBinding:"ROUTE_TARGET" as const,targetPrefixes:[prefix],requiredAttributeKeys:["ref","transition"],duplicateSemantics:"RECONCILE_BEFORE_RETRY" as const,canonicalResolverId:"cieav.git.ref.v1",canonicalResolverVersion:"1",authority:false as const});
const httpTool={id:"git.http",displayName:"Git HTTP",protocol:"HTTP" as const,operation:"update-ref",downstreamRef:"https://api.github.invalid/git/refs",credentialMode:"NONE" as const,risk:"HIGH" as const,consequenceCapable:true,proofSources:["git-readback"],enabled:true,consequenceContract:contract("https://github.com/")};
const cliTool={id:"git.cli",displayName:"Git CLI",protocol:"CLI" as const,operation:"update-ref",downstreamRef:"git",credentialMode:"NONE" as const,risk:"HIGH" as const,consequenceCapable:true,proofSources:["git-readback"],enabled:true,consequenceContract:contract("git@github.com:")};

async function setup(){
  const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-m3-canonical-"));dirs.push(dir);
  const kernel=new CieavAgentKernelStore(path.join(dir,"kernel.json"),"k".repeat(64));
  const created=await kernel.create({scopeDeviceId:deviceId,sessionId,intentId,owner,actor,goal:"Update one governed Git ref"}),taskId=created.task.id,now=Date.now(),fabric=kernel.executionFabric;
  await kernel.transition(taskId,"QUEUED");await kernel.transition(taskId,"PLANNING");await kernel.requireCommitment(taskId);await kernel.bindCommitmentTrusted(taskId,commitment);
  const attestation=await fabric.registerAttestation({version:1,subjectId:"agent-1",provider:"test",method:"LOCAL_KEY",keyId:"agent-key-m3",publicKeyFingerprint:"a".repeat(64),claimsDigest:"b".repeat(64),issuedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+600000).toISOString()});
  await fabric.putTool(httpTool);await fabric.putTool(cliTool);
  const leaseBase={version:1 as const,sessionId,identityAttestationId:attestation.id,scopeDeviceId:deviceId,audience:"*",allowedIntentIds:[intentId],allowedToolIds:[httpTool.id,cliTool.id],allowedOperations:["update-ref"],maxRisk:"HIGH" as const,credentialRefDigest:"c".repeat(64),issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+300000).toISOString(),maxUses:4};
  const lease=await fabric.issueLease({id:crypto.randomUUID(),...leaseBase,bindingDigest:digest(leaseBase),used:0});
  await fabric.putPermissionGraph({id:crypto.randomUUID(),version:1,scopeDeviceId:deviceId,rootIntentId:intentId,defaultDecision:"DENY",edges:[{id:crypto.randomUUID(),effect:"ALLOW",subjectIds:["agent-1"],intentIds:[intentId],toolIds:[httpTool.id,cliTool.id],operations:["update-ref"],targetPrefixes:["https://github.com/","git@github.com:"],maxRisk:"HIGH",evidenceRefs:["intent:root"],reason:"One governed main-ref update is allowed."}],createdAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString()});
  const base={version:1 as const,taskId,intentId,scopeDeviceId:deviceId,subjectId:"agent-1",identityAttestationId:attestation.id,credentialLeaseId:lease.id,operation:"update-ref",risk:"HIGH" as const,normalizedArgumentsDigest:digest(args),semanticEffect,realityWitness:pre,expectedPostStateDigest:post.digest,proofObligationDigest:sha256(commitment.proofObligation),attenuationWitnessIds:[],createdAt:new Date(now).toISOString()};
  return{kernel,fabric,http:{...base,id:crypto.randomUUID(),toolId:httpTool.id,protocol:"HTTP" as const,target:"https://github.com/Acme/Platform.git#refs/heads/main"},cli:{...base,id:crypto.randomUUID(),toolId:cliTool.id,protocol:"CLI" as const,target:"git@github.com:Acme/Platform.git#main"}};
}

describe("Execution Fabric canonical reality authority binding",()=>{
  it("persists canonical resolution and reconciles an equivalent heterogeneous route",async()=>{
    const x=await setup(),first=await x.fabric.authorize(x.http);
    expect(first.decision.decision).toBe("ALLOW");expect(first.canonicalRealityResolution.address.stableId).toBe("git://github.com/Acme/Platform#refs/heads/main");expect(first.canonicalRealityResolution.authority).toBe(false);
    const stored=await x.fabric.getProposalRecord(x.http.id);expect(stored?.canonicalRealityResolution?.resolutionDigest).toBe(first.canonicalRealityResolution.resolutionDigest);expect(stored?.consequenceBundle?.primaryEffects[0]?.realityAddresses[0]?.digest).toBe(first.canonicalRealityResolution.address.digest);
    await expect(x.fabric.authorize(x.cli)).rejects.toThrow("consequence_algebra_reconcile");
    expect((await x.fabric.consequenceAlgebra.listReservations()).filter(reservation=>!["RELEASED","EXPIRED"].includes(reservation.state))).toHaveLength(1);
  });
});
