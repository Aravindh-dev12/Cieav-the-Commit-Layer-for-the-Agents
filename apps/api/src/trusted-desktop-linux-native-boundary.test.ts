import {readFileSync} from "node:fs";
import path from "node:path";
import {describe,it,expect} from "vitest";

const root=path.resolve(process.cwd(),"../..");
const observe=readFileSync(path.join(root,"native/linux/cieav-desktop-observe/main.c"),"utf8");
const invoke=readFileSync(path.join(root,"native/linux/cieav-desktop-invoke/main.c"),"utf8");

describe("Linux desktop native constitutional boundary",()=>{
  it("keeps observation on read-only AT-SPI primitives and commit-key free",()=>{
    expect(observe).toContain("atspi_get_desktop(0)");
    expect(observe).toContain("atspi_accessible_get_accessible_id");
    expect(observe).not.toContain("CIEAV_DESKTOP_COMMIT_KEY");
    expect(observe).not.toContain("atspi_action_do_action");
    expect(observe).not.toContain("atspi_generate_mouse_event");
    expect(observe).not.toContain("atspi_generate_keyboard_event");
  });

  it("authenticates before the default accessible action and exact pre-state validation",()=>{
    expect(invoke).toContain('g_strcmp0(action_name,"INVOKE")');
    expect(invoke).toContain("CIEAV_DESKTOP_COMMIT_KEY");
    expect(invoke).toContain("CIEAV_DESKTOP_COMMIT_V1");
    expect(invoke).toContain("g_compute_hmac_for_data");
    expect(invoke).toContain("verify_commit_mac(o)");
    expect(invoke.indexOf("verify_commit_mac(o)")).toBeLessThan(invoke.indexOf("atspi_init()"));
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
    expect(invoke).toContain("exact_member_count(o,11)");
  });
});
