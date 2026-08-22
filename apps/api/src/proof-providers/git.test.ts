import {afterEach,describe,expect,it} from "vitest";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {mkdtemp,rm,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {GitProofProvider} from "./git.js";

const run=promisify(execFile),dirs:string[]=[];
afterEach(async()=>{await Promise.all(dirs.splice(0).map(dir=>rm(dir,{recursive:true,force:true})))});
async function repo(){const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-git-proof-"));dirs.push(dir);await run("git",["-C",dir,"init","-q"]);await run("git",["-C",dir,"config","user.email","cieav-test@example.invalid"]);await run("git",["-C",dir,"config","user.name","CIEAV Test"]);await writeFile(path.join(dir,"state.txt"),"ready\n","utf8");await run("git",["-C",dir,"add","state.txt"]);await run("git",["-C",dir,"commit","-q","-m","initial"]);const {stdout}=await run("git",["-C",dir,"rev-parse","HEAD"],{encoding:"utf8"});return{dir,head:String(stdout).trim()}}

describe("GitProofProvider",()=>{
  it("proves exact committed HEAD and clean working tree without authority",async()=>{const {dir,head}=await repo(),provider=new GitProofProvider([dir]),result=await provider.observe({requestId:"request-git-proof-1",providerId:provider.descriptor.id,operation:"READ",phase:"POST_STATE",targetRef:dir,expectedState:[`head:${head}`,"clean"],correlationRefs:[],timeoutMs:2000,authority:false});expect(result.proposedOutcome).toBe("SUCCESS");expect(result.conclusive).toBe(true);expect(result.authority).toBe(false);expect(result.mayMintExecutionAuthority).toBe(false);expect(result.observations.some(x=>x.kind==="GIT_HEAD")).toBe(true)});

  it("detects a dirty working tree as deterministic failure against clean expectation",async()=>{const {dir}=await repo();await writeFile(path.join(dir,"state.txt"),"changed\n","utf8");const provider=new GitProofProvider([dir]),result=await provider.observe({requestId:"request-git-proof-2",providerId:provider.descriptor.id,operation:"READ",phase:"RECONCILIATION",targetRef:dir,expectedState:["clean"],correlationRefs:[],timeoutMs:2000,authority:false});expect(result.proposedOutcome).toBe("FAILURE");expect(result.conclusive).toBe(true)});

  it("fails closed for a repository outside the explicit allowlist",async()=>{const allowed=await repo(),outside=await repo(),provider=new GitProofProvider([allowed.dir]),result=await provider.observe({requestId:"request-git-proof-3",providerId:provider.descriptor.id,operation:"READ",phase:"POST_STATE",targetRef:outside.dir,expectedState:["clean"],correlationRefs:[],timeoutMs:2000,authority:false});expect(result.conclusive).toBe(false);expect(result.error).toContain("git_proof_repository_not_allowed");expect(result.observations).toEqual([])});

  it("does not claim a conclusive outcome for unknown expectation syntax",async()=>{const {dir}=await repo(),provider=new GitProofProvider([dir]),result=await provider.observe({requestId:"request-git-proof-4",providerId:provider.descriptor.id,operation:"READ",phase:"POST_STATE",targetRef:dir,expectedState:["semantic:good-commit"],correlationRefs:[],timeoutMs:2000,authority:false});expect(result.conclusive).toBe(false);expect(result.proposedOutcome).toBeUndefined()});
});
