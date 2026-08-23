import crypto from "node:crypto";
import {mkdtempSync,writeFileSync,rmSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {afterEach,describe,expect,it} from "vitest";
import {loadTrustedCliAdaptersSync} from "./trusted-cli-adapter.js";
import {TrustedKubernetesAdapter,kubernetesDeploymentDownstreamRef,kubernetesDeploymentTarget} from "./trusted-kubernetes-adapter.js";

const dirs:string[]=[];
afterEach(()=>{for(const d of dirs.splice(0))rmSync(d,{recursive:true,force:true})});
const sha256=(v:Buffer|string)=>crypto.createHash("sha256").update(v).digest("hex");
function fixture(){const dir=mkdtempSync(path.join(os.tmpdir(),"cieav-k8s-catalog-"));dirs.push(dir);const caFile=path.join(dir,"ca.pem"),caBytes=Buffer.from("qualification-only-ca-fixture\n");writeFileSync(caFile,caBytes);const config={toolId:"deploy-api-image",serverUrl:"https://kubernetes.example.test/",serverIp:"192.0.2.10",caFile,caSha256:sha256(caBytes),bearerTokenEnv:"CIEAV_K8S_EXEC_TOKEN",namespace:"production",deployment:"api",container:"api",timeoutMs:1000,maxResponseBytes:65536};const catalog=path.join(dir,"execution-adapters.json");writeFileSync(catalog,JSON.stringify({version:1,kubernetes:[config]}));return{dir,catalog,config}}

describe("Kubernetes execution catalog",()=>{
  it("discovers a first-class Kubernetes adapter through the shared trusted catalog",()=>{const f=fixture(),env={CIEAV_EXECUTION_ADAPTERS_FILE:f.catalog,CIEAV_K8S_EXEC_TOKEN:"test-token"};const adapters=loadTrustedCliAdaptersSync(f.dir,env);expect(adapters).toHaveLength(1);expect(adapters[0]).toBeInstanceOf(TrustedKubernetesAdapter);expect(adapters[0]!.protocol).toBe("KUBERNETES")});
  it("binds endpoint, namespace, deployment and container identity without binding bearer secret material",()=>{const f=fixture(),base=f.config as any,target=kubernetesDeploymentTarget(base),downstream=kubernetesDeploymentDownstreamRef(base);expect(target).toMatch(/^k8s-deployment:[a-f0-9]{64}$/);expect(downstream).toMatch(/^k8s\+https:[a-f0-9]{64}$/);expect(kubernetesDeploymentTarget({...base,container:"worker"})).not.toBe(target);expect(kubernetesDeploymentTarget({...base,serverIp:"192.0.2.11"})).not.toBe(target);expect(kubernetesDeploymentDownstreamRef({...base,bearerTokenEnv:"OTHER_TOKEN"})).not.toBe(downstream);expect(target).not.toContain("test-token");expect(downstream).not.toContain("test-token")});
});
