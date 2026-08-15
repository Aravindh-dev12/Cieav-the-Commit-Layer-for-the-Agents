import crypto from "node:crypto";
import {mkdtemp} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe,expect,it} from "vitest";
import {CieavRealityApi} from "./reality-api.js";
import {CieavRecoveryApi} from "./recovery-api.js";

const secret="R".repeat(64);
const manifest={requestId:"recovery-request-1234",actionType:"recovery.compensate",summary:"Compensate the failed operation",actor:"Recovery agent",recipients:[],dataCategories:["NONE"],effects:["Create compensating change"],reversibility:"COMPENSABLE" as const,undo:{kind:"NONE" as const},risk:"MEDIUM" as const,confidence:.95,modelUsed:false,warnings:[],evidence:["breached open loop"],policyVersion:"recovery-test"};
async function fixture(){const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-recovery-")),reality=new CieavRealityApi(path.join(dir,"reality.json"),secret),intent=await reality.store.saveIntent("device-12345678",{id:crypto.randomUUID(),owner:{id:"human-1",kind:"HUMAN"},goal:"Restore expected state",createdAt:new Date().toISOString(),status:"ACTIVE",constraints:{allowedActionTypes:["recovery.compensate"],deniedActionTypes:[],allowedTargets:[],deniedTargets:[],maxRisk:"HIGH",allowedDataCategories:["NONE"],allowExternalRecipients:false,maxDelegationDepth:1,requireIndependentVerification:true},completionCriteria:["Recovery independently verified"],contextLabels:{}}),loop=await reality.store.saveLoop("device-12345678",{id:crypto.randomUUID(),intentId:intent.id,owner:intent.owner,expectedOutcome:"Desired state restored",status:"BREACHED",createdAt:new Date().toISOString(),recovery:{kind:"COMPENSATE",safeToAutoExecute:false,steps:["Apply compensating operation"],reason:"Observed state contradicts expected state."}});return{reality,intent,loop,recovery:new CieavRecoveryApi(reality,secret)}}

describe("CIEAV governed recovery",()=>{
  it("routes compensation through ordinary authority and one-use permit semantics",async()=>{const f=await fixture(),result=await f.recovery.evaluate("device-12345678",{openLoopId:f.loop.id,actor:{id:"agent-1",kind:"AGENT"},manifest,delegationChain:[]});expect(result.authority.decision).toBe("ALLOW");expect(result.permit?.maxUses).toBe(1);expect(result.binding.proposal.effect.metadata.cieavRecoveryOpenLoopId).toBe(f.loop.id);expect(result.binding.recoveryKind).toBe("COMPENSATE");await f.reality.store.close()});
  it("refuses recovery for a loop that is not breached/recovering",async()=>{const f=await fixture();await f.reality.store.saveLoop("device-12345678",{...f.loop,status:"WAITING"});await expect(f.recovery.evaluate("device-12345678",{openLoopId:f.loop.id,actor:{id:"agent-1",kind:"AGENT"},manifest,delegationChain:[]})).rejects.toThrow(/recovery_requires_breached_open_loop/);await f.reality.store.close()});
  it("moves a committed recovery to RECOVERING without declaring settlement",async()=>{const f=await fixture(),result=await f.recovery.evaluate("device-12345678",{openLoopId:f.loop.id,actor:{id:"agent-1",kind:"AGENT"},manifest,delegationChain:[]});expect(result.permit).toBeTruthy();const committed=await f.reality.markRecoveryCommitted("device-12345678",result.binding.proposal);expect(committed?.status).toBe("RECOVERING");expect(committed?.resolution).toBeUndefined();await f.reality.store.close()});
});
