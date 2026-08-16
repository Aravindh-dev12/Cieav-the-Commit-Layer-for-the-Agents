import crypto from "node:crypto";
import {describe,expect,it} from "vitest";
import type {EffectNodeAdvertisement,EffectNodeRecord} from "@cieav/contracts";
import {deriveEffectNodeState,effectNodeCapabilityDigest,filterEffectNodeCapabilities,verifyEffectNodeAdvertisement,verifyEffectNodeHeartbeat} from "./effect-node.js";

function fixture(){
  const {publicKey,privateKey}=crypto.generateKeyPairSync("ed25519"),nodeId="00000000-0000-4000-8000-000000000101",capabilities=[{id:"process",kind:"PROCESS" as const,operations:["process.run","process.status"],roots:[],hosts:[],commands:["npm"],maxRuntimeMs:60000,metadata:{}},{id:"browser",kind:"BROWSER" as const,operations:["browser.navigate"],roots:[],hosts:["example.com"],commands:[],metadata:{}}];
  const advertisement:EffectNodeAdvertisement={version:1,nodeId,installId:"install-effect-node-01",displayName:"Build Node",platform:"WINDOWS",architecture:"x64",runtimeVersion:"0.8.0",publicKey:publicKey.export({type:"spki",format:"pem"}).toString(),capabilities,issuedAt:"2026-08-16T12:00:00.000Z",nonce:"n".repeat(32)};
  const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value as Record<string,unknown>).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(",")}}`:JSON.stringify(value);
  return{advertisement,privateKey,sign:(value:unknown)=>crypto.sign(null,Buffer.from(canonical(value)),privateKey).toString("base64url")};
}

describe("CIEAV Effect Node core",()=>{
  it("verifies signed advertisements and rejects mutation",()=>{const f=fixture(),signed={advertisement:f.advertisement,signature:f.sign(f.advertisement),signatureAlgorithm:"ed25519" as const};expect(verifyEffectNodeAdvertisement(signed)).toBe(true);expect(verifyEffectNodeAdvertisement({...signed,advertisement:{...f.advertisement,displayName:"Mutated"}})).toBe(false)});
  it("verifies heartbeat identity and capability digest",()=>{const f=fixture(),payload={nodeId:f.advertisement.nodeId,observedAt:"2026-08-16T12:00:10.000Z",runtimeVersion:"0.8.0",capabilityDigest:effectNodeCapabilityDigest(f.advertisement.capabilities),load:{inFlight:1,capacity:4},nonce:"h".repeat(32)},heartbeat={...payload,signature:f.sign(payload),signatureAlgorithm:"ed25519" as const},record={nodeId:f.advertisement.nodeId,publicKey:f.advertisement.publicKey};expect(verifyEffectNodeHeartbeat(heartbeat,record)).toBe(true);expect(verifyEffectNodeHeartbeat({...heartbeat,nodeId:"00000000-0000-4000-8000-000000000102"},record)).toBe(false)});
  it("derives liveness without bypassing quarantine",()=>{const base={state:"ONLINE" as const,lastSeenAt:"2026-08-16T12:00:00.000Z"};expect(deriveEffectNodeState(base,new Date("2026-08-16T12:00:20.000Z"))).toBe("ONLINE");expect(deriveEffectNodeState(base,new Date("2026-08-16T12:00:45.000Z"))).toBe("DEGRADED");expect(deriveEffectNodeState(base,new Date("2026-08-16T12:02:00.000Z"))).toBe("OFFLINE");expect(deriveEffectNodeState({state:"QUARANTINED",lastSeenAt:base.lastSeenAt},new Date("2026-08-16T12:00:01.000Z"))).toBe("QUARANTINED")});
  it("only narrows advertised capabilities",()=>{const f=fixture(),filtered=filterEffectNodeCapabilities(f.advertisement.capabilities,{allowedKinds:["PROCESS"],allowedOperations:["process.status"]});expect(filtered).toHaveLength(1);expect(filtered[0]?.operations).toEqual(["process.status"]);expect(filtered[0]?.commands).toEqual(["npm"])});
});
