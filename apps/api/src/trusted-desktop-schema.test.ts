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
    const base={platform:"linux" as const,appId:"org.example.App",windowId:"main",controlId:"save",action:"INVOKE" as const};
    const target=desktopUiTarget(base);
    expect(desktopUiTarget({...base,appId:"org.example.Other"})).not.toBe(target);
    expect(desktopUiTarget({...base,windowId:"secondary"})).not.toBe(target);
    expect(desktopUiTarget({...base,controlId:"cancel"})).not.toBe(target);
    expect(desktopUiTarget({...base,platform:"win32"})).not.toBe(target);
  });
  it("requires strict pinned helper configuration",()=>{
    const helper={path:"/absolute/helper",sha256:digest};
    expect(TrustedDesktopToolConfigSchema.parse({toolId:"desktop-save",platform:"linux",appId:"org.example.App",windowId:"main",controlId:"save",action:"INVOKE",executionHelper:helper,preflightHelper:{...helper,path:"/absolute/observer",sha256:"b".repeat(64)}}).action).toBe("INVOKE");
    expect(()=>TrustedDesktopToolConfigSchema.parse({toolId:"desktop-save",platform:"linux",appId:"org.example.App",windowId:"main",controlId:"save",action:"TYPE",executionHelper:helper,preflightHelper:helper})).toThrow();
  });
});
