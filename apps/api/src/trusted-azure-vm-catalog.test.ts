import {describe,expect,it} from "vitest";
import {mkdtempSync,writeFileSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {AzureVmDeallocateArgsSchema,TrustedAzureVmToolConfigSchema,azureVmDownstreamRef,azureVmTarget,loadTrustedAzureVmAdaptersSync} from "./trusted-azure-vm-adapter.js";

describe("trusted Azure VM catalog",()=>{
  const config={toolId:"prod-vm-deallocate",subscriptionId:"11111111-2222-4333-8444-555555555555",resourceGroup:"prod-rg",vmName:"api-vm-01",bearerTokenEnv:"CIEAV_AZURE_EXEC_TOKEN",timeoutMs:5000,maxResponseBytes:65536};
  it("binds exact VM identity and credential principal",()=>{const parsed=TrustedAzureVmToolConfigSchema.parse(config);expect(azureVmTarget(parsed)).toBe("azure-vm:11111111-2222-4333-8444-555555555555:prod-rg:api-vm-01");expect(azureVmDownstreamRef(parsed)).toMatch(/^azure\+arm:[a-f0-9]{64}$/);expect(azureVmDownstreamRef({...parsed,bearerTokenEnv:"OTHER_TOKEN"})).not.toBe(azureVmDownstreamRef(parsed))});
  it("exposes only expected running prestate as dynamic authority",()=>{expect(AzureVmDeallocateArgsSchema.parse({expectedPowerState:"PowerState/running"})).toEqual({expectedPowerState:"PowerState/running"});for(const raw of [{expectedPowerState:"PowerState/deallocated"},{expectedPowerState:"PowerState/running",hibernate:true},{expectedPowerState:"PowerState/running",vmName:"other"}])expect(AzureVmDeallocateArgsSchema.safeParse(raw).success).toBe(false)});
  it("discovers Azure as one first-class adapter",()=>{const dir=mkdtempSync(path.join(os.tmpdir(),"cieav-azure-catalog-")),file=path.join(dir,"execution-adapters.json");writeFileSync(file,JSON.stringify({version:1,azureVm:[config]}));const adapters=loadTrustedAzureVmAdaptersSync(dir,{CIEAV_EXECUTION_ADAPTERS_FILE:file,CIEAV_AZURE_EXEC_TOKEN:"opaque-token"});expect(adapters).toHaveLength(1);expect(adapters[0]?.protocol).toBe("AZURE")});
});
