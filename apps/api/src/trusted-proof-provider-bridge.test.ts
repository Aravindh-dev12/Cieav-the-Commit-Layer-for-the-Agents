import crypto from "node:crypto";
import {mkdtemp,rm,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach,describe,expect,it} from "vitest";
import {ProofCaseSchema} from "@cieav/contracts/proof";
import {CieavProofApi} from "./proof-api.js";
import {CieavLocalProofProviderRuntime} from "./proof-provider-runtime.js";
import {CieavTrustedProofProviderBridge} from "./trusted-proof-provider-bridge.js";

const dirs:string[]=[];
afterEach(async()=>{await Promise.all(dirs.splice(0).map(dir=>rm(dir,{recursive:true,force:true})))});
const deviceId="dev_proof_bridge_12345678";
const intentId="33333333-3333-4333-8333-333333333333";

async function setup(){
  const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-proof-bridge-"));dirs.push(dir);
  const target=path.join(dir,"result.txt"),body=Buffer.from("governed-result-v1\n","utf8");await writeFile(target,body);
  const digest=crypto.createHash("sha256").update(body).digest("hex");
  const reality={store:{getLoop:async()=>null,saveLoop:async()=>{throw new Error("unexpected_open_loop_write")}}} as any;
  const receipts={} as any;
  const proofApi=new CieavProofApi(path.join(dir,"proof.json"),"p".repeat(64),reality,receipts);
  const at=new Date().toISOString();
  const proof=ProofCaseSchema.parse({
    id:crypto.randomUUID(),intentId,
    plan:{expectedState:[`sha256:${digest}`],requirements:[{kind:"FILESYSTEM",required:true,minConfidence:.8}]},
    observations:[],
    assessment:{status:"PENDING",confidence:0,evaluatedAt:at,supporting:[],contradicting:[],neutral:[],missingRequired:["FILESYSTEM"],warnings:[]},
    createdAt:at,updatedAt:at
  });
  await proofApi.store.save(deviceId,proof);
  const runtime=new CieavLocalProofProviderRuntime({filesystemRoots:[dir]});
  const bridge=new CieavTrustedProofProviderBridge(runtime,proofApi);
  return{dir,target,digest,proofApi,runtime,bridge,proof};
}

describe("CieavTrustedProofProviderBridge",()=>{
  it("attaches qualified filesystem evidence with CIEAV-owned trusted provenance",async()=>{
    const x=await setup();
    const result=await x.bridge.observeAndAttach(deviceId,x.proof.id,{
      requestId:"proof-request-12345678",providerId:"cieav.filesystem-proof.v1",operation:"READ",phase:"POST_STATE",targetRef:x.target,expectedState:[`sha256:${x.digest}`],timeoutMs:5000
    });
    expect(result.proof.assessment.status).toBe("PROVEN");
    expect(result.proof.observations).toHaveLength(1);
    expect(result.proof.observations[0]?.kind).toBe("FILESYSTEM");
    expect(result.proof.observations[0]?.signal).toBe("SUPPORTS");
    expect(result.proof.observations[0]?.provenance).toBe("TRUSTED_ADAPTER");
    expect(result.proof.observations[0]?.source).toBe("qualified-proof-provider:cieav.filesystem-proof.v1");
    await x.proofApi.store.close();
  });

  it("does not allow pre-state observations to masquerade as settlement proof",async()=>{
    const x=await setup();
    await expect(x.bridge.observeAndAttach(deviceId,x.proof.id,{
      requestId:"proof-request-12345679",providerId:"cieav.filesystem-proof.v1",operation:"READ",phase:"PRE_STATE",targetRef:x.target,expectedState:[`sha256:${x.digest}`],timeoutMs:5000
    })).rejects.toThrow("trusted_settlement_proof_requires_post_state_or_reconciliation");
    expect((await x.proofApi.store.get(deviceId,x.proof.id))?.observations).toEqual([]);
    await x.proofApi.store.close();
  });

  it("does not auto-trust an arbitrary provider id for authority-grade settlement",async()=>{
    const x=await setup();
    await expect(x.bridge.observeAndAttach(deviceId,x.proof.id,{
      requestId:"proof-request-12345680",providerId:"third-party.self-asserted.v1",operation:"READ",phase:"POST_STATE",targetRef:x.target,expectedState:[`sha256:${x.digest}`],timeoutMs:5000
    })).rejects.toThrow("proof_provider_not_qualified_for_trusted_settlement");
    await x.proofApi.store.close();
  });

  it("preserves non-conclusive provider results as neutral evidence instead of success",async()=>{
    const x=await setup();
    const result=await x.bridge.observeAndAttach(deviceId,x.proof.id,{
      requestId:"proof-request-12345681",providerId:"cieav.filesystem-proof.v1",operation:"READ",phase:"RECONCILIATION",targetRef:x.target,expectedState:["unsupported-predicate"],timeoutMs:5000
    });
    expect(result.proof.observations[0]?.signal).toBe("NEUTRAL");
    expect(result.proof.assessment.status).not.toBe("PROVEN");
    await x.proofApi.store.close();
  });
});
