import {Readable} from "node:stream";
import {mkdtemp} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {describe,expect,it} from "vitest";
import {CieavRealityApi} from "./reality-api.js";

const secret="L".repeat(64),device="device-action-lab";
function req(body:unknown){const stream=Readable.from([Buffer.from(JSON.stringify(body))]) as any;stream.method="POST";return stream}
const manifest={requestId:"lab-request-12345678",actionType:"financial.payment",summary:"Pay vendor",actor:"Lab user",recipients:[],dataCategories:["NONE"],effects:["Transfer funds"],reversibility:"COMPENSABLE" as const,undo:{kind:"NONE" as const},risk:"HIGH" as const,confidence:.9,modelUsed:false,warnings:[],evidence:["simulation"],policyVersion:"lab"};

describe("CIEAV Action Lab",()=>{
  it("evaluates the real authority path without minting permits or approval challenges",async()=>{const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-lab-")),api=new CieavRealityApi(path.join(dir,"reality.json"),secret),intent=await api.store.saveIntent(device,{id:crypto.randomUUID(),owner:{id:"human-1",kind:"HUMAN"},goal:"Pay approved vendors",createdAt:new Date().toISOString(),status:"ACTIVE",constraints:{allowedActionTypes:["financial.payment"],deniedActionTypes:[],allowedTargets:[],deniedTargets:[],maxRisk:"HIGH",allowedDataCategories:["NONE"],allowExternalRecipients:false,maxDelegationDepth:1,requireIndependentVerification:true,humanApprovalAtOrAbove:"HIGH"},completionCriteria:["Payment independently verified"],contextLabels:{}});const before=(await api.store.listApprovalsPrivileged()).length,result=await api.handle(req({intentId:intent.id,actor:{id:"human-1",kind:"HUMAN"},manifest}),"/v1/reality/lab/evaluate",device),after=(await api.store.listApprovalsPrivileged()).length;expect(result?.status).toBe(200);const body=result?.body as any;expect(body.simulation).toBe(true);expect(body.sideEffects).toBe(false);expect(body.wouldDecision).toBe("ASK");expect(body.permitIssued).toBe(false);expect(body.approvalCreated).toBe(false);expect(body.permit).toBeUndefined();expect(body.approval).toBeUndefined();expect(after).toBe(before);await api.store.close()})
});
