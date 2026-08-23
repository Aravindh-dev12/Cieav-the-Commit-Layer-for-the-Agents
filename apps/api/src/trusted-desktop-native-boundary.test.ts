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

  it("keeps observation read-only",()=>{
    expect(observe).toContain("System.Windows.Automation");
    expect(observe).toContain("OBSERVATION_RESULT");
    expect(observe).not.toContain("InvokePattern.Invoke(");
    expect(observe).not.toContain("SetValue(");
    expect(observe).not.toContain("Expand(");
    expect(observe).not.toContain("Collapse(");
    expect(observe).not.toContain("Select(");
  });

  it("limits execution to InvokePattern with exact pre-state revalidation",()=>{
    expect(invoke).toContain('Kind != "INVOKE"');
    expect(invoke).toContain('Action != "INVOKE"');
    expect(invoke).toContain("ExpectedStateDigest");
    expect(invoke).toContain("PRESTATE_MISMATCH");
    expect(invoke).toContain("InvokePattern.Invoke()");
    expect(invoke).not.toContain("ValuePattern.SetValue");
    expect(invoke).not.toContain("SendKeys");
    expect(invoke).not.toContain("Process.Start");
    expect(invoke).not.toContain("cmd.exe");
    expect(invoke).not.toContain("powershell");
  });

  it("binds Windows app identity to an exact absolute process image path",()=>{
    expect(observe).toContain("Path.GetFullPath");
    expect(invoke).toContain("Path.IsPathFullyQualified(AppId)");
    expect(invoke).toContain("ProcessImage(window.Current.ProcessId).ToUpperInvariant()");
  });
});
