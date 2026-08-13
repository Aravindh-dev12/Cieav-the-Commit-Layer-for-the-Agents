import crypto from "node:crypto";
import {describe,expect,it} from "vitest";
import type {ActionManifest} from "@cieav/contracts";
import type {CieavPrincipal,IntentContract} from "@cieav/contracts/reality";
import {assessConsequences,createIntentContract,evaluateAuthority,issueCommitPermit,proposalFromManifest,verifyCommitPermit} from "./reality.js";

const human:CieavPrincipal={id:"user-1",kind:"HUMAN",displayName:"Owner"};
const agent:CieavPrincipal={id:"agent-1",kind:"AGENT",provider:"test"};
const manifest=(risk:"LOW"|"MEDIUM"|"HIGH"|"CRITICAL"="HIGH"):ActionManifest=>({requestId:"request-12345678",actionType:"financial.commit",summary:"Buy flight",actor:"Agent",target:"airline.example",recipients:[],dataCategories:["FINANCIAL"],effects:["Purchase a flight"],reversibility:"COMPENSABLE",undo:{kind:"NONE"},risk,confidence:.9,modelUsed:true,warnings:[],evidence:["test"],policyVersion:"test"});
function intent():IntentContract{return createIntentContract({owner:human,goal:"Book a flight under INR 30000",constraints:{allowedActionTypes:["financial.commit"],deniedActionTypes:[],allowedTargets:["airline.example"],deniedTargets:[],maxRisk:"CRITICAL",humanApprovalAtOrAbove:"HIGH",allowedDataCategories:["NONE","FINANCIAL"],allowExternalRecipients:false,maxAmount:{currency:"INR",value:30000},maxDelegationDepth:1,requireIndependentVerification:true},completionCriteria:["A valid ticket is issued","Total price is <= INR 30000"]})}

describe("CIEAV reality kernel",()=>{
  it("requires human approval for high-risk actions inside an intent contract",()=>{const i=intent(),p=proposalFromManifest(i.id,agent,manifest(),[],{currency:"INR",value:28000}),d=evaluateAuthority(i,p);expect(d.decision).toBe("ASK");expect(d.humanApprovalRequired).toBe(true)});
  it("blocks semantic privilege escalation beyond the financial boundary",()=>{const i=intent(),p=proposalFromManifest(i.id,agent,manifest("CRITICAL"),[],{currency:"INR",value:38000}),d=evaluateAuthority(i,p);expect(d.decision).toBe("BLOCK");expect(d.reasons.join(" ")).toMatch(/amount/i)});
  it("prevents delegated agents from expanding authority",()=>{const i=intent(),p=proposalFromManifest(i.id,agent,manifest("MEDIUM"),[agent,{id:"child",kind:"AGENT"}],{currency:"INR",value:1000});expect(evaluateAuthority(i,p).decision).toBe("BLOCK")});
  it("issues scoped permits that cannot authorize a different proposal",()=>{const i=intent(),p=proposalFromManifest(i.id,agent,manifest("MEDIUM"),[],{currency:"INR",value:1000}),secret="x".repeat(48),permit=issueCommitPermit(p,secret,30);expect(verifyCommitPermit(permit,p,secret)).toBe(true);const changed={...p,id:crypto.randomUUID(),effect:{...p.effect,amount:{currency:"INR",value:2000}}};expect(verifyCommitPermit(permit,changed,secret)).toBe(false)});
  it("produces an independent verification plan for consequential actions",()=>{const i=intent(),p=proposalFromManifest(i.id,agent,manifest(),[],{currency:"INR",value:25000}),a=assessConsequences(p);expect(a.verificationRequired).toBe(true);expect(a.verificationPlan).toContain("PAYMENT");expect(a.secondOrderEffects.length).toBeGreaterThan(0)});
});
