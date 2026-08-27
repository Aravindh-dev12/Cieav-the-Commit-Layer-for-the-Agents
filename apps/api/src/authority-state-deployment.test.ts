import {describe,expect,it} from "vitest";
import {authorityStateHealth,loadAuthorityStateDeployment} from "./authority-state-deployment.js";

const base=():NodeJS.ProcessEnv=>({CIEAV_CONSEQUENCE_ALGEBRA_STORE:"file",CIEAV_AUTHORITY_REPLICAS:"1"});

describe("CIEAV authority state deployment",()=>{
  it("defaults to a truthful single-writer file topology",()=>{const d=loadAuthorityStateDeployment(base());expect(d).toMatchObject({mode:"single-writer-file",replicas:1,consequenceAlgebraStore:"file",safeForRequestedTopology:true,authority:false,mayMintExecutionAuthority:false});expect(authorityStateHealth(d).clusterHaQualified).toBe(false)});
  it("rejects multiple file-backed authority replicas",()=>{expect(()=>loadAuthorityStateDeployment({...base(),CIEAV_AUTHORITY_REPLICAS:"2"})).toThrow(/single-writer only/)});
  it("rejects unsupported authority replica counts",()=>{expect(()=>loadAuthorityStateDeployment({...base(),CIEAV_AUTHORITY_REPLICAS:"0"})).toThrow(/between 1 and 1024/)});
  it("requires the sqlite store for single-host sqlite mode",()=>{expect(()=>loadAuthorityStateDeployment({...base(),CIEAV_AUTHORITY_STATE_MODE:"single-host-sqlite"})).toThrow(/requires CIEAV_CONSEQUENCE_ALGEBRA_STORE=sqlite/)});
  it("does not allow multiple sqlite replicas without an explicit shared-host qualification claim",()=>{expect(()=>loadAuthorityStateDeployment({...base(),CIEAV_CONSEQUENCE_ALGEBRA_STORE:"sqlite",CIEAV_AUTHORITY_STATE_MODE:"single-host-sqlite",CIEAV_AUTHORITY_REPLICAS:"2"})).toThrow(/qualified shared host/)});
  it("still identifies shared-host sqlite as non-cluster HA",()=>{const d=loadAuthorityStateDeployment({...base(),CIEAV_CONSEQUENCE_ALGEBRA_STORE:"sqlite",CIEAV_AUTHORITY_STATE_MODE:"single-host-sqlite",CIEAV_AUTHORITY_REPLICAS:"2",CIEAV_AUTHORITY_SHARED_HOST:"1"});expect(d.safeForRequestedTopology).toBe(true);expect(authorityStateHealth(d)).toMatchObject({mode:"single-host-sqlite",replicas:2,clusterHaQualified:false,authority:false})});
  it("refuses cluster-ha even when a backend name is supplied until a replicated backend exists",()=>{expect(()=>loadAuthorityStateDeployment({...base(),CIEAV_AUTHORITY_STATE_MODE:"cluster-ha",CIEAV_AUTHORITY_REPLICAS:"3",CIEAV_AUTHORITY_CLUSTER_BACKEND:"future-replicated-store"})).toThrow(/not implemented.*refusing unsafe startup/i)});
  it("requires a named backend for any cluster-ha request",()=>{expect(()=>loadAuthorityStateDeployment({...base(),CIEAV_AUTHORITY_STATE_MODE:"cluster-ha",CIEAV_AUTHORITY_REPLICAS:"3"})).toThrow(/requires CIEAV_AUTHORITY_CLUSTER_BACKEND/)});
});
