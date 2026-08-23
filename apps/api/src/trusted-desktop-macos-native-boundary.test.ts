import {readFileSync} from "node:fs";
import path from "node:path";
import {describe,it,expect} from "vitest";

const root=path.resolve(process.cwd(),"../..");
const observe=readFileSync(path.join(root,"native/macos/cieav-desktop-observe/main.swift"),"utf8");
const invoke=readFileSync(path.join(root,"native/macos/cieav-desktop-invoke/main.swift"),"utf8");

describe("macOS desktop native constitutional boundary",()=>{
  it("keeps the observer read-only",()=>{
    expect(observe).toContain("AXUIElementCopyAttributeValue");
    expect(observe).toContain("AXIsProcessTrusted()");
    expect(observe).not.toContain("AXUIElementPerformAction");
    expect(observe).not.toContain("AXUIElementSetAttributeValue");
    expect(observe).not.toContain("AXUIElementPostKeyboardEvent");
  });

  it("limits execution to exact AXPress after pre-state validation",()=>{
    expect(invoke).toContain('request.action == "INVOKE"');
    expect(invoke).toContain("request.expectedStateDigest");
    expect(invoke).toContain("PRESTATE_MISMATCH");
    expect(invoke).toContain("AXUIElementPerformAction(resolved.2, kAXPressAction");
    expect(invoke).not.toContain("AXUIElementSetAttributeValue");
    expect(invoke).not.toContain("AXUIElementPostKeyboardEvent");
  });

  it("binds app, window and control identity exactly and rejects ambiguity",()=>{
    expect(observe).toContain("runningApplications(withBundleIdentifier: bundleId)");
    expect(observe).toContain("targetAmbiguous");
    expect(observe).toContain('let identifierAttribute = "AXIdentifier"');
    expect(invoke).toContain("targetAmbiguous");
  });
});
