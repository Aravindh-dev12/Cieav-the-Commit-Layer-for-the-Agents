import crypto from "node:crypto";
import {mkdtemp,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach,describe,expect,it} from "vitest";
import type {ExecutionProposal} from "@cieav/contracts";
import {CieavConsequenceAlgebraStore} from "./consequence-algebra-store.js";
import {CieavConsequenceAlgebraTool} from "./consequence-algebra-tool.js";

const dirs:string[]=[];const h=(c:string)=>c.repeat(64);
function proposal(target="resource://one",overrides:Partial<ExecutionProposal>={}):ExecutionProposal{return{id:crypto.randomUUID(),version:1,taskId:crypto.randomUUID(),intentId:crypto.randomUUID(),scopeDeviceId:"device-0001",subjectId:"agent-1",identityAttestationId:crypto.randomUUID(),credentialLeaseId:crypto.randomUUID(),toolId:"http",protocol:"HTTP",operation:"PATCH",target,risk:"HIGH",normalizedArgumentsDigest:h("a"),semanticEffect:{kind:"UPDATE",target,attributes:{value:"x"}},realityWitness:{version:1,observedAt:new Date().toISOString(),facts:[{key:"state",valueDigest:h("b"),source:"api",observedAt:new Date().toISOString()}],digest:h("c")},expectedPostStateDigest:h("d"),proofObligationDigest:h("e"),attenuationWitnessIds:[],createdAt:new Date().toISOString(),...overrides}}
async function tool(){const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-algebra-tool-"));dirs.push(dir);return new CieavConsequenceAlgebraTool(new CieavConsequenceAlgebraStore(path.join(dir,"state.json"),"t".repeat(64)))}
afterEach(async()=>{await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})))});

describe("CieavConsequenceAlgebraTool",()=>{
  it("evaluates an execution proposal without minting authority",async()=>{const x=await tool(),p=proposal(),r=await x.evaluateExecutionProposal(p);expect(r.admission.decision).toBe("ADMIT");expect(r.authority).toBe(false);expect(r.executionAuthorityIssued).toBe(false);const ready=await x.assertReadyForAuthority(p.id);expect(ready.readyForAuthority).toBe(true);expect(ready.authority).toBe(false)});
  it("tracks dispatch through proof settlement and releases a successful reservation",async()=>{const x=await tool(),p=proposal();await x.evaluateExecutionProposal(p);await x.markAuthorized(p.id);await x.markCommitted(p.id);await x.markDispatched(p.id);await x.markObserving(p.id);await x.settle(p.id,"SUCCESS");const rt=await x.runtime();expect(rt.nodes[0]?.state).toBe("SETTLED_SUCCESS");expect(rt.reservations[0]?.state).toBe("RELEASED");expect(rt.authority).toBe(false)});
  it("keeps UNKNOWN as a quarantined active consequence",async()=>{const x=await tool(),p=proposal();await x.evaluateExecutionProposal(p);await x.markObserving(p.id);await x.settle(p.id,"UNKNOWN");const rt=await x.runtime();expect(rt.nodes[0]?.state).toBe("SETTLED_UNKNOWN");expect(rt.reservations[0]?.state).toBe("QUARANTINED");expect(rt.stats.quarantined).toBe(1)});
});
