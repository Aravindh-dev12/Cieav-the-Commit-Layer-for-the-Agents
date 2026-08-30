import crypto from "node:crypto";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach,describe,expect,it} from "vitest";
import {CieavConsequenceSettlementStore} from "./consequence-settlement-store.js";

const roots:string[]=[];
async function store(){const root=await mkdtemp(path.join(os.tmpdir(),"cieav-settlement-"));roots.push(root);return{root,file:path.join(root,"settlement.json"),secret:"s".repeat(48)}}
afterEach(async()=>{while(roots.length)await rm(roots.pop()!,{recursive:true,force:true})});

describe("CIEAV consequence settlement durable store",()=>{
  it("persists physical success while later legitimacy becomes tainted",async()=>{
    const {file,secret}=await store(),consequenceRef=crypto.randomUUID(),first=new CieavConsequenceSettlementStore(file,secret);
    const initial=await first.create({consequenceRef,executionState:"COMPLETED",realityState:"OBSERVED_SUCCESS",legitimacyState:"VALID",evidenceState:"VERIFIED",recoveryState:"NOT_REQUIRED",evidenceRefs:["ledger:1"]});
    const changed=await first.update(consequenceRef,{legitimacyState:"CAUSALLY_TAINTED",evidenceState:"CONFLICTING",recoveryState:"REQUIRED",evidenceRefs:["incident:1"]},"Later source invalidation requires recovery.");
    expect(changed.settlement.realityState).toBe("OBSERVED_SUCCESS");expect(changed.settlement.legitimacyState).toBe("CAUSALLY_TAINTED");await first.close();
    const reopened=new CieavConsequenceSettlementStore(file,secret),latest=await reopened.get(consequenceRef),history=await reopened.history(consequenceRef),transitions=await reopened.transitions(consequenceRef);
    expect(latest?.realityState).toBe("OBSERVED_SUCCESS");expect(latest?.recoveryState).toBe("REQUIRED");expect(history).toHaveLength(2);expect(transitions).toHaveLength(1);expect(transitions[0]?.previousDigest).toBe(initial.settlementDigest);await reopened.close();
  });

  it("keeps ACCEPTED transport separate from observed reality",async()=>{
    const {file,secret}=await store(),consequenceRef=crypto.randomUUID(),first=new CieavConsequenceSettlementStore(file,secret);
    const dispatched=await first.recordExecutionTransport(consequenceRef,"ACCEPTED",["adapter:receipt-1"],new Date("2026-08-30T12:00:00.000Z"));
    expect(dispatched.settlement.executionState).toBe("DISPATCHED");expect(dispatched.settlement.realityState).toBe("UNKNOWN");expect(dispatched.settlement.legitimacyState).toBe("VALID");
    const replay=await first.recordExecutionTransport(consequenceRef,"ACCEPTED",["adapter:receipt-1"],new Date("2026-08-30T12:00:01.000Z"));expect(replay.changed).toBe(false);expect((await first.history(consequenceRef))).toHaveLength(1);
    const observed=await first.recordRealityObservation(consequenceRef,"OBSERVED_SUCCESS",["ledger:confirmed-1"],"Independent ledger confirmed the consequence.",new Date("2026-08-30T12:01:00.000Z"));
    expect(observed.settlement.executionState).toBe("COMPLETED");expect(observed.settlement.realityState).toBe("OBSERVED_SUCCESS");expect(observed.settlement.evidenceState).toBe("VERIFIED");await first.close();
  });

  it("keeps rejected or ambiguous transport at UNKNOWN until independent observation",async()=>{
    for(const transport of ["REJECTED","UNKNOWN"] as const){
      const {file,secret}=await store(),consequenceRef=crypto.randomUUID(),first=new CieavConsequenceSettlementStore(file,secret),attempt=await first.recordExecutionTransport(consequenceRef,transport,[`adapter:${transport.toLowerCase()}`]);
      expect(attempt.settlement.executionState).toBe("INTERRUPTED");expect(attempt.settlement.realityState).toBe("UNKNOWN");expect(attempt.settlement.recoveryState).toBe("UNKNOWN");
      const observed=await first.recordRealityObservation(consequenceRef,"OBSERVED_FAILURE",[`proof:${transport.toLowerCase()}:no-effect`],"Independent proof established that the intended consequence did not occur.");expect(observed.settlement.realityState).toBe("OBSERVED_FAILURE");await first.close();
    }
  });

  it("requires trusted reconciliation to settle UNKNOWN after restart",async()=>{
    const {file,secret}=await store(),consequenceRef=crypto.randomUUID(),first=new CieavConsequenceSettlementStore(file,secret);await first.create({consequenceRef,executionState:"DISPATCHED",realityState:"UNKNOWN",evidenceState:"UNAVAILABLE",recoveryState:"UNKNOWN"});await first.close();
    const reopened=new CieavConsequenceSettlementStore(file,secret);await expect(reopened.update(consequenceRef,{executionState:"COMPLETED",realityState:"OBSERVED_FAILURE",evidenceState:"VERIFIED",recoveryState:"NOT_REQUIRED"},"untrusted retry result")).rejects.toThrow("reality_reconciliation_required");
    const result=await reopened.update(consequenceRef,{executionState:"COMPLETED",realityState:"OBSERVED_FAILURE",evidenceState:"VERIFIED",recoveryState:"NOT_REQUIRED",evidenceRefs:["provider:signed-readback"]},"trusted reconciliation",{trustedRealityReconciliation:true});expect(result.settlement.realityState).toBe("OBSERVED_FAILURE");await reopened.close();
  });

  it("preserves append-order replay even when snapshots share timestamps",async()=>{
    const {file,secret}=await store(),consequenceRef=crypto.randomUUID(),at=new Date("2026-08-30T12:00:00.000Z"),first=new CieavConsequenceSettlementStore(file,secret);await first.create({consequenceRef,executionState:"DISPATCHED",realityState:"UNKNOWN",evidenceState:"AVAILABLE",recoveryState:"UNKNOWN",at});await first.update(consequenceRef,{legitimacyState:"VALID"},"Authority provenance verified.",{at});await first.close();
    const reopened=new CieavConsequenceSettlementStore(file,secret);const history=await reopened.history(consequenceRef);expect(history).toHaveLength(2);expect(history[0]?.legitimacyState).toBe("UNKNOWN_VALIDITY");expect(history[1]?.legitimacyState).toBe("VALID");expect((await reopened.transitions(consequenceRef))).toHaveLength(1);await reopened.close();
  });

  it("fails closed when authenticated settlement state is tampered",async()=>{
    const {file,secret}=await store(),first=new CieavConsequenceSettlementStore(file,secret);await first.create({consequenceRef:crypto.randomUUID(),executionState:"DISPATCHED",realityState:"UNKNOWN",recoveryState:"UNKNOWN"});await first.close();
    const parsed=JSON.parse(await readFile(file,"utf8"));parsed.payload.history[0].realityState="OBSERVED_SUCCESS";await writeFile(file,JSON.stringify(parsed));
    const reopened=new CieavConsequenceSettlementStore(file,secret);await expect(reopened.list()).rejects.toThrow("unreadable, corrupt, or unauthenticated");
  });
});
