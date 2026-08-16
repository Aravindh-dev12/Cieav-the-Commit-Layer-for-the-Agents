import {describe,expect,it} from "vitest";
import {ProviderReliabilityManager,createInferenceReceipt,providerKey} from "./reliability.js";

describe("CIEAV Model Fabric reliability",()=>{
  it("opens after repeated failures and recovers through one half-open probe",()=>{
    let now=1_000;
    const r=new ProviderReliabilityManager({failureThreshold:2,cooldownMs:100,maxConcurrent:2},()=>now);
    const key=providerKey("http://127.0.0.1:8000/v1","primary");
    r.failure(key,"boom-1");
    expect(r.snapshot(key).state).toBe("CLOSED");
    r.failure(key,"boom-2");
    expect(r.snapshot(key).state).toBe("OPEN");
    expect(r.acquire(key)).toMatchObject({ok:false,reason:"circuit_open"});
    now+=101;
    const probe=r.acquire(key);
    expect(probe).toMatchObject({ok:true,state:"HALF_OPEN"});
    expect(r.acquire(key)).toMatchObject({ok:false,reason:"half_open_probe_in_flight"});
    if(probe.ok)probe.release();
    r.success(key);
    expect(r.snapshot(key)).toMatchObject({state:"CLOSED",consecutiveFailures:0});
  });

  it("enforces per-provider concurrency without mutating authority",()=>{
    const r=new ProviderReliabilityManager({failureThreshold:3,cooldownMs:100,maxConcurrent:1});
    const key=providerKey("https://inference.example.test/v1","fast");
    const first=r.acquire(key);
    expect(first.ok).toBe(true);
    expect(r.acquire(key)).toMatchObject({ok:false,reason:"concurrency_limit"});
    if(first.ok)first.release();
    expect(r.acquire(key).ok).toBe(true);
  });

  it("creates explicitly non-authoritative inference receipts",()=>{
    const receipt=createInferenceReceipt({requestId:"req-1",role:"primary",model:"Qwen/Qwen3.6-35B-A3B",modelRevision:"rev-1",modelDigest:"a".repeat(64),protocolVersion:"cieav-private-inference-v1",startedAt:1000,completedAt:1250,ok:true,fallbackUsed:false,degraded:false,circuitState:"CLOSED"});
    expect(receipt.receiptType).toBe("CIEAV_INFERENCE_RECEIPT");
    expect(receipt.latencyMs).toBe(250);
    expect(receipt.zeroRetention).toBe(true);
    expect(receipt.executionAuthority).toBe(false);
    expect(receipt.modelDigest).toBe("a".repeat(64));
  });
});
