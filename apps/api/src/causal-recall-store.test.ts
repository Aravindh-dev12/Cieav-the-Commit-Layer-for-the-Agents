import crypto from "node:crypto";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach,describe,expect,it} from "vitest";
import {createConsequenceSettlement,makeCausalProvenanceLink,makeCausalRecallEvent} from "@cieav/core";
import {CieavCausalRecallStore} from "./causal-recall-store.js";

const roots:string[]=[];
async function location(){const root=await mkdtemp(path.join(os.tmpdir(),"cieav-recall-"));roots.push(root);return{file:path.join(root,"recall.json"),secret:"r".repeat(48)}}
afterEach(async()=>{while(roots.length)await rm(roots.pop()!,{recursive:true,force:true})});

describe("CIEAV causal recall durable store",()=>{
  it("persists provenance, recall closure, and future blocking across restart",async()=>{
    const {file,secret}=await location(),paid=crypto.randomUUID(),followup=crypto.randomUUID(),first=new CieavCausalRecallStore(file,secret),at=new Date("2026-08-30T18:00:00.000Z");
    await first.addLink(makeCausalProvenanceLink({sourceRef:"evidence:vendor-bank",consequenceRef:paid,kind:"EVIDENCE",createdAt:at}));
    await first.addLink(makeCausalProvenanceLink({sourceRef:`consequence:${paid}`,consequenceRef:followup,kind:"PREDECESSOR",upstreamConsequenceRefs:[paid],createdAt:at}));
    const event=makeCausalRecallEvent({reasonClass:"EVIDENCE_INVALIDATED",invalidatedRefs:["evidence:vendor-bank"],reason:"Vendor bank evidence was compromised.",evidenceRefs:["incident:phishing"],discoveredAt:at});
    const paidSettlement=createConsequenceSettlement({consequenceRef:paid,executionState:"COMPLETED",realityState:"OBSERVED_SUCCESS",legitimacyState:"VALID",evidenceState:"VERIFIED",recoveryState:"NOT_REQUIRED",at}),followupSettlement=createConsequenceSettlement({consequenceRef:followup,executionState:"NOT_DISPATCHED",realityState:"UNKNOWN",legitimacyState:"UNKNOWN_VALIDITY",evidenceState:"RESERVED",recoveryState:"NOT_REQUIRED",at});
    const recorded=await first.recordRecall(event,[paidSettlement,followupSettlement],[{consequenceRef:paid,disposition:"COMPENSATE",proposedEffectRefs:["effect:recover-payment"],evidenceRefs:[],authority:false}],at);
    expect(recorded.closure.directlyAffectedConsequenceRefs).toEqual([paid]);
    expect(recorded.closure.futureConsequencesToBlock).toEqual([followup]);
    await expect(first.assertConsequenceNotRecallBlocked(followup)).rejects.toThrow("consequence_blocked_by_causal_recall");
    await first.close();
    const reopened=new CieavCausalRecallStore(file,secret);expect((await reopened.listLinks())).toHaveLength(2);expect((await reopened.listEvents())).toHaveLength(1);expect((await reopened.listClosures())).toHaveLength(1);await expect(reopened.assertConsequenceNotRecallBlocked(followup)).rejects.toThrow("consequence_blocked_by_causal_recall");await reopened.close();
  });

  it("deduplicates the same causal provenance basis",async()=>{
    const {file,secret}=await location(),consequenceRef=crypto.randomUUID(),store=new CieavCausalRecallStore(file,secret),at=new Date("2026-08-30T18:00:00.000Z"),first=makeCausalProvenanceLink({sourceRef:"tool:bank:v1",consequenceRef,kind:"TOOL",createdAt:at}),second={...first,id:crypto.randomUUID()};
    expect((await store.addLink(first)).basisDigest).toBe((await store.addLink(second)).basisDigest);expect((await store.listLinks())).toHaveLength(1);await store.close();
  });

  it("fails closed when authenticated recall state is tampered",async()=>{
    const {file,secret}=await location(),store=new CieavCausalRecallStore(file,secret);await store.addLink(makeCausalProvenanceLink({sourceRef:"policy:prod",consequenceRef:crypto.randomUUID(),kind:"POLICY"}));await store.close();
    const parsed=JSON.parse(await readFile(file,"utf8"));parsed.payload.links[0].sourceRef="policy:attacker";await writeFile(file,JSON.stringify(parsed));
    const reopened=new CieavCausalRecallStore(file,secret);await expect(reopened.listLinks()).rejects.toThrow("unreadable, corrupt, or unauthenticated");
  });
});
