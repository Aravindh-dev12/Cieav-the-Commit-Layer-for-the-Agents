import {describe,expect,it} from "vitest";
import {DesktopUiInvokeArgsSchema,desktopUiTarget,TrustedDesktopToolConfigSchema} from "./trusted-desktop-adapter.js";

const digest="a".repeat(64);

describe("desktop UI execution schemas",()=>{
  it("accepts only exact expected pre-state as dynamic authority",()=>{
    expect(DesktopUiInvokeArgsSchema.parse({expectedStateDigest:digest})).toEqual({expectedStateDigest:digest});
    for(const extra of [
      {expectedStateDigest:digest,appId:"other"},
      {expectedStateDigest:digest,windowId:"other"},
      {expectedStateDigest:digest,controlId:"other"},
      {expectedStateDigest:digest,action:"INVOKE"},
      {expectedStateDigest:digest,helper:"/tmp/evil"},
      {expectedStateDigest:digest,payload:{arbitrary:true}}
    ])expect(()=>DesktopUiInvokeArgsSchema.parse(extra)).toThrow();
    expect(()=>DesktopUiInvokeArgsSchema.parse({expectedStateDigest:"A".repeat(64)})).toThrow();
  });
  it("binds platform, app, window, control, and action into target identity",()=>{
    const base={platform:"linux" as const,appId:"/usr/bin/example",windowId:"main",controlId:"save",action:"INVOKE" as const};
    const target=desktopUiTarget(base);
    expect(desktopUiTarget({...base,appId:"/usr/bin/other"})).not.toBe(target);
    expect(desktopUiTarget({...base,windowId:"secondary"})).not.toBe(target);
    expect(desktopUiTarget({...base,controlId:"cancel"})).not.toBe(target);
    expect(desktopUiTarget({...base,platform:"win32"})).not.toBe(target);
  });
  it("requires strict pinned helper and commit-key configuration",()=>{
    const helper={path:"/absolute/helper",sha256:digest};
    const config={toolId:"desktop-save",platform:"linux" as const,appId:"/usr/bin/example",windowId:"main",controlId:"save",action:"INVOKE" as const,executionHelper:helper,preflightHelper:{...helper,path:"/absolute/observer",sha256:"b".repeat(64)},commitKeyEnv:"CIEAV_DESKTOP_SAVE_COMMIT_KEY"};
    expect(TrustedDesktopToolConfigSchema.parse(config).commitKeyEnv).toBe("CIEAV_DESKTOP_SAVE_COMMIT_KEY");
    expect(()=>TrustedDesktopToolConfigSchema.parse({...config,commitKeyEnv:"bad-key"})).toThrow();
    expect(()=>TrustedDesktopToolConfigSchema.parse({...config,action:"TYPE"})).toThrow();
    expect(()=>TrustedDesktopToolConfigSchema.parse({...config,commitKeyEnv:undefined})).toThrow();
  });
});
