import crypto from "node:crypto";
import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {CieavEdgeSafeStateController} from "./edge-safe-state.js";

const digest=()=>crypto.createHash("sha256").update(readFileSync(process.execPath)).digest("hex");
describe("CieavEdgeSafeStateController",()=>{
  it("executes a pinned no-shell safe-state hook",async()=>{const controller=new CieavEdgeSafeStateController([{deviceId:"robot-1",safeState:"motor-stop",command:process.execPath,commandSha256:digest(),args:["-e","process.exit(0)"],timeoutMs:2_000,staticEnv:{}}]);await expect(controller.trigger("robot-1","motor-stop","watchdog stale")).resolves.toMatchObject({status:"EXECUTED",exitCode:0})});
  it("fails closed when a safe state is not configured",async()=>{const controller=new CieavEdgeSafeStateController([]);await expect(controller.trigger("robot-1","motor-stop","watchdog stale")).rejects.toThrow("edge_safe_state_hook_not_configured")});
  it("rejects an incorrect executable digest before activation",()=>{expect(()=>new CieavEdgeSafeStateController([{deviceId:"robot-1",safeState:"motor-stop",command:process.execPath,commandSha256:"0".repeat(64),args:[],timeoutMs:1_000,staticEnv:{}}])).toThrow("edge_safe_state_command_digest_mismatch")});
});
