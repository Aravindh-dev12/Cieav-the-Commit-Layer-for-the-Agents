import {describe,expect,it} from "vitest";
import {mkdtemp} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {createIntentContract} from "@cieav/core/reality";
import {CieavRealityApi} from "./reality-api.js";
import {CieavProofApi} from "./proof-api.js";
import {MemoryReceiptStore} from "./store/memory.js";

const secret="P".repeat(64),deviceId="dev_123456789012345678901234";
describe("CIEAV durable proof settlement",()=>{
  it("keeps agent self-report open and resolves only after required trusted attestation",async()=>{
    const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-proof-api-")),reality=new CieavRealityApi(path.join(dir,"reality.json"),secret),receipts=new MemoryReceiptStore(),proofs=new CieavProofApi(path.join(dir,"proof.json"),secret,reality,receipts);
    const intent=createIntentContract({owner:{id:"person-1",kind:"HUMAN"},goal:"Receive the promised refund",constraints:{allowedActionTypes:[],deniedActionTypes:[],allowedTargets:[],deniedTargets:[],maxRisk:"HIGH",allowedDataCategories:["NONE"],allowExternalRecipients:false,maxDelegationDepth:0,requireIndependentVerification:true},completionCriteria:["Refund is confirmed"]});
    await reality.store.saveIntent(deviceId,intent);
    const loop=await reality.store.saveLoop(deviceId,{id:"22222222-2222-4222-8222-222222222222",intentId:intent.id,owner:intent.owner,expectedOutcome:"Refund is confirmed",status:"OPEN",createdAt:new Date().toISOString()});
    const proof=await proofs.create(deviceId,{intentId:intent.id,openLoopId:loop.id,plan:{expectedState:["Refund is confirmed"],requirements:[{kind:"HUMAN_ATTESTATION",required:true,minConfidence:.8}]}});
    const agent=await proofs.observe(deviceId,proof.id,{kind:"HUMAN_ATTESTATION",signal:"SUPPORTS",summary:"Agent says the refund arrived",confidence:.99},"AGENT_REPORT");
    expect(agent.proof.assessment.status).toBe("PENDING");expect(agent.openLoop?.status).toBe("WAITING");
    const human=await proofs.observe(deviceId,proof.id,{kind:"HUMAN_ATTESTATION",signal:"SUPPORTS",summary:"User verified the refund in their account",confidence:1},"HUMAN_ATTESTATION");
    expect(human.proof.assessment.status).toBe("PROVEN");expect(human.openLoop?.status).toBe("RESOLVED");expect(human.openLoop?.resolution).toMatch(/Proof Mesh settled/);
    await proofs.store.close();await reality.store.close();await receipts.close();
  });
});
