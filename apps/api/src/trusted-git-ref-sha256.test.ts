import {afterEach,describe,expect,it} from "vitest";
import crypto from "node:crypto";
import {execFile,execFileSync} from "node:child_process";
import {realpathSync} from "node:fs";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {promisify} from "node:util";
import {TrustedGitRefAdapter,gitRefDownstreamRef,gitRefTarget} from "./trusted-git-ref-adapter.js";
import {GitRefProofProvider} from "./proof-providers/git-ref.js";
import type {TrustedDispatchContext} from "./execution-router.js";

const run=promisify(execFile),dirs:string[]=[],normalize=(value:string)=>process.platform==="win32"?value.toLowerCase():value;
afterEach(async()=>{await Promise.all(dirs.splice(0).map(dir=>rm(dir,{recursive:true,force:true})))});
function gitBinary(){const raw=process.platform==="win32"?execFileSync("where.exe",["git.exe"],{encoding:"utf8"}).split(/\r?\n/)[0]!:execFileSync("which",["git"],{encoding:"utf8"}).trim();return realpathSync(raw)}
async function sha(file:string){return crypto.createHash("sha256").update(await readFile(file)).digest("hex")}
const hash=(value:string)=>crypto.createHash("sha256").update(value).digest("hex");

describe("Git SHA-256 object-format consequence path",()=>{
  it("advances and independently proves a 64-hex branch ref",async()=>{const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-git-sha256-"));dirs.push(dir);try{await run("git",["-C",dir,"init","-q","--object-format=sha256"])}catch(error:any){if(String(error?.stderr??error?.message??error).match(/object-format|unknown option|unsupported/i))return;throw error}await run("git",["-C",dir,"config","user.email","cieav-test@example.invalid"]);await run("git",["-C",dir,"config","user.name","CIEAV Test"]);await writeFile(path.join(dir,"state.txt"),"one\n");await run("git",["-C",dir,"add","state.txt"]);await run("git",["-C",dir,"commit","-q","-m","one"]);const old=(await run("git",["-C",dir,"rev-parse","HEAD"],{encoding:"utf8"})).stdout.trim(),ref=(await run("git",["-C",dir,"symbolic-ref","HEAD"],{encoding:"utf8"})).stdout.trim(),gitDir=realpathSync((await run("git",["-C",dir,"rev-parse","--absolute-git-dir"],{encoding:"utf8"})).stdout.trim());expect(old).toMatch(/^[a-f0-9]{64}$/);await writeFile(path.join(dir,"state.txt"),"two\n");await run("git",["-C",dir,"add","state.txt"]);await run("git",["-C",dir,"commit","-q","-m","two"]);const next=(await run("git",["-C",dir,"rev-parse","HEAD"],{encoding:"utf8"})).stdout.trim();await run("git",["-C",dir,"update-ref",ref,old,next]);const bin=gitBinary(),config={toolId:"git-sha256",repository:dir,gitDir,ref,gitBinary:bin,gitBinarySha256:await sha(bin),requireFastForward:true,timeoutMs:5000,maxStdoutBytes:65536,maxStderrBytes:65536},target=gitRefTarget(config),ctx={ticket:{id:crypto.randomUUID(),status:"CONSUMED"},proposal:{id:crypto.randomUUID(),operation:"GIT_ADVANCE_REF",target},tool:{id:config.toolId,protocol:"GIT",operation:"GIT_ADVANCE_REF",downstreamRef:gitRefDownstreamRef(config),credentialMode:"NONE",executionMode:"ONESHOT"},normalizedArguments:{expectedOldOid:old,newCommitOid:next}} as unknown as TrustedDispatchContext,result=await new TrustedGitRefAdapter([config]).execute(ctx);expect(result.transport).toBe("ACCEPTED");const proofTarget={id:"sha256-proof",repository:dir,gitDir,ref,gitBinary:bin,gitBinarySha256:config.gitBinarySha256,timeoutMs:5000,maxOutputBytes:65536},proofRef=`git-ref:${hash(`${normalize(realpathSync(dir))}\n${normalize(gitDir)}`)}:${encodeURIComponent(ref)}`,provider=new GitRefProofProvider([proofTarget]),proof=await provider.observe({requestId:crypto.randomUUID(),providerId:provider.descriptor.id,operation:"GIT_REF",phase:"POST_STATE",targetRef:proofRef,expectedState:[`ref-oid:${next}`,`ancestor:${old}`],correlationRefs:[],timeoutMs:5000,authority:false});expect(proof.proposedOutcome).toBe("SUCCESS");expect(proof.conclusive).toBe(true);expect(proof.authority).toBe(false)});
});
