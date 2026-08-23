import {readFileSync} from "node:fs";
import path from "node:path";
import {describe,it,expect} from "vitest";

const root=path.resolve(process.cwd(),"../..");
const observe=readFileSync(path.join(root,"native/macos/cieav-desktop-observe/main.swift"),"utf8");
const invoke=readFileSync(path.join(root,"native/macos/cieav-desktop-invoke/main.swift"),"utf8");

describe("macOS desktop native constitutional boundary",()=>{
  it("keeps the observer read-only and free of commit/replay capability",()=>{
    expect(observe).toContain("AXUIElementCopyAttributeValue");
    expect(observe).toContain("AXIsProcessTrusted()");
    expect(observe).not.toContain("CIEAV_DESKTOP_COMMIT_KEY");
    expect(observe).not.toContain("CIEAV_DESKTOP_REPLAY_DIR");
    expect(observe).not.toContain("AXUIElementPerformAction");
    expect(observe).not.toContain("AXUIElementSetAttributeValue");
    expect(observe).not.toContain("AXUIElementPostKeyboardEvent");
  });

  it("authenticates and durably claims the ticket before Accessibility access",()=>{
    for(const token of ["CIEAV_DESKTOP_COMMIT_KEY","CIEAV_DESKTOP_REPLAY_DIR","CIEAV_DESKTOP_COMMIT_V1","replayDirDigest","HMAC<SHA256>.authenticationCode","openat(dirfd","O_EXCL","O_NOFOLLOW","fsync(dirfd)","REPLAY_ALREADY_CONSUMED","claimReplay(request)"])expect(invoke).toContain(token);
    expect(invoke.indexOf("try verifyCommitMac(request)")).toBeLessThan(invoke.indexOf("claimReplay(request)"));
    expect(invoke.indexOf("claimReplay(request)")).toBeLessThan(invoke.indexOf("AXIsProcessTrusted()"));
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
