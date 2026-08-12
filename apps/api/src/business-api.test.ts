import {describe,expect,it} from "vitest";
import {mkdtemp} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {createIntentContract} from "@latch/core/reality";
import {CieavRealityApi} from "./reality-api.js";
import {CieavBusinessApi} from "./business-api.js";

const secret="B".repeat(64),deviceId="dev_123456789012345678901234";
describe("CIEAV durable Company Twin",()=>{
  it("opens a loop for missing state, ignores agent self-report, and resolves on trusted state",async()=>{
    const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-business-api-")),reality=new CieavRealityApi(path.join(dir,"reality.json"),secret),business=new CieavBusinessApi(path.join(dir,"business.json"),secret,reality);
    const intent=createIntentContract({owner:{id:"company-admin",kind:"HUMAN"},goal:"Offboard employee completely",constraints:{allowedActionTypes:["access.revoke"],deniedActionTypes:[],allowedTargets:[],deniedTargets:[],maxRisk:"HIGH",allowedDataCategories:["ACCOUNT","WORK"],allowExternalRecipients:false,maxDelegationDepth:1,requireIndependentVerification:true},completionCriteria:["All access is absent"]});
    await reality.store.saveIntent(deviceId,intent);
    const record=await business.create(deviceId,{organizationId:"org-1",name:"Offboarding",intentId:intent.id,assertions:[{entity:{kind:"ACCOUNT",id:"employee-42"},field:"awsAccess",operator:"ABSENT",severity:"CRITICAL"}]});
    const loopId=Object.values(record.openLoops)[0];expect(record.reconciliation.missingEvidence).toBe(1);expect(loopId).toBeTruthy();expect((await reality.store.getLoop(deviceId,loopId!))?.status).toBe("WAITING");
    const agent=await business.addFact(deviceId,record.plan.id,{entity:{kind:"ACCOUNT",id:"employee-42"},field:"awsAccess",exists:false,source:"agent",confidence:1},"AGENT_REPORT");expect(agent.reconciliation.healthy).toBe(false);expect(agent.reconciliation.missingEvidence).toBe(1);
    const trusted=await business.addFact(deviceId,record.plan.id,{entity:{kind:"ACCOUNT",id:"employee-42"},field:"awsAccess",exists:false,source:"admin",confidence:1},"HUMAN_ATTESTATION");expect(trusted.reconciliation.healthy).toBe(true);expect((await reality.store.getLoop(deviceId,loopId!))?.status).toBe("RESOLVED");
    await business.store.close();await reality.store.close();
  });
});
