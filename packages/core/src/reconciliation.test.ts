import crypto from "node:crypto";
import {describe,expect,it} from "vitest";
import type {BusinessRealityPlan,ObservedBusinessFact} from "@cieav/contracts/business";
import {reconcileBusinessReality} from "./reconciliation.js";

const entity={kind:"ACCOUNT" as const,id:"employee-42",displayName:"Departing employee"};
function plan(expectedBy?:string):BusinessRealityPlan{return{id:crypto.randomUUID(),organizationId:"org-1",name:"Offboarding",createdAt:new Date().toISOString(),assertions:[{id:crypto.randomUUID(),entity,field:"githubAccess",operator:"ABSENT",severity:"CRITICAL",...(expectedBy?{expectedBy}:{})},{id:crypto.randomUUID(),entity,field:"awsAccess",operator:"ABSENT",severity:"CRITICAL",...(expectedBy?{expectedBy}:{})}]}}
const fact=(field:string,exists:boolean,provenance:ObservedBusinessFact["provenance"]="TRUSTED_CONNECTOR"):ObservedBusinessFact=>({entity,field,value:exists?"active":null,exists,observedAt:new Date().toISOString(),source:"identity-provider",confidence:.99,provenance});

describe("CIEAV business reality reconciliation",()=>{
  it("detects incomplete offboarding across systems",()=>{const r=reconcileBusinessReality(plan(),[fact("githubAccess",false),fact("awsAccess",true)]);expect(r.healthy).toBe(false);expect(r.matched).toBe(1);expect(r.mismatched).toBe(1);expect(r.differences[0]?.severity).toBe("CRITICAL")});
  it("distinguishes missing evidence from a verified mismatch",()=>{const r=reconcileBusinessReality(plan(),[fact("githubAccess",false)]);expect(r.missingEvidence).toBe(1);expect(r.differences.some(x=>x.status==="MISSING_EVIDENCE")).toBe(true)});
  it("marks unresolved expectations overdue after their deadline",()=>{const r=reconcileBusinessReality(plan("2020-01-01T00:00:00.000Z"),[]);expect(r.overdue).toBe(2);expect(r.differences.every(x=>x.status==="OVERDUE")).toBe(true)});
  it("does not let an agent self-report make the company twin healthy",()=>{const r=reconcileBusinessReality(plan(),[fact("githubAccess",false,"AGENT_REPORT"),fact("awsAccess",false,"AGENT_REPORT")]);expect(r.healthy).toBe(false);expect(r.missingEvidence).toBe(2);expect(r.matched).toBe(0)});
});
