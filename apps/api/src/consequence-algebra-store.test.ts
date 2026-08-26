import crypto from "node:crypto";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach,describe,expect,it} from "vitest";
import type {ExecutionProposal} from "@cieav/contracts";
import {materializeExecutionProposal} from "@cieav/core/consequence-algebra";
import {CieavConsequenceAlgebraStore} from "./consequence-algebra-store.js";

const dirs:string[]=[];const h=(c:string)=>c.repeat(64);
async function store(){const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-algebra-"));dirs.push(dir);return{dir,file:path.join(dir,"state.json"),store:new CieavConsequenceAlgebraStore(path.join(dir,"state.json"),"s".repeat(64))}}
function proposal(target="resource://one",overrides:Partial<ExecutionProposal>={}):ExecutionProposal{return{id:crypto.randomUUID(),version:1,taskId:crypto.randomUUID(),intentId:crypto.randomUUID(),scopeDeviceId:"device-0001",subjectId:"agent-1",identityAttestationId:crypto.randomUUID(),credentialLeaseId:crypto.randomUUID(),toolId:"http",protocol:"HTTP",operation:"PATCH",target,risk:"HIGH",normalizedArgumentsDigest:h("a"),semanticEffect:{kind:"UPDATE",target,attributes:{value:"x"}},realityWitness:{version:1,observedAt:new Date().toISOString(),facts:[{key:"state",valueDigest:h("b"),source:"api",observedAt:new Date().toISOString()}],digest:h("c")},expectedPostStateDigest:h("d"),proofObligationDigest:h("e"),attenuationWitnessIds:[],createdAt:new Date().toISOString(),...overrides}}
afterEach(async()=>{await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})))});

describe("CieavConsequenceAlgebraStore",()=>{
  it("persists an admitted reservation across restart",async()=>{const x=await store(),m=materializeExecutionProposal(proposal());const first=await x.store.admit(m,{proofProviders:[{ref:"proof:http",versionDigest:h("f")}],requireProofability:true});expect(first.admission.decision).toBe("ADMIT");await x.store.close();const reopened=new CieavConsequenceAlgebraStore(x.file,"s".repeat(64));expect((await reopened.listReservations())[0]?.state).toBe("RESERVED");await reopened.ensureAdmitted(m.id)});
  it("fails closed on tampered persisted state",async()=>{const x=await store(),m=materializeExecutionProposal(proposal());await x.store.admit(m,{});await x.store.close();const raw=await readFile(x.file,"utf8");await writeFile(x.file,raw.replace("RESERVED","RELEASED"));const reopened=new CieavConsequenceAlgebraStore(x.file,"s".repeat(64));await expect(reopened.listNodes()).rejects.toThrow(/unauthenticated/)});
  it("prevents a cross-route duplicate while the first effect is observing",async()=>{const x=await store(),a=materializeExecutionProposal(proposal()),b=materializeExecutionProposal(proposal("resource://one",{id:crypto.randomUUID(),protocol:"BROWSER",toolId:"browser",operation:"CLICK"}));await x.store.admit(a,{});await x.store.mark(a.id,"OBSERVING");const result=await x.store.admit(b,{});expect(result.admission.decision).toBe("RECONCILE")});
  it("keeps UNKNOWN reservations quarantined and non-routable",async()=>{const x=await store(),m=materializeExecutionProposal(proposal());await x.store.admit(m,{});await x.store.mark(m.id,"SETTLED_UNKNOWN");await expect(x.store.ensureAdmitted(m.id)).rejects.toThrow(/not_admitted/);expect((await x.store.listReservations())[0]?.state).toBe("QUARANTINED")});
  it("enforces a causal fence until predecessor proof closes",async()=>{const x=await store(),a=materializeExecutionProposal(proposal("resource://a")),b=materializeExecutionProposal(proposal("resource://b"));await x.store.admit(a,{});await x.store.mark(a.id,"OBSERVING");await x.store.admit(b,{});await x.store.addFence(b,[a.id],["SUCCESS"]);await expect(x.store.assertFencesSatisfied(b.id)).rejects.toThrow(/not_satisfied/);await x.store.mark(a.id,"SETTLED_SUCCESS");await expect(x.store.assertFencesSatisfied(b.id)).resolves.toBe(true)});
});
