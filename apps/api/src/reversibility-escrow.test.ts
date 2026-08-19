import {mkdtemp,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach,describe,expect,it} from "vitest";
import {CieavReversibilityEscrowStore} from "./reversibility-escrow.js";

const dirs:string[]=[];
afterEach(async()=>{for(const dir of dirs.splice(0))await rm(dir,{recursive:true,force:true})});
const forward={class:"DATA" as const,operation:"filesystem.delete",target:"/work/report.txt",recipients:[],dataCategories:["FILE" as const],reversibility:"REVERSIBLE" as const,metadata:{resourceId:"report-v7",cieavSemanticEffect:"file.delete"}};
const inverse={actionType:"filesystem.restore",effect:{class:"DATA" as const,operation:"filesystem.restore",target:"/work/report.txt",recipients:[],dataCategories:["FILE" as const],reversibility:"REVERSIBLE" as const,metadata:{resourceId:"report-v7",cieavSemanticEffect:"file.restore"}},instructions:["Restore exact captured version."],requiredEvidenceKinds:["FILESYSTEM" as const],artifactDigests:["a".repeat(64)]};

describe("CIEAV durable reversibility escrow",()=>{
  it("persists reservation, proof activation and one-time consumption",async()=>{
    const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-escrow-"));dirs.push(dir);const file=path.join(dir,"escrow.json"),secret="e".repeat(64),scope="dev_1234567890";
    const store=new CieavReversibilityEscrowStore(file,secret),reserved=await store.reserve({scopeDeviceId:scope,intentId:"11111111-1111-4111-8111-111111111111",taskId:"22222222-2222-4222-8222-222222222222",forwardEffect:forward,inverse});
    expect(reserved.state).toBe("RESERVED");
    const active=await store.activateForTask(scope,reserved.taskId,"33333333-3333-4333-8333-333333333333");expect(active[0]?.state).toBe("ACTIVATED");
    const consumed=await store.consume(scope,reserved.id,inverse.effect);expect(consumed?.state).toBe("CONSUMED");await store.close();
    const reopened=new CieavReversibilityEscrowStore(file,secret),read=await reopened.get(scope,reserved.id);expect(read?.state).toBe("CONSUMED");await reopened.close();
  });
});
