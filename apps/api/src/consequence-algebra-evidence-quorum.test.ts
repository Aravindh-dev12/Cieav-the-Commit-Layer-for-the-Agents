import crypto from "node:crypto";
import {mkdtemp,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach,describe,expect,it} from "vitest";
import type {EvidenceProviderBinding,EvidenceQuorumRequirement,ExecutionProposal} from "@cieav/contracts";
import {materializeExecutionProposal} from "@cieav/core/consequence-algebra";
import {CieavConsequenceAlgebraStore} from "./consequence-algebra-store.js";

const dirs:string[]=[];
const secret="s".repeat(64);
const h=(c:string)=>c.repeat(64);

async function makeStore(){
  const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-quorum-"));dirs.push(dir);
  const file=path.join(dir,"state.json");
  return{file,store:new CieavConsequenceAlgebraStore(file,secret)};
}

function proposal(overrides:Partial<ExecutionProposal>={}):ExecutionProposal{return{
  id:crypto.randomUUID(),version:1,taskId:crypto.randomUUID(),intentId:crypto.randomUUID(),scopeDeviceId:"device-0001",subjectId:"agent-1",
  identityAttestationId:crypto.randomUUID(),credentialLeaseId:crypto.randomUUID(),toolId:"bank-transfer",protocol:"HTTP",operation:"TRANSFER",target:"acct:beneficiary",risk:"CRITICAL",
  normalizedArgumentsDigest:h("a"),semanticEffect:{kind:"TRANSFER_VALUE",target:"acct:beneficiary",amount:{currency:"USD",value:100},attributes:{invoice:"inv-1"}},
  realityWitness:{version:1,observedAt:new Date().toISOString(),facts:[{key:"balance",valueDigest:h("b"),source:"bank-api",observedAt:new Date().toISOString()}],digest:h("c")},
  expectedPostStateDigest:h("d"),proofObligationDigest:h("e"),attenuationWitnessIds:[],createdAt:new Date().toISOString(),...overrides
};}

function provider(ref:string,domain:string,evidenceClasses:string|string[],digestChar:string,overrides:Partial<EvidenceProviderBinding>={}):EvidenceProviderBinding{return{
  version:"CIEAV_EVIDENCE_PROVIDER_BINDING_V1",ref,enabled:true,versionDigest:h(digestChar),independenceDomain:domain,evidenceClasses:Array.isArray(evidenceClasses)?evidenceClasses:[evidenceClasses],sourceClass:"REMOTE_API",health:"AVAILABLE",evidenceRefs:[`qualification:${ref}`],authority:false,mayMintExecutionAuthority:false,...overrides
};}

function requirement(id=crypto.randomUUID(),overrides:Partial<EvidenceQuorumRequirement>={}):EvidenceQuorumRequirement{return{
  id,version:"CIEAV_EVIDENCE_QUORUM_REQUIREMENT_V1",enabled:true,priority:100,toolIds:["bank-transfer"],effectClasses:["TRANSFER_VALUE"],minRisk:"CRITICAL",
  minimumProviders:2,minimumIndependenceDomains:2,requiredEvidenceClasses:["REMOTE_STATE","SIGNED_RECEIPT"],maxEvidenceAgeMs:120000,timeoutOutcome:"UNKNOWN",
  evidenceRefs:["policy:critical-transfer-proof"],reason:"Critical transfers require independent state and receipt evidence.",authority:false,mayMintExecutionAuthority:false,...overrides
};}

async function configure(store:CieavConsequenceAlgebraStore,providers:EvidenceProviderBinding[],requirements:EvidenceQuorumRequirement[]){
  const policy=await store.getPolicy();
  return store.putPolicy({...policy,proofabilityRisks:["CRITICAL"],evidenceProviders:providers,evidenceQuorumRequirements:requirements});
}

afterEach(async()=>{await Promise.all(dirs.splice(0).map(dir=>rm(dir,{recursive:true,force:true})))});

