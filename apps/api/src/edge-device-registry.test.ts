import {mkdtemp} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe,expect,it} from "vitest";
import {CieavEdgeDeviceRegistry} from "./edge-device-registry.js";

async function registry(){const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-edge-device-")),file=path.join(dir,"devices.json");return new CieavEdgeDeviceRegistry(file,"d".repeat(64))}
const base=()=>({id:"robot-1",identityDigest:"a".repeat(64),platform:"linux-ros2",maxStalenessMs:5_000,watchdog:{required:true,healthy:true,lastHeartbeatAt:new Date().toISOString(),maxHeartbeatAgeMs:2_000,safeState:"motor-stop"}});

describe("CieavEdgeDeviceRegistry",()=>{
  it("persists fresh device identity and rejects identity replacement",async()=>{const r=await registry();await r.register(base());await expect(r.heartbeat("robot-1","b".repeat(64),true)).rejects.toThrow("edge_device_identity_mismatch");await r.close()});
  it("fails closed on stale devices",async()=>{const r=await registry();const d=await r.register({...base(),maxStalenessMs:50});await new Promise(resolve=>setTimeout(resolve,80));await expect(r.assertUsable(d.id)).rejects.toThrow("edge_device_stale");await r.close()});
  it("fails closed when watchdog heartbeat expires and surfaces safe state",async()=>{const r=await registry();const d=await r.register({...base(),watchdog:{...base().watchdog,maxHeartbeatAgeMs:50,lastHeartbeatAt:new Date().toISOString()}});await new Promise(resolve=>setTimeout(resolve,80));await expect(r.assertUsable(d.id)).rejects.toThrow("safe_state=motor-stop");await r.close()});
  it("revokes device monotonically",async()=>{const r=await registry();const d=await r.register(base());await r.revoke(d.id,"operator revoke");await expect(r.assertUsable(d.id)).rejects.toThrow("edge_device_revoked");await expect(r.register(base())).rejects.toThrow("edge_device_revoked");await r.close()});
});
