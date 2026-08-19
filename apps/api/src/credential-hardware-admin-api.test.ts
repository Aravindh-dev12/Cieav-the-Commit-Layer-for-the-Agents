import {Readable} from "node:stream";
import {mkdtemp} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {IncomingMessage} from "node:http";
import {describe,expect,it} from "vitest";
import {CieavAgentKernelStore} from "./agent-kernel.js";
import {CieavCredentialHardwareAdminApi} from "./credential-hardware-admin-api.js";

function request(method:string,body?:unknown):IncomingMessage{const input=body===undefined?[]:[Buffer.from(JSON.stringify(body))],req=Readable.from(input) as unknown as IncomingMessage;(req as any).method=method;return req}
async function fixture(){const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-admin-")),store=new CieavAgentKernelStore(path.join(dir,"agent-kernel.json"),"a".repeat(64));return{store,api:new CieavCredentialHardwareAdminApi(store)}}

describe("CieavCredentialHardwareAdminApi",()=>{
  it("mounts software credential lifecycle only beneath the Agent Kernel gateway namespace",async()=>{const {api}=await fixture();const created=await api.handle(request("POST",{alias:"gateway-dpop",purposes:["DPOP"]}),"/v1/agent-kernel/credential-authority/keys");expect(created?.status).toBe(201);expect((created?.body as any).key).toMatchObject({alias:"gateway-dpop",hardwareBacked:false,exportable:false});const listed=await api.handle(request("GET"),"/v1/agent-kernel/credential-authority/keys");expect((listed?.body as any).keys).toHaveLength(1);expect(await api.handle(request("GET"),"/v1/credential-authority/keys")).toBeNull()});

  it("reports that raw verified hardware evidence cannot be imported",async()=>{const {api}=await fixture();const runtime=await api.handle(request("GET"),"/v1/agent-kernel/hardware-key-providers/runtime");expect(runtime?.status).toBe(200);expect((runtime?.body as any).rawVerifiedAttestationImport).toBe(false);expect(await api.handle(request("POST",{verification:"VERIFIED"}),"/v1/agent-kernel/hardware-key-providers/attestations")).toBeNull()});

  it("keeps Linux hardware assurance fail-closed until a deployment verifier exists",async()=>{const {api}=await fixture();const result=await api.handle(request("POST",{}),"/v1/agent-kernel/hardware-key-providers/linux/attest");expect(result).toMatchObject({status:501,body:{error:"linux_hardware_attestation_verifier_required"}})});

  it("does not allow registration without verifier-produced attestation evidence",async()=>{const {api}=await fixture();const result=await api.handle(request("POST",{id:"11111111-1111-4111-8111-111111111111",version:1,alias:"unattested",provider:"TPM",providerManifestId:"missing",attestationId:"22222222-2222-4222-8222-222222222222",providerKeyRef:"opaque",algorithm:"ES256",publicJwk:{kty:"EC",crv:"P-256",x:"x",y:"y"},publicKeyFingerprint:"a".repeat(64),purposes:["DPOP"],hardwareBacked:true,exportable:false,createdAt:new Date().toISOString()}),"/v1/agent-kernel/hardware-key-providers/keys");expect(result?.status).toBe(409);expect(String((result?.body as any).error)).toContain("hardware_provider_manifest_not_found")});
});
