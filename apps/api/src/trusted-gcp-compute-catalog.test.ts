import {describe,expect,it} from "vitest";
import {mkdtempSync,writeFileSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {GcpComputeStopArgsSchema,TrustedGcpComputeToolConfigSchema,gcpComputeDownstreamRef,gcpComputeTarget,loadTrustedGcpComputeAdaptersSync} from "./trusted-gcp-compute-adapter.js";

describe("trusted GCP Compute catalog",()=>{
 const config={toolId:"prod-gce-stop",project:"cieav-prod-123",zone:"us-central1-a",instance:"api-vm-01",bearerTokenEnv:"CIEAV_GCP_EXEC_TOKEN",timeoutMs:5000,maxResponseBytes:65536};
 it("binds exact instance and credential principal",()=>{const c=TrustedGcpComputeToolConfigSchema.parse(config);expect(gcpComputeTarget(c)).toBe("gcp-compute-instance:cieav-prod-123:us-central1-a:api-vm-01");expect(gcpComputeDownstreamRef(c)).toMatch(/^gcp\+compute:[a-f0-9]{64}$/);expect(gcpComputeDownstreamRef({...c,bearerTokenEnv:"OTHER_TOKEN"})).not.toBe(gcpComputeDownstreamRef(c))});
 it("exposes only expected RUNNING prestate dynamically",()=>{expect(GcpComputeStopArgsSchema.parse({expectedStatus:"RUNNING"})).toEqual({expectedStatus:"RUNNING"});for(const raw of [{expectedStatus:"TERMINATED"},{expectedStatus:"RUNNING",noGracefulShutdown:true},{expectedStatus:"RUNNING",discardLocalSsd:true},{expectedStatus:"RUNNING",instance:"other"}])expect(GcpComputeStopArgsSchema.safeParse(raw).success).toBe(false)});
 it("discovers GCP as one first-class adapter",()=>{const dir=mkdtempSync(path.join(os.tmpdir(),"cieav-gcp-catalog-")),file=path.join(dir,"execution-adapters.json");writeFileSync(file,JSON.stringify({version:1,gcpCompute:[config]}));const adapters=loadTrustedGcpComputeAdaptersSync(dir,{CIEAV_EXECUTION_ADAPTERS_FILE:file,CIEAV_GCP_EXEC_TOKEN:"opaque-token"});expect(adapters).toHaveLength(1);expect(adapters[0]?.protocol).toBe("GCP")});
});
