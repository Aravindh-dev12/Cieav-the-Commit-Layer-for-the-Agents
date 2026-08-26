import {readFileSync} from "node:fs";
import path from "node:path";
import {describe,it,expect} from "vitest";

const root=path.resolve(process.cwd(),"../..");
const observe=readFileSync(path.join(root,"native/windows/cieav-desktop-observe/Program.cs"),"utf8");
const invoke=readFileSync(path.join(root,"native/windows/cieav-desktop-invoke/Program.cs"),"utf8");
const observeProject=readFileSync(path.join(root,"native/windows/cieav-desktop-observe/Cieav.DesktopObserve.csproj"),"utf8");
const invokeProject=readFileSync(path.join(root,"native/windows/cieav-desktop-invoke/Cieav.DesktopInvoke.csproj"),"utf8");

describe("Windows desktop native constitutional boundary",()=>{
  it("uses distinct observer and executor artifacts",()=>{
    expect(observeProject).toContain("<AssemblyName>cieav-desktop-observe</AssemblyName>");
    expect(invokeProject).toContain("<AssemblyName>cieav-desktop-invoke</AssemblyName>");
    expect(observeProject).not.toBe(invokeProject);
  });

  it("keeps observation read-only and free of commit/replay capability",()=>{
    expect(observe).toContain("System.Windows.Automation");
    expect(observe).toContain('Kind = "OBSERVATION"');
    expect(observe).not.toContain("CIEAV_DESKTOP_COMMIT_KEY");
    expect(observe).not.toContain("CIEAV_DESKTOP_REPLAY_DIR");
    expect(observe).not.toContain("InvokePattern.Invoke(");
    expect(observe).not.toContain("SetValue(");
  });

  it("authenticates and durably claims the ticket before UI resolution",()=>{
    for(const token of ["CIEAV_DESKTOP_COMMIT_KEY","CIEAV_DESKTOP_REPLAY_DIR","CIEAV_DESKTOP_COMMIT_V1","ReplayDirDigest","HMACSHA256","CryptographicOperations.FixedTimeEquals","FileMode.CreateNew","FileOptions.WriteThrough","Flush(true)","REPLAY_ALREADY_CONSUMED","ClaimReplay(request)"])expect(invoke).toContain(token);
    expect(invoke.indexOf("VerifyCommitMac(request)")).toBeLessThan(invoke.indexOf("ClaimReplay(request)"));
    expect(invoke.indexOf("ClaimReplay(request)")).toBeLessThan(invoke.indexOf("Resolve(request)"));
  });

  it("limits execution to InvokePattern with exact pre-state revalidation",()=>{
    expect(invoke).toContain('Kind != "INVOKE"');
    expect(invoke).toContain('Action != "INVOKE"');
    expect(invoke).toContain("PRESTATE_MISMATCH");
    expect(invoke).toContain("TryGetCurrentPattern(InvokePattern.Pattern");expect(invoke).toContain("invokePattern.Invoke()");
    expect(invoke).not.toContain("ValuePattern.SetValue");
    expect(invoke).not.toContain("SendKeys");
    expect(invoke).not.toContain("Process.Start");
    expect(invoke).not.toContain("powershell");
  });

  it("binds Windows app identity to an exact absolute process image path",()=>{
    expect(observe).toContain("Path.GetFullPath");
    expect(invoke).toContain("Path.IsPathFullyQualified(AppId)");
    expect(invoke).toContain("ProcessImage(window.Current.ProcessId).ToUpperInvariant()");
  });
});
