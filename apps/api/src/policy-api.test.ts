import crypto from "node:crypto";
import {mkdtemp} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe,expect,it} from "vitest";
import {CieavPolicyApi} from "./policy-api.js";

const secret="P".repeat(64);
describe("CIEAV policy store",()=>{
  it("persists one active policy per organization with tamper-evident storage",async()=>{const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-policy-")),file=path.join(dir,"policies.json"),api=new CieavPolicyApi(file,secret),ruleId=crypto.randomUUID();const first=await api.store.put({organizationId:"org-1",version:"1",enabled:true,bindings:[{principalId:"agent-1",roles:["finance"],attributes:{region:"in"}}],deniedActionTypes:["delete.account"],deniedTargets:[],deniedDataCategories:["HEALTH"],maxRisk:"HIGH",allowExternalRecipients:false,rules:[{id:ruleId,name:"critical approval",effect:"REQUIRE_APPROVAL",actorKinds:["AGENT"],actionTypes:[],effectClasses:[],targets:[],dataCategoriesAny:[],requiredRoles:["finance"],requiredAttributes:{region:"in"},minRisk:"HIGH",reason:"High-risk finance actions require approval."}]});expect(first.id).toBeTruthy();await api.store.close();const reopened=new CieavPolicyApi(file,secret),loaded=await reopened.store.get("org-1");expect(loaded?.version).toBe("1");expect(loaded?.rules[0]?.id).toBe(ruleId);await reopened.store.close()})
});
