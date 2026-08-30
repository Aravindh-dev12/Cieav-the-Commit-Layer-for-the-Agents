import crypto from "node:crypto";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach,describe,expect,it} from "vitest";
import type {ExecutionProposal} from "@cieav/contracts";
import {materializeExecutionProposal} from "@cieav/core/consequence-algebra";
import {CieavConsequenceAlgebraStore} from "./consequence-algebra-store.js";

const dirs:string[]=[];
const h=(c:string)=>c.repeat(64);

async function store(){
  const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-algebra-"));dirs.push(dir);
  return{dir,file:path.join(dir,"state.json"),store:new CieavConsequenceAlgebraStore(path.join(dir,"state.json"),"s".repeat(64))};
}

function proposal(target="resource://one",overrides:Partial<ExecutionProposal>={}):ExecutionProposal{
  return{
    id:crypto.randomUUID(),version:1,taskId:crypto.randomUUID(),intentId:crypto.randomUUID(),scopeDeviceId:"device-0001",subjectId:"agent-1",
    identityAttestationId:crypto.randomUUID(),credentialLeaseId:crypto.randomUUID(),toolId:"http",protocol:"HTTP",operation:"PATCH",target,risk:"HIGH",
    normalizedArgumentsDigest:h("a"),semanticEffect:{kind:"UPDATE",target,attributes:{value:"x"}},
    realityWitness:{version:1,observedAt:new Date().toISOString(),facts:[{key:"state",valueDigest:h("b"),source:"api",observedAt:new Date().toISOString()}],digest:h("c")},
    expectedPostStateDigest:h("d"),proofObligationDigest:h("e"),attenuationWitnessIds:[],createdAt:new Date().toISOString(),...overrides
  };
}

afterEach(async()=>{await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})))});

