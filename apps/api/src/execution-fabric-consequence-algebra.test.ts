import crypto from "node:crypto";
import {mkdtemp,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach,describe,expect,it} from "vitest";
import {digest} from "@cieav/core/execution-fabric";
import {CieavAgentKernelStore} from "./agent-kernel.js";
import {makeRealityWitness} from "./intent-reality-engine.js";

const dirs:string[]=[];afterEach(async()=>{await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})))});
const intentId="73333333-3333-4333-8333-333333333333",deviceId="dev_algebra_12345678",sessionId="75555555-5555-4555-8555-555555555555",owner={id:"user-1",kind:"HUMAN" as const},actor={id:"agent-1",kind:"AGENT" as const};

async function setup(){
  const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-algebra-fabric-"));dirs.push(dir);const kernel=new CieavAgentKernelStore(path.join(dir,"kernel.json"),"k".repeat(64));
  const created=await kernel.create({scopeDeviceId:deviceId,sessionId,intentId,owner,actor,goal:"Send one governed update"}),taskId=created.task.id,now=Date.now(),fabric=kernel.executionFabric;
  const attestation=await fabric.registerAttestation({version:1,subjectId:"agent-1",provider:"test",method:"LOCAL_KEY",keyId:"agent-key-1",publicKeyFingerprint:"a".repeat(64),claimsDigest:"b".repeat(64),issuedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+600000).toISOString()});
  await fabric.putTool({id:"message.mcp",displayName:"Message MCP",protocol:"MCP",operation:"send",downstreamRef:"mcp://message/send",credentialMode:"NONE",risk:"HIGH",consequenceCapable:true,proofSources:["readback"],enabled:true});
  await fabric.putTool({id:"message.http",displayName:"Message HTTP",protocol:"HTTP",operation:"send",downstreamRef:"https://example.invalid/message",credentialMode:"NONE",risk:"HIGH",consequenceCapable:true,proofSources:["readback"],enabled:true});
  const leaseBase={version:1 as const,sessionId,identityAttestationId:attestation.id,scopeDeviceId:deviceId,audience:"*",allowedIntentIds:[intentId],allowedToolIds:["message.mcp","message.http"],allowedOperations:["send"],maxRisk:"HIGH" as const,credentialRefDigest:"c".repeat(64),issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+300000).toISOString(),maxUses:4};
  const lease=await fabric.issueLease({id:crypto.randomUUID(),...leaseBase,bindingDigest:digest(leaseBase),used:0});
  await fabric.putPermissionGraph({id:crypto.randomUUID(),version:1,scopeDeviceId:deviceId,rootIntentId:intentId,defaultDecision:"DENY",edges:[{id:crypto.randomUUID(),effect:"ALLOW",subjectIds:["agent-1"],intentIds:[intentId],toolIds:["message.mcp","message.http"],operations:["send"],targetPrefixes:["message://customer/"],maxRisk:"HIGH",evidenceRefs:["intent:root"],reason:"One governed customer message is allowed."}],createdAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString()});
  const witness=makeRealityWitness([{key:"message.customer-42",value:{status:"NOT_SENT"},source:"readback"}],new Date(now).toISOString()),base={version:1 as const,taskId,intentId,scopeDeviceId:deviceId,subjectId:"agent-1",identityAttestationId:attestation.id,credentialLeaseId:lease.id,operation:"send",target:"message://customer/42",risk:"HIGH" as const,normalizedArgumentsDigest:"d".repeat(64),semanticEffect:{kind:"COMMUNICATE" as const,target:"message://customer/42",objectRef:"customer-42",attributes:{template:"v1"}},realityWitness:witness,expectedPostStateDigest:"e".repeat(64),proofObligationDigest:"f".repeat(64),attenuationWitnessIds:[],createdAt:new Date(now).toISOString()};
  return{kernel,fabric,mcp:{...base,id:crypto.randomUUID(),toolId:"message.mcp",protocol:"MCP" as const},http:{...base,id:crypto.randomUUID(),toolId:"message.http",protocol:"HTTP" as const}};
}

describe("Execution Fabric Consequence Algebra interposition",()=>{
  it("requires Algebra ADMIT in addition to formal ALLOW",async()=>{const x=await setup(),r=await x.fabric.authorize(x.mcp);expect(r.decision.decision).toBe("ALLOW");expect(r.algebraAdmission?.decision).toBe("ADMIT");expect(r.executionAuthorityIssued).toBe(false);expect((await x.fabric.consequenceAlgebra.getNode(x.mcp.id))?.state).toBe("AUTHORIZED")});
  it("reconciles the same effect through a second protocol instead of authorizing duplicate execution",async()=>{const x=await setup();await x.fabric.authorize(x.mcp);await expect(x.fabric.authorize(x.http)).rejects.toThrow("consequence_algebra_reconcile");expect((await x.fabric.consequenceAlgebra.listReservations()).filter(r=>r.state!=="RELEASED")).toHaveLength(1)});
});
