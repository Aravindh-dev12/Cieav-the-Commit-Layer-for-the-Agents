import {readFileSync} from "node:fs";
import path from "node:path";
import {describe,it,expect} from "vitest";

const root=path.resolve(process.cwd(),"../..");
const observe=readFileSync(path.join(root,"native/linux/cieav-desktop-observe/main.c"),"utf8");
const invoke=readFileSync(path.join(root,"native/linux/cieav-desktop-invoke/main.c"),"utf8");

describe("Linux desktop native constitutional boundary",()=>{
  it("keeps observation on read-only AT-SPI primitives",()=>{
    expect(observe).toContain("atspi_get_desktop(0)");
    expect(observe).toContain("atspi_accessible_get_accessible_id");
    expect(observe).not.toContain("atspi_action_do_action");
    expect(observe).not.toContain("atspi_generate_mouse_event");
    expect(observe).not.toContain("atspi_generate_keyboard_event");
  });

  it("limits execution to the default accessible action after exact pre-state validation",()=>{
    expect(invoke).toContain('g_strcmp0(action_name,"INVOKE")');
    expect(invoke).toContain("PRESTATE_MISMATCH");
    expect(invoke).toContain("atspi_action_do_action(action,0");
    expect(invoke).not.toContain("atspi_generate_mouse_event");
    expect(invoke).not.toContain("atspi_generate_keyboard_event");
    expect(invoke).not.toContain("system(");
    expect(invoke).not.toContain("popen(");
  });

  it("requires exact executable and stable AT-SPI accessible IDs",()=>{
    expect(observe).toContain('g_strdup_printf("/proc/%u/exe"');
    expect(observe).toContain("atspi_accessible_get_accessible_id");
    expect(observe).toContain("matches!=1");
    expect(invoke).toContain("matches!=1");
  });
});
