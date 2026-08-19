import {mkdtemp,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach,describe,expect,it} from "vitest";
import {CieavIntentRealityEngine,makeRealityWitness} from "./intent-reality-engine.js";

const dirs:string[]=[];
afterEach(async()=>{await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})))});
async function fixture(){const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-escrow-"));dirs.push(dir);return new CieavIntentRealityEngine(path.join(dir,"state.json"),"e".repeat(64))}
const intentId="33333333-3333-4333-8333-333333333333",taskId="77777777-7777-4777-8777-777777777777";
const effect={kind:"DELETE" as const,target:"repo/file.txt",objectRef:"blob-42",attributes:{surface:"filesystem"}};
const baseCommitment={id:"22222222-2222-4222-8222-222222222222",version:1 as const,intentId,owner:{id:"user-1",kind:"HUMAN" as const},actor:{id:"agent-1",kind:"AGENT" as const},authoritySource:"local",summary:"Delete file after reserving restore path",desiredState:"File deleted",createdAt:"2026-08-19T00:00:00.000Z",state:"AUTHORIZED" as const,risk:"HIGH" as const,consequenceGraph:{version:1 as const,nodes:[{id:"delete",kind:"DELETE" as const,summary:"Delete file",target:"repo/file.txt",affectedEntities:["blob-42"],dataCategories:["FILE"],risk:"HIGH" as const,reversibility:"REVERSIBLE" as const,external:false,dependsOn:[]}]},proofObligation:{version:1 as const,requirements:[{id:"fs-readback",kind:"FILESYSTEM" as const,description:"Verify file absence",required:true,minimumConfidence:.9,independentOfActor:true}],forbiddenShortcuts:["agent self-report"]},recovery:{kind:"UNDO" as const,requiresAuthorization:true,instructions:["Restore reserved snapshot"]},metadata:{}};
const pre=makeRealityWitness([{key:"repo/file.txt",value:{exists:true,hash:"before"},source:"filesystem"}]);
const post=makeRealityWitness([{key:"repo/file.txt",value:{exists:false},source:"filesystem"}]);

describe("CIEAV Reversibility Escrow",()=>{
  it("refuses an undoable consequential commit without a reserved inverse",async()=>{const engine=await fixture();await expect(engine.issueRealityBoundCommit({taskId,intentId,commitment:baseCommitment,proposal:{action:"delete"},effect,preState:pre,expectedPostState:post})).rejects.toThrow(/reversibility_escrow_required/)});
  it("binds an exact semantic effect to a reserved inverse and activates only after trusted settlement calls it",async()=>{const engine=await fixture();const escrow=await engine.reserveReversibilityEscrow({taskId,intentId,effect,inverseKind:"RESTORE_SNAPSHOT",inverseDescriptor:{restore:"blob-42"},preEffectSnapshot:{hash:"before",bytes:1234},inverseCapability:{tokenRef:"local-only"},reason:"Preserve a verified inverse before deleting the file."});expect(escrow.state).toBe("RESERVED");const commit=await engine.issueRealityBoundCommit({taskId,intentId,commitment:baseCommitment,proposal:{action:"delete"},effect,preState:pre,expectedPostState:post,reversibilityEscrowId:escrow.id});expect(commit.reversibilityEscrowId).toBe(escrow.id);const active=await engine.activateReversibilityEscrow(escrow.id);expect(active.state).toBe("ACTIVATED")});
  it("rejects an escrow reserved for a different effect",async()=>{const engine=await fixture();const other={...effect,objectRef:"blob-other"};const escrow=await engine.reserveReversibilityEscrow({taskId,intentId,effect:other,inverseKind:"RESTORE_SNAPSHOT",inverseDescriptor:{restore:"other"},preEffectSnapshot:{hash:"other"},reason:"other object"});await expect(engine.issueRealityBoundCommit({taskId,intentId,commitment:baseCommitment,proposal:{action:"delete"},effect,preState:pre,expectedPostState:post,reversibilityEscrowId:escrow.id})).rejects.toThrow(/invalid_reversibility_escrow/)});
});
