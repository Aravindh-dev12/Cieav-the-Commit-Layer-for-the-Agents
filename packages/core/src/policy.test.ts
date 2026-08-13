import crypto from "node:crypto";
import {describe,expect,it} from "vitest";
import type {ActionProposal,IntentContract} from "@cieav/contracts/reality";
import type {OrganizationPolicy} from "@cieav/contracts/policy";
import {evaluateEnterprisePolicy} from "./policy.js";

const intent:IntentContract={id:crypto.randomUUID(),owner:{id:"human-1",kind:"HUMAN"},goal:"Manage production safely",createdAt:new Date().toISOString(),status:"ACTIVE",constraints:{allowedActionTypes:[],deniedActionTypes:[],allowedTargets:[],deniedTargets:[],maxRisk:"CRITICAL",allowedDataCategories:["NONE","WORK"],allowExternalRecipients:true,maxDelegationDepth:3,requireIndependentVerification:true},completionCriteria:["Desired change verified"],contextLabels:{organizationId:"org-1"}};
function proposal(overrides:Partial<ActionProposal>={}):ActionProposal{return{id:crypto.randomUUID(),intentId:intent.id,requestId:"request-12345678",actor:{id:"agent-1",kind:"AGENT"},delegationChain:[],actionType:"deploy.production",summary:"Deploy production",risk:"HIGH",effect:{class:"EXECUTE",operation:"deploy.production",target:"prod",recipients:[],dataCategories:["WORK"],reversibility:"COMPENSABLE",metadata:{}},requestedAt:new Date().toISOString(),...overrides}}
function policy(overrides:Partial<OrganizationPolicy>={}):OrganizationPolicy{return{id:crypto.randomUUID(),organizationId:"org-1",version:"1",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),enabled:true,bindings:[{principalId:"agent-1",roles:["deployer"],attributes:{team:"platform"}}],deniedActionTypes:[],deniedTargets:[],deniedDataCategories:[],rules:[],...overrides}}

describe("CIEAV enterprise policy",()=>{
  it("blocks actions that exceed an organization risk ceiling",()=>{expect(evaluateEnterprisePolicy(policy({maxRisk:"MEDIUM"}),intent,proposal()).decision).toBe("BLOCK")});
  it("requires roles before a matching rule can grant no additional authority",()=>{const p=policy({bindings:[],rules:[{id:crypto.randomUUID(),name:"prod deployers",effect:"REQUIRE_APPROVAL",actorKinds:["AGENT"],actionTypes:["deploy.production"],effectClasses:[],targets:[],dataCategoriesAny:[],requiredRoles:["deployer"],requiredAttributes:{},reason:"Production deploy requires human approval."}]});expect(evaluateEnterprisePolicy(p,intent,proposal()).decision).toBe("BLOCK")});
  it("can add approval friction but never create authority beyond intent",()=>{const p=policy({rules:[{id:crypto.randomUUID(),name:"prod approval",effect:"REQUIRE_APPROVAL",actorKinds:["AGENT"],actionTypes:["deploy.production"],effectClasses:[],targets:[],dataCategoriesAny:[],requiredRoles:["deployer"],requiredAttributes:{team:"platform"},reason:"Production deploy requires approval."}]});expect(evaluateEnterprisePolicy(p,intent,proposal()).decision).toBe("ASK")});
});
