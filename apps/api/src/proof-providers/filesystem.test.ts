import {afterEach,describe,expect,it} from "vitest";
import {mkdtemp,rm,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {FilesystemProofProvider} from "./filesystem.js";

const dirs:string[]=[];
afterEach(async()=>{await Promise.all(dirs.splice(0).map(dir=>rm(dir,{recursive:true,force:true})))});
const sha=(value:string|Buffer)=>crypto.createHash("sha256").update(value).digest("hex");

describe("FilesystemProofProvider",()=>{
  it("proves file existence size and exact content digest without authority",async()=>{
    const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-fs-proof-"));dirs.push(dir);
    const file=path.join(dir,"state.txt"),body="verified-state\n";await writeFile(file,body,"utf8");
    const provider=new FilesystemProofProvider([dir]);
    const result=await provider.observe({requestId:"request-filesystem-1",providerId:provider.descriptor.id,operation:"READ",phase:"POST_STATE",targetRef:file,expectedState:["exists",`size:${Buffer.byteLength(body)}`,`sha256:${sha(body)}`],correlationRefs:[],timeoutMs:1000,authority:false});
    expect(result.proposedOutcome).toBe("SUCCESS");expect(result.conclusive).toBe(true);expect(result.authority).toBe(false);expect(result.mayMintExecutionAuthority).toBe(false);
    expect(result.observations.some(x=>x.kind==="FILESYSTEM_SHA256"&&x.digest===sha(body))).toBe(true);
  });

  it("fails closed for a canonical target outside allowed roots",async()=>{
    const allowed=await mkdtemp(path.join(os.tmpdir(),"cieav-fs-proof-allowed-")),outside=await mkdtemp(path.join(os.tmpdir(),"cieav-fs-proof-outside-"));dirs.push(allowed,outside);
    const file=path.join(outside,"secret.txt");await writeFile(file,"outside","utf8");
    const provider=new FilesystemProofProvider([allowed]);
    const result=await provider.observe({requestId:"request-filesystem-2",providerId:provider.descriptor.id,operation:"READ",phase:"POST_STATE",targetRef:file,expectedState:["exists"],correlationRefs:[],timeoutMs:1000,authority:false});
    expect(result.conclusive).toBe(false);expect(result.error).toContain("filesystem_proof_target_outside_allowed_roots");expect(result.observations).toEqual([]);
  });

  it("does not claim a conclusive outcome for unknown expectation syntax",async()=>{
    const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-fs-proof-"));dirs.push(dir);const file=path.join(dir,"state.txt");await writeFile(file,"x","utf8");
    const provider=new FilesystemProofProvider([dir]);
    const result=await provider.observe({requestId:"request-filesystem-3",providerId:provider.descriptor.id,operation:"READ",phase:"RECONCILIATION",targetRef:file,expectedState:["semantic:looks-good"],correlationRefs:[],timeoutMs:1000,authority:false});
    expect(result.conclusive).toBe(false);expect(result.proposedOutcome).toBeUndefined();
  });
});
