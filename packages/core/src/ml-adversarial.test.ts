import {describe,expect,it} from "vitest";
import {assessRewardHacking} from "./ml-adversarial.js";

describe("CIEAV independent ML verification",()=>{
  it("detects a training verifier that rewards an independently unsafe output",()=>{
    const x=assessRewardHacking({score:.9,hardFailure:false,components:[]},{score:-.8,hardFailure:true,violations:["critical risk underclassification"]});
    expect(x.detected).toBe(true);expect(x.reasons).toContain("high_training_reward_with_independent_hard_failure");
  });
  it("does not flag closely agreeing safe verifiers",()=>{
    const x=assessRewardHacking({score:.8,hardFailure:false,components:[]},{score:.72,hardFailure:false,violations:[]});
    expect(x.detected).toBe(false);
  });
});
