import {afterEach,describe,expect,it} from "vitest";
import {mkdtemp,rm,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {CieavLocalProofProviderRuntime} from "./proof-provider-runtime.js";

const dirs:string[]=[];
afterEach(async()=>{await Promise.all(dirs.splice(0).map(dir=>rm(dir,{recursive:true,force:true})))});

describe("CieavLocalProofProviderRuntime",()=>{
  it("registers configured providers with zero authority and dispatches observations",async()=>{
    const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-proof-runtime-"));dirs.push(dir);const file=path.join(dir,"ready.txt");await writeFile(file,"ready","utf8");
    const runtime=new CieavLocalProofProviderRuntime({filesystemRoots:[dir]});
    expect(runtime.list().map(x=>x.id)).toEqual(["cieav.filesystem-proof.v1"]);
    const health=await runtime.health();expect(health[0]?.ok).toBe(true);expect(health[0]?.authority).toBe(false);
    const result=await runtime.observe({requestId:"request-proof-runtime-1",providerId:"cieav.filesystem-proof.v1",operation:"READ",phase:"POST_STATE",targetRef:file,expectedState:["exists","type:file"],correlationRefs:[],timeoutMs:1000,authority:false});
    expect(result.proposedOutcome).toBe("SUCCESS");expect(result.authority).toBe(false);expect(result.mayMintExecutionAuthority).toBe(false);
  });

  it("fails closed for an unconfigured provider",async()=>{
    const runtime=new CieavLocalProofProviderRuntime();
    await expect(runtime.observe({requestId:"request-proof-runtime-2",providerId:"cieav.filesystem-proof.v1",operation:"READ",phase:"POST_STATE",targetRef:"/tmp/none",expectedState:[],correlationRefs:[],timeoutMs:1000,authority:false})).rejects.toThrow("proof_provider_not_found");
  });
});