describe("CieavConsequenceAlgebraStore evidence quorum authority binding",()=>{
  it("persists a satisfiable quorum across restart and revalidates it",async()=>{
    const x=await makeStore(),r=requirement(),providers=[provider("bank-readback","bank","REMOTE_STATE","1"),provider("ledger-receipt","ledger","SIGNED_RECEIPT","2")];
    await configure(x.store,providers,[r]);
    const m=materializeExecutionProposal(proposal()),admitted=await x.store.admit(m,{});
    expect(admitted.admission.decision).toBe("ADMIT");expect(admitted.admission.proofPlanReservation?.evidenceQuorumPlan?.availabilityState).toBe("SATISFIABLE");
    await expect(x.store.assertProofPlanValid(m.id)).resolves.toBe(true);await x.store.close();
    const reopened=new CieavConsequenceAlgebraStore(x.file,secret);await expect(reopened.assertProofPlanValid(m.id)).resolves.toBe(true);
    const persisted=await reopened.getPolicy();expect(persisted.evidenceProviders).toHaveLength(2);expect(persisted.evidenceQuorumRequirements).toHaveLength(1);
  });

  it("revokes unused authority when a selected evidence provider becomes unavailable",async()=>{
    const x=await makeStore(),r=requirement(),a=provider("bank-readback","bank","REMOTE_STATE","1"),b=provider("ledger-receipt","ledger","SIGNED_RECEIPT","2");
    await configure(x.store,[a,b],[r]);const m=materializeExecutionProposal(proposal());await x.store.admit(m,{});await expect(x.store.assertProofPlanValid(m.id)).resolves.toBe(true);
    await configure(x.store,[a,{...b,health:"UNAVAILABLE"}],[r]);await expect(x.store.assertProofPlanValid(m.id)).rejects.toThrow(/evidence_quorum_provider_unavailable/);
  });

  it("revokes unused authority when a selected provider version drifts",async()=>{
    const x=await makeStore(),r=requirement(),a=provider("bank-readback","bank","REMOTE_STATE","1"),b=provider("ledger-receipt","ledger","SIGNED_RECEIPT","2");
    await configure(x.store,[a,b],[r]);const m=materializeExecutionProposal(proposal());await x.store.admit(m,{});await expect(x.store.assertProofPlanValid(m.id)).resolves.toBe(true);
    await configure(x.store,[a,{...b,versionDigest:h("3")}],[r]);await expect(x.store.assertProofPlanValid(m.id)).rejects.toThrow(/evidence_quorum_provider_version_drift:ledger-receipt/);
  });

  it("revokes unused authority when the selected quorum requirement changes",async()=>{
    const x=await makeStore(),id=crypto.randomUUID(),r=requirement(id),providers=[provider("bank-readback","bank","REMOTE_STATE","1"),provider("ledger-receipt","ledger","SIGNED_RECEIPT","2")];
    await configure(x.store,providers,[r]);const m=materializeExecutionProposal(proposal());await x.store.admit(m,{});await expect(x.store.assertProofPlanValid(m.id)).resolves.toBe(true);
    await configure(x.store,providers,[requirement(id,{minimumProviders:3})]);await expect(x.store.assertProofPlanValid(m.id)).rejects.toThrow(/evidence_quorum_requirement_drift/);
  });

  it("fails closed when rich quorum policy replaces a legacy flat proof reservation",async()=>{
    const x=await makeStore(),policy=await x.store.getPolicy();await x.store.putPolicy({...policy,proofabilityRisks:["CRITICAL"]});
    const m=materializeExecutionProposal(proposal());const admitted=await x.store.admit(m,{proofProviders:[{ref:"legacy-proof",versionDigest:h("4")}],requireProofability:true});expect(admitted.admission.decision).toBe("ADMIT");
    await expect(x.store.assertProofPlanValid(m.id)).resolves.toBe(true);
    const r=requirement(),providers=[provider("bank-readback","bank","REMOTE_STATE","1"),provider("ledger-receipt","ledger","SIGNED_RECEIPT","2")];await configure(x.store,providers,[r]);
    await expect(x.store.assertProofPlanValid(m.id)).rejects.toThrow(/evidence_quorum_plan_required/);
  });
});
