import {mkdtemp,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach,describe,expect,it} from "vitest";
import {verifyEffectNodeAdvertisement,verifyEffectNodeHeartbeat} from "@cieav/core";
import {CieavEffectNodeHost} from "./effect-node-host.js";

const dirs:string[]=[];afterEach(async()=>{await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})))});
async function host(){const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-effect-host-"));dirs.push(dir);return new CieavEffectNodeHost({identityFile:path.join(dir,"identity.json"),installId:"install-effect-node-host-01",displayName:"Local Effect Node",platform:"WINDOWS",architecture:"x64",runtimeVersion:"0.8.0",capabilities:[{id:"process",kind:"PROCESS",operations:["process.run"],roots:["C:/work"],hosts:[],commands:["npm"],maxRuntimeMs:60000,metadata:{}}]})}

describe("CIEAV Effect Node host",()=>{
  it("persists a stable node identity while rotating signed message nonces",async()=>{const first=await host(),id=await first.nodeId(),a=await first.signedAdvertisement(),b=await first.signedAdvertisement();expect(a.advertisement.nodeId).toBe(id);expect(b.advertisement.nodeId).toBe(id);expect(a.advertisement.nonce).not.toBe(b.advertisement.nonce);expect(verifyEffectNodeAdvertisement(a)).toBe(true);expect(verifyEffectNodeAdvertisement(b)).toBe(true)});
  it("produces heartbeats verifiable against its public identity",async()=>{const h=await host(),hb=await h.heartbeat({inFlight:1,capacity:4}),record={nodeId:await h.nodeId(),publicKey:await h.publicKey()};expect(verifyEffectNodeHeartbeat(hb,record)).toBe(true);expect(hb.load).toEqual({inFlight:1,capacity:4})});
});