describe("CieavConsequenceAlgebraStore",()=>{
  it("persists an admitted reservation across restart",async()=>{
    const x=await store(),m=materializeExecutionProposal(proposal());
    const first=await x.store.admit(m,{proofProviders:[{ref:"proof:http",versionDigest:h("f")}],requireProofability:true});
    expect(first.admission.decision).toBe("ADMIT");await x.store.close();
    const reopened=new CieavConsequenceAlgebraStore(x.file,"s".repeat(64));
    expect((await reopened.listReservations())[0]?.state).toBe("RESERVED");await reopened.ensureAdmitted(m.id);
  });

  it("fails closed on tampered persisted state",async()=>{
    const x=await store(),m=materializeExecutionProposal(proposal());await x.store.admit(m,{});await x.store.close();
    const raw=await readFile(x.file,"utf8");await writeFile(x.file,raw.replace("RESERVED","RELEASED"));
    const reopened=new CieavConsequenceAlgebraStore(x.file,"s".repeat(64));await expect(reopened.listNodes()).rejects.toThrow(/unauthenticated/);
  });

  it("prevents a cross-route duplicate while the first effect is observing",async()=>{
    const x=await store(),a=materializeExecutionProposal(proposal()),b=materializeExecutionProposal(proposal("resource://one",{id:crypto.randomUUID(),protocol:"BROWSER",toolId:"browser",operation:"CLICK"}));
    await x.store.admit(a,{});await x.store.mark(a.id,"OBSERVING");
    const result=await x.store.admit(b,{});expect(result.admission.decision).toBe("RECONCILE");expect(result.node.state).toBe("MATERIALIZED");expect(result.node.authority).toBe(false);expect(result.node.reservationId).toBeUndefined();
  });

  it("keeps UNKNOWN reservations quarantined until explicit trusted reconciliation",async()=>{
    const x=await store(),m=materializeExecutionProposal(proposal());await x.store.admit(m,{});await x.store.mark(m.id,"SETTLED_UNKNOWN");
    await expect(x.store.ensureAdmitted(m.id)).rejects.toThrow(/not_admitted/);await expect(x.store.mark(m.id,"SETTLED_SUCCESS")).rejects.toThrow(/requires_reconciliation/);
    const settled=await x.store.reconcileUnknown(m.id,"SUCCESS",["proof:readback"],h("9"));expect(settled.state).toBe("SETTLED_SUCCESS");expect((await x.store.listReservations())[0]?.state).toBe("RELEASED");
  });

  it("persists relation-aware Reality Quarantine Closure topology across restart",async()=>{
    const x=await store(),rootIntent=crypto.randomUUID();
    const source=materializeExecutionProposal(proposal("resource://shared",{intentId:rootIntent,semanticEffect:{kind:"UPDATE",target:"resource://shared",attributes:{value:"source"}}}));
    await x.store.admit(source,{});await x.store.mark(source.id,"COMMITTED");await x.store.mark(source.id,"DISPATCHED");await x.store.mark(source.id,"SETTLED_UNKNOWN");
    const equivalent=materializeExecutionProposal(proposal("resource://shared",{id:crypto.randomUUID(),intentId:rootIntent,protocol:"BROWSER",toolId:"browser",operation:"CLICK",semanticEffect:{kind:"UPDATE",target:"resource://shared",attributes:{value:"source"}}}));
    const conflicting=materializeExecutionProposal(proposal("resource://shared",{id:crypto.randomUUID(),intentId:rootIntent,semanticEffect:{kind:"UPDATE",target:"resource://shared",attributes:{value:"different"}}}));
    const independent=materializeExecutionProposal(proposal("resource://independent",{id:crypto.randomUUID(),intentId:rootIntent,semanticEffect:{kind:"UPDATE",target:"resource://independent",attributes:{value:"independent"}}}));
    expect((await x.store.admit(equivalent,{})).admission.decision).toBe("RECONCILE");expect((await x.store.admit(conflicting,{})).admission.decision).toBe("COORDINATE");expect((await x.store.admit(independent,{})).admission.decision).toBe("ADMIT");
    const closure=await x.store.getQuarantineClosure(source.id);expect(closure?.status).toBe("OPEN");expect(closure?.sourceState).toBe("SETTLED_UNKNOWN");expect(closure?.reconcileCandidateRefs).toContain(equivalent.id);expect(closure?.blockerConsequenceRefs).toContain(conflicting.id);expect(closure?.allowedIndependentConsequenceRefs).toContain(independent.id);expect(closure?.affectedConsequenceRefs).not.toContain(independent.id);expect(closure?.waiterConsequenceRefs).toEqual(expect.arrayContaining([equivalent.id,conflicting.id]));expect(closure?.authority).toBe(false);expect(closure?.mayMintExecutionAuthority).toBe(false);const digest=closure!.closureDigest;
    await x.store.close();const reopened=new CieavConsequenceAlgebraStore(x.file,"s".repeat(64));const recovered=await reopened.recoverOnStartup();expect(recovered.stats.openQuarantineClosures).toBe(1);const persisted=await reopened.getQuarantineClosure(source.id);expect(persisted?.status).toBe("OPEN");expect(persisted?.closureDigest).toBe(digest);expect((await reopened.stats()).openQuarantineClosures).toBe(1);
  });

  it("closes Reality Quarantine Closure only through trusted UNKNOWN reconciliation",async()=>{
    const x=await store(),source=materializeExecutionProposal(proposal("resource://shared"));await x.store.admit(source,{});await x.store.mark(source.id,"QUARANTINED");
    const waiter=materializeExecutionProposal(proposal("resource://shared",{id:crypto.randomUUID(),semanticEffect:{kind:"UPDATE",target:"resource://shared",attributes:{value:"different"}}}));expect((await x.store.admit(waiter,{})).admission.decision).toBe("COORDINATE");const opened=await x.store.getQuarantineClosure(source.id);expect(opened?.status).toBe("OPEN");expect(opened?.affectedConsequenceRefs).toContain(waiter.id);
    await expect(x.store.mark(source.id,"SETTLED_SUCCESS")).rejects.toThrow(/requires_reconciliation/);const settled=await x.store.reconcileUnknown(source.id,"FAILURE",["proof:provider-negative"],h("8"));expect(settled.state).toBe("SETTLED_FAILURE");const closed=await x.store.getQuarantineClosure(source.id);expect(closed?.status).toBe("CLOSED");expect(closed?.resolution).toBe("FAILURE");expect(closed?.closedAt).toBeDefined();expect((await x.store.stats()).openQuarantineClosures).toBe(0);const reconsidered=await x.store.reconsiderWaiting(waiter.id,{});expect(reconsidered.admission.decision).toBe("ADMIT");expect(reconsidered.node.state).toBe("RESERVED");
  });

  it("keeps UNKNOWN aggregate budget overage as a durable waiter until reconciliation",async()=>{
    const x=await store(),rootIntent=crypto.randomUUID(),policy=await x.store.getPolicy();await x.store.putPolicy({...policy,defaultAggregationLimits:{"money:USD":15}});
    const source=materializeExecutionProposal(proposal("acct:one",{intentId:rootIntent,semanticEffect:{kind:"TRANSFER_VALUE",target:"acct:one",amount:{currency:"USD",value:10},attributes:{invoice:"one"}}}));
    const candidate=materializeExecutionProposal(proposal("acct:two",{id:crypto.randomUUID(),intentId:rootIntent,semanticEffect:{kind:"TRANSFER_VALUE",target:"acct:two",amount:{currency:"USD",value:6},attributes:{invoice:"two"}}}));
    expect((await x.store.admit(source,{})).admission.decision).toBe("ADMIT");await x.store.mark(source.id,"COMMITTED");await x.store.mark(source.id,"DISPATCHED");await x.store.mark(source.id,"SETTLED_UNKNOWN");
    const waiting=await x.store.admit(candidate,{});expect(waiting.admission.decision).toBe("COORDINATE");expect(waiting.node.state).toBe("MATERIALIZED");expect(waiting.node.reservationId).toBeUndefined();expect(waiting.admission.coordinationPlan?.blockerConsequenceRefs).toContain(source.id);expect(waiting.admission.coordinationPlan?.aggregationConsequenceRefs).toContain(source.id);
    const closure=await x.store.getQuarantineClosure(source.id);expect(closure?.status).toBe("OPEN");expect(closure?.affectedConsequenceRefs).toContain(candidate.id);expect(closure?.waiterConsequenceRefs).toContain(candidate.id);expect(closure?.relationSnapshot.find(entry=>entry.consequenceRef===candidate.id)?.disposition).toBe("AGGREGATE");
    await x.store.reconcileUnknown(source.id,"FAILURE",["proof:provider-negative"],h("7"));const reconsidered=await x.store.reconsiderWaiting(candidate.id,{});expect(reconsidered.admission.decision).toBe("ADMIT");expect(reconsidered.node.state).toBe("RESERVED");expect(reconsidered.node.reservationId).toBeDefined();
  });

  it("keeps aggregate budget blocked when UNKNOWN reconciles to observed success",async()=>{
    const x=await store(),rootIntent=crypto.randomUUID(),policy=await x.store.getPolicy();await x.store.putPolicy({...policy,defaultAggregationLimits:{"money:USD":15}});
    const source=materializeExecutionProposal(proposal("acct:one",{intentId:rootIntent,semanticEffect:{kind:"TRANSFER_VALUE",target:"acct:one",amount:{currency:"USD",value:10},attributes:{invoice:"one"}}}));
    const candidate=materializeExecutionProposal(proposal("acct:two",{id:crypto.randomUUID(),intentId:rootIntent,semanticEffect:{kind:"TRANSFER_VALUE",target:"acct:two",amount:{currency:"USD",value:6},attributes:{invoice:"two"}}}));
    expect((await x.store.admit(source,{})).admission.decision).toBe("ADMIT");await x.store.mark(source.id,"COMMITTED");await x.store.mark(source.id,"DISPATCHED");await x.store.mark(source.id,"SETTLED_UNKNOWN");
    const waiting=await x.store.admit(candidate,{});expect(waiting.admission.decision).toBe("COORDINATE");expect(waiting.node.state).toBe("MATERIALIZED");
    await x.store.reconcileUnknown(source.id,"SUCCESS",["proof:provider-readback"],h("6"));expect((await x.store.listAggregation()).filter(entry=>entry.consequenceRef===source.id)).toHaveLength(1);
    const reconsidered=await x.store.reconsiderWaiting(candidate.id,{});expect(reconsidered.admission.decision).toBe("BLOCK");expect(reconsidered.node.state).toBe("CANCELLED");expect(reconsidered.node.reservationId).toBeUndefined();expect((await x.store.getQuarantineClosure(source.id))?.resolution).toBe("SUCCESS");
  });

  it("enforces a causal fence until predecessor proof closes",async()=>{
    const x=await store(),a=materializeExecutionProposal(proposal("resource://a")),b=materializeExecutionProposal(proposal("resource://b"));
    await x.store.admit(a,{});await x.store.mark(a.id,"OBSERVING");await x.store.admit(b,{});await x.store.addFence(b,[a.id],["SUCCESS"]);
    await expect(x.store.assertFencesSatisfied(b.id)).rejects.toThrow(/not_satisfied/);await x.store.mark(a.id,"SETTLED_SUCCESS");await expect(x.store.assertFencesSatisfied(b.id)).resolves.toBe(true);
  });

  it("persists zero-authority policy and trusted relation/invariant rules with hash-chained audit",async()=>{
    const x=await store(),policy=await x.store.getPolicy();
    await x.store.putPolicy({...policy,proofabilityRisks:["HIGH","CRITICAL"],defaultAggregationLimits:{"money:USD":100}});
    await x.store.putRelationRule({id:crypto.randomUUID(),version:"CIEAV_CONSEQUENCE_RELATION_RULE_V1",enabled:true,priority:10,leftEffectClass:"UPDATE",rightEffectClass:"UPDATE",relation:"COMMUTES",bidirectional:true,evidenceRefs:["policy:domain"],reason:"qualified domain commutativity",authority:false});
    await x.store.putInvariantRule({id:crypto.randomUUID(),version:"CIEAV_CONSEQUENCE_INVARIANT_RULE_V1",enabled:true,kind:"MAX_ACTIVE_MATCHES",selector:{effectClasses:["UPDATE"],realityRefPrefixes:[],principalRefs:[]},maxActive:2,evidenceRefs:["policy:limit"],reason:"two active updates maximum",authority:false});
    expect((await x.store.getPolicy()).mayMintExecutionAuthority).toBe(false);expect(await x.store.listRelationRules()).toHaveLength(1);expect(await x.store.listInvariantRules()).toHaveLength(1);
    const audit=(await x.store.listAudit()).slice().reverse();expect(audit.length).toBeGreaterThanOrEqual(3);for(let i=1;i<audit.length;i++)expect(audit[i]!.previousHash).toBe(audit[i-1]!.eventHash);
  });

  it("requires and revalidates proof plan reservations for protected risks",async()=>{
    const x=await store(),policy=await x.store.getPolicy();await x.store.putPolicy({...policy,proofabilityRisks:["HIGH","CRITICAL"]});
    const m=materializeExecutionProposal(proposal());expect((await x.store.admit(m,{proofProviders:[{ref:"proof:http"}]})).admission.proofPlanReservation).toBeDefined();await expect(x.store.assertProofPlanValid(m.id)).resolves.toBe(true);
  });

  it("performs startup recovery and refuses impossible active reservation state",async()=>{
    const x=await store(),m=materializeExecutionProposal(proposal());await x.store.admit(m,{});await x.store.mark(m.id,"COMMITTED");
    expect((await x.store.recoverOnStartup()).recovered).toBe(true);expect((await x.store.listAudit())[0]?.type).toBe("RECOVERY");
  });

  it("persists coordination waiters across restart without minting or reserving authority",async()=>{
    const x=await store();
    const a=materializeExecutionProposal(proposal("resource://shared"));
    const bProposal=proposal("resource://shared",{semanticEffect:{kind:"UPDATE",target:"resource://shared",attributes:{value:"different"}}});
    const b=materializeExecutionProposal(bProposal);
    expect((await x.store.admit(a,{})).admission.decision).toBe("ADMIT");
    const waiting=await x.store.admit(b,{});expect(waiting.admission.decision).toBe("COORDINATE");expect(waiting.node.state).toBe("MATERIALIZED");expect(waiting.node.authority).toBe(false);expect(waiting.node.reservationId).toBeUndefined();expect(waiting.node.coordinationPlan?.blockerConsequenceRefs).toContain(a.id);
    expect((await x.store.stats()).waiting).toBe(1);expect((await x.store.stats()).authorityRelevant).toBe(1);expect(await x.store.listReservations()).toHaveLength(1);
    await x.store.close();
    const reopened=new CieavConsequenceAlgebraStore(x.file,"s".repeat(64));const recovered=await reopened.recoverOnStartup();expect(recovered.stats.waiting).toBe(1);expect(recovered.stats.authorityRelevant).toBe(1);
    const persisted=await reopened.getNode(b.id);expect(persisted?.state).toBe("MATERIALIZED");expect(persisted?.reservationId).toBeUndefined();await expect(reopened.ensureAdmitted(b.id)).rejects.toThrow(/not_admitted:MATERIALIZED/);
  });

  it("excludes waiting consequences from cumulative budget authority math",async()=>{
    const x=await store(),rootIntent=crypto.randomUUID(),policy=await x.store.getPolicy();await x.store.putPolicy({...policy,defaultAggregationLimits:{"money:USD":15}});
    const a=materializeExecutionProposal(proposal("resource://shared",{intentId:rootIntent,semanticEffect:{kind:"UPDATE",target:"resource://shared",amount:{currency:"USD",value:10},attributes:{value:"a"}}}));
    const b=materializeExecutionProposal(proposal("resource://shared",{intentId:rootIntent,semanticEffect:{kind:"UPDATE",target:"resource://shared",amount:{currency:"USD",value:10},attributes:{value:"b"}}}));
    const c=materializeExecutionProposal(proposal("resource://independent",{intentId:rootIntent,semanticEffect:{kind:"UPDATE",target:"resource://independent",amount:{currency:"USD",value:5},attributes:{value:"c"}}}));
    expect((await x.store.admit(a,{})).admission.decision).toBe("ADMIT");expect((await x.store.admit(b,{})).admission.decision).toBe("COORDINATE");
    const third=await x.store.admit(c,{});expect(third.admission.decision).toBe("ADMIT");expect(third.node.state).toBe("RESERVED");expect(await x.store.listReservations()).toHaveLength(2);
  });

  it("re-admits a waiter against current graph state after its blocker settles",async()=>{
    const x=await store(),a=materializeExecutionProposal(proposal("resource://shared")),b=materializeExecutionProposal(proposal("resource://shared",{semanticEffect:{kind:"UPDATE",target:"resource://shared",attributes:{value:"b"}}}));
    await x.store.admit(a,{});const first=await x.store.admit(b,{});expect(first.admission.decision).toBe("COORDINATE");
    await x.store.mark(a.id,"SETTLED_SUCCESS");const reconsidered=await x.store.reconsiderWaiting(b.id,{});expect(reconsidered.reconsidered).toBe(true);expect(reconsidered.admission.decision).toBe("ADMIT");expect(reconsidered.node.state).toBe("RESERVED");expect(reconsidered.node.reservationId).toBeDefined();await x.store.ensureAdmitted(b.id);
  });

  it("reconsideration is idempotent while the same blocker remains active",async()=>{
    const x=await store(),a=materializeExecutionProposal(proposal("resource://shared")),b=materializeExecutionProposal(proposal("resource://shared",{semanticEffect:{kind:"UPDATE",target:"resource://shared",attributes:{value:"b"}}}));
    await x.store.admit(a,{});await x.store.admit(b,{});const reservationsBefore=(await x.store.listReservations()).length,auditBefore=(await x.store.listAudit()).length;
    const once=await x.store.reconsiderWaiting(b.id,{}),twice=await x.store.reconsiderWaiting(b.id,{});expect(once.reconsidered).toBe(false);expect(twice.reconsidered).toBe(false);expect(once.admission.decision).toBe("COORDINATE");expect(twice.admission.decision).toBe("COORDINATE");expect(await x.store.listReservations()).toHaveLength(reservationsBefore);expect(await x.store.listAudit()).toHaveLength(auditBefore);
  });

  it("never lets task settlement turn an unexecuted waiter into observed success",async()=>{
    const x=await store(),a=materializeExecutionProposal(proposal("resource://shared")),bProposal=proposal("resource://shared",{semanticEffect:{kind:"UPDATE",target:"resource://shared",attributes:{value:"b"}}}),b=materializeExecutionProposal(bProposal);
    await x.store.admit(a,{});await x.store.admit(b,{});expect((await x.store.getNode(b.id))?.state).toBe("MATERIALIZED");
    expect(await x.store.markTask(bProposal.taskId,"SETTLED_SUCCESS")).toHaveLength(0);expect((await x.store.getNode(b.id))?.state).toBe("MATERIALIZED");expect((await x.store.listAggregation()).some(entry=>entry.consequenceRef===b.id)).toBe(false);
  });
});