import {readFileSync} from "node:fs";
import path from "node:path";
import {describe,it,expect} from "vitest";

const root=path.resolve(process.cwd(),"../..");
const observe=readFileSync(path.join(root,"native/linux/cieav-desktop-observe/main.c"),"utf8");
const invoke=readFileSync(path.join(root,"native/linux/cieav-desktop-invoke/main.c"),"utf8");

describe("Linux desktop native constitutional boundary",()=>{
  it("keeps observation on read-only AT-SPI primitives and free of commit/replay capability",()=>{
    expect(observe).toContain("atspi_get_desktop(0)");
    expect(observe).toContain("atspi_accessible_get_accessible_id");
    expect(observe).not.toContain("CIEAV_DESKTOP_COMMIT_KEY");
    expect(observe).not.toContain("CIEAV_DESKTOP_REPLAY_DIR");
    expect(observe).not.toContain("atspi_action_do_action");
    expect(observe).not.toContain("atspi_generate_mouse_event");
    expect(observe).not.toContain("atspi_generate_keyboard_event");
  });

  it("authenticates and durably claims the ticket before AT-SPI initialization",()=>{
    for(const token of ["CIEAV_DESKTOP_COMMIT_KEY","CIEAV_DESKTOP_REPLAY_DIR","CIEAV_DESKTOP_COMMIT_V1","replayDirDigest","g_compute_hmac_for_data","claim_replay(o)","openat(dfd","O_EXCL","O_NOFOLLOW","fsync(dfd)","REPLAY_ALREADY_CONSUMED","exact_member_count(o,12)"])expect(invoke).toContain(token);
    expect(invoke.indexOf("verify_commit_mac(o)")).toBeLessThan(invoke.indexOf("claim_replay(o)"));
    expect(invoke.indexOf("claim_replay(o)")).toBeLessThan(invoke.indexOf("atspi_init()"));
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
