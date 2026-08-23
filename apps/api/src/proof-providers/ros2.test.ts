import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {Ros2ProofProvider,ros2ProofTargetRef,type Ros2ProofTarget} from "./ros2.js";

const sha256=(value:Buffer|string)=>crypto.createHash("sha256").update(value).digest("hex");
const sample="data: ready\n---";
function target(script=`process.stdout.write(${JSON.stringify(sample)})`):Ros2ProofTarget{return{id:"robot-state",rosName:"/robot/state",rosType:"std_msgs/msg/String",command:process.execPath,commandSha256:sha256(readFileSync(process.execPath)),prefixArgs:["-e",script],prefixFilePins:[],staticEnv:{},timeoutMs:2000,maxStdoutBytes:4096,maxStderrBytes:4096}}
function request(expectedState:string[],operation="READ"){return{requestId:"ros2-proof-request-0001",providerId:"cieav.ros2-proof.v1",operation,phase:"POST_STATE" as const,targetRef:ros2ProofTargetRef("robot-state"),expectedState,correlationRefs:[],timeoutMs:2000,authority:false as const}}

describe("Ros2ProofProvider",()=>{
  it("settles an exact live topic sample digest without execution authority",async()=>{const provider=new Ros2ProofProvider([target()]),result=await provider.observe(request([`stdout-sha256:${sha256(sample)}`,"nonempty"]));expect(result.proposedOutcome).toBe("SUCCESS");expect(result.conclusive).toBe(true);expect(result.authority).toBe(false);expect(result.mayMintExecutionAuthority).toBe(false);expect(result.observations[0]?.kind).toBe("ROS2_TOPIC_SAMPLE")});
  it("returns conclusive failure on recognized state contradiction",async()=>{const provider=new Ros2ProofProvider([target()]),result=await provider.observe(request([`stdout-sha256:${"0".repeat(64)}`]));expect(result.proposedOutcome).toBe("FAILURE");expect(result.conclusive).toBe(true)});
  it("does not invent an outcome for unknown predicates",async()=>{const provider=new Ros2ProofProvider([target()]),result=await provider.observe(request(["semantic-state:ready"]));expect(result.proposedOutcome).toBeUndefined();expect(result.conclusive).toBe(false)});
  it("rejects non-read-only requested operations",async()=>{const provider=new Ros2ProofProvider([target()]),result=await provider.observe(request(["nonempty"],"PUBLISH"));expect(result.conclusive).toBe(false);expect(result.error).toContain("operation_not_read_only")});
  it("keeps failed observer processes non-conclusive",async()=>{const provider=new Ros2ProofProvider([target("process.exit(7)")]),result=await provider.observe(request(["empty"]));expect(result.proposedOutcome).toBeUndefined();expect(result.conclusive).toBe(false);expect(result.error).toContain("ros2_proof_exit_7")});
  it("fails construction if the observer executable digest changes",()=>{expect(()=>new Ros2ProofProvider([{...target(),commandSha256:"0".repeat(64)}])).toThrow("command_digest_mismatch")});
  it("rejects executable prefix files unless their exact argument slot is digest-pinned",()=>{const dir=mkdtempSync(path.join(os.tmpdir(),"cieav-ros2-proof-")),script=path.join(dir,"observer.cjs");try{writeFileSync(script,`process.stdout.write(${JSON.stringify(sample)})`);const base={...target(),prefixArgs:[script]};expect(()=>new Ros2ProofProvider([base])).toThrow("ros2_proof_unpinned_prefix_file");expect(()=>new Ros2ProofProvider([{...base,prefixFilePins:[{argIndex:0,path:script,sha256:sha256(readFileSync(script))}]}])).not.toThrow()}finally{rmSync(dir,{recursive:true,force:true})}});
  it("fails closed if a pinned prefix file drifts after provider construction",async()=>{const dir=mkdtempSync(path.join(os.tmpdir(),"cieav-ros2-proof-")),script=path.join(dir,"observer.cjs");try{writeFileSync(script,`process.stdout.write(${JSON.stringify(sample)})`);const provider=new Ros2ProofProvider([{...target(),prefixArgs:[script],prefixFilePins:[{argIndex:0,path:script,sha256:sha256(readFileSync(script))}]}]);writeFileSync(script,"process.stdout.write('tampered')");const result=await provider.observe(request(["nonempty"]));expect(result.proposedOutcome).toBeUndefined();expect(result.conclusive).toBe(false);expect(result.error).toContain("ros2_proof_prefix_file_digest_mismatch")}finally{rmSync(dir,{recursive:true,force:true})}});
});
