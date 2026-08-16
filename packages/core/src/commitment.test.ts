import {describe,expect,it} from "vitest";
import type {Commitment,CommitmentEvidence} from "@cieav/contracts";
import {assertCommitmentTransition,consequenceRisk,settleCommitment,validateConsequenceGraph} from "./commitment.js";

const base:Commitment={
  id:"11111111-1111-4111-8111-111111111111",version:1,
  owner:{id:"user-1",kind:"HUMAN"},actor:{id:"agent-1",kind:"AGENT",provider:"mcp"},authoritySource:"standing user policy",
  summary:"Send an approved customer proposal",desiredState:"Customer receives exactly the approved proposal",createdAt:"2026-08-16T08:00:00.000Z",state:"OBSERVING",risk:"HIGH",
  consequenceGraph:{version:1,nodes:[{id:"prepare",kind:"READ",summary:"Read approved proposal",risk:"LOW",reversibility:"REVERSIBLE",affectedEntities:[],dataCategories:[],external:false,dependsOn:[]},{id:"send",kind:"COMMUNICATE",summary:"Send proposal to customer",target:"customer@example.com",risk:"HIGH",reversibility:"COMPENSABLE",affectedEntities:["customer:acme"],dataCategories:["WORK"],external:true,dependsOn:["prepare"]}]},
  proofObligation:{version:1,requirements:[{id:"sent-readback",kind:"EMAIL",description:"Sent mailbox contains the approved message",required:true,minimumConfidence:.9,independentOfActor:true}],forbiddenShortcuts:["agent self-report","tool returned success"]},
  recovery:{kind:"ESCALATE",requiresAuthorization:true,instructions:["Keep the commitment open and alert the owner."]},metadata:{}
};

function ev(overrides:Partial<CommitmentEvidence>={}):CommitmentEvidence{return{requirementId:"sent-readback",kind:"EMAIL",signal:"SUPPORTS",summary:"message present in sent mailbox",source:"gmail-readback",confidence:.99,observedAt:"2026-08-16T08:01:00.000Z",actorIndependent:true,...overrides}}

describe("commitment runtime",()=>{
  it("validates a DAG and reports aggregate consequence risk",()=>{validateConsequenceGraph(base.consequenceGraph);expect(consequenceRisk(base.consequenceGraph)).toBe("HIGH")});
  it("rejects consequence cycles",()=>{const graph={...base.consequenceGraph,nodes:base.consequenceGraph.nodes.map((n,i)=>({...n,dependsOn:i===0?["send"]:["prepare"]}))};expect(()=>validateConsequenceGraph(graph)).toThrow(/cycle/)});
  it("does not let an agent self-report satisfy independent proof",()=>{const result=settleCommitment(base,[ev({source:"agent-1",kind:"TOOL_RESULT",actorIndependent:false})]);expect(result.status).toBe("UNKNOWN");expect(result.missingRequirementIds).toEqual(["sent-readback"])});
  it("settles PROVEN only from qualifying independent evidence",()=>{const result=settleCommitment(base,[ev()]);expect(result.status).toBe("PROVEN");expect(result.satisfiedRequirementIds).toEqual(["sent-readback"])});
  it("settles DISPROVEN when trusted evidence contradicts a requirement",()=>{const result=settleCommitment(base,[ev({signal:"CONTRADICTS",summary:"message absent after readback"})]);expect(result.status).toBe("DISPROVEN");expect(result.contradictedRequirementIds).toEqual(["sent-readback"])});
  it("prevents a claimed completion from jumping directly to proven",()=>{expect(()=>assertCommitmentTransition("CLAIMED_COMPLETE","PROVEN")).toThrow(/invalid commitment transition/);expect(()=>assertCommitmentTransition("CLAIMED_COMPLETE","OBSERVING")).not.toThrow()});
});
