import {describe,expect,it} from "vitest";
import {activateReversibilityEscrow,consumeReversibilityEscrow,reserveReversibilityEscrow} from "./reversibility-escrow.js";

const forward={class:"DATA" as const,operation:"filesystem.delete",target:"/work/report.txt",recipients:[],dataCategories:["FILE" as const],reversibility:"REVERSIBLE" as const,metadata:{resourceId:"report-v7",cieavSemanticEffect:"file.delete"}};
const inverse={actionType:"filesystem.restore",effect:{class:"DATA" as const,operation:"filesystem.restore",target:"/work/report.txt",recipients:[],dataCategories:["FILE" as const],reversibility:"REVERSIBLE" as const,metadata:{resourceId:"report-v7",cieavSemanticEffect:"file.restore"}},instructions:["Restore the exact captured version."],requiredEvidenceKinds:["FILESYSTEM" as const],artifactDigests:["a".repeat(64)]};

describe("CIEAV reversibility escrow",()=>{
  it("does not expose an inverse until the forward effect is independently proven",()=>{
    const reserved=reserveReversibilityEscrow({scopeDeviceId:"dev_1234567890",intentId:"11111111-1111-4111-8111-111111111111",taskId:"22222222-2222-4222-8222-222222222222",forwardEffect:forward,inverse});
    expect(reserved.state).toBe("RESERVED");
    expect(()=>consumeReversibilityEscrow(reserved,inverse.effect)).toThrow(/not_activated/);
    const active=activateReversibilityEscrow(reserved,"33333333-3333-4333-8333-333333333333");
    expect(active.state).toBe("ACTIVATED");
    expect(consumeReversibilityEscrow(active,inverse.effect).state).toBe("CONSUMED");
  });
  it("rejects a claimed inverse bound to another target",()=>{
    expect(()=>reserveReversibilityEscrow({scopeDeviceId:"dev_1234567890",intentId:"11111111-1111-4111-8111-111111111111",taskId:"22222222-2222-4222-8222-222222222222",forwardEffect:forward,inverse:{...inverse,effect:{...inverse.effect,target:"/work/other.txt"}}})).toThrow(/target_mismatch/);
  });
});
