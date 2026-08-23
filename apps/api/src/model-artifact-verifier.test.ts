import crypto from "node:crypto";
import {afterEach,describe,expect,it} from "vitest";
import {mkdtemp,rm,symlink,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {verifyModelCandidateArtifact} from "./model-artifact-verifier.js";
import type {CieavModelCandidate} from "./model-qualification-store.js";

const dirs:string[]=[];afterEach(async()=>{await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})))});
const sha256=(value:Buffer|string)=>crypto.createHash("sha256").update(value).digest("hex");
function treeDigest(fileName:string,body:Buffer){const hash=crypto.createHash("sha256"),rel=Buffer.from(fileName,"utf8"),digest=crypto.createHash("sha256").update(body).digest(),rl=Buffer.alloc(8),dl=Buffer.alloc(8);rl.writeBigUInt64BE(BigInt(rel.length));dl.writeBigUInt64BE(BigInt(digest.length));hash.update(rl);hash.update(rel);hash.update(dl);hash.update(digest);return hash.digest("hex")}
async function fixture(){const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-model-artifact-"));dirs.push(dir);const body=Buffer.from("qualified checkpoint bytes"),modelFile=path.join(dir,"model.bin");await writeFile(modelFile,body);const checkpointDigest=treeDigest("model.bin",body),manifestPath=path.join(dir,"training-round.json"),manifest={schemaVersion:1,architecture:"CIEAV_ML_TRAINING_ROUND_V1",authority:false,roundId:"round-001",stage:"sft",status:"TRAINED_UNQUALIFIED",qualification:"UNQUALIFIED",checkpoint:{path:dir,sha256:checkpointDigest,excludedPaths:[manifestPath]}};const raw=Buffer.from(JSON.stringify(manifest,null,2)+"\n");await writeFile(manifestPath,raw);const candidate:CieavModelCandidate={version:"CIEAV_MODEL_CANDIDATE_V1",candidateId:"candidate-artifact-0001",jobId:"job-1",role:"CORE_REASONER",checkpointUri:pathToFileURL(dir).href,checkpointDigest,trainingReportDigest:sha256(raw),qualificationProfile:"core-v1",state:"QUALIFIED",qualificationSuiteDigest:"b".repeat(64),qualificationMeanReward:.9,qualificationViolations:[],createdAt:"2026-08-23T00:00:00.000Z",updatedAt:"2026-08-23T00:00:01.000Z",authority:false,productionAuthority:false,promotionExecuted:false,mayMintExecutionAuthority:false,mayPromoteSelf:false};return{dir,modelFile,candidate}}

describe("verifyModelCandidateArtifact",()=>{
  it("recomputes the exact training-round tree before activation",async()=>{const x=await fixture(),result=await verifyModelCandidateArtifact(x.candidate);expect(result.ok).toBe(true);expect(result.checkpointDigest).toBe(x.candidate.checkpointDigest);expect(result.authority).toBe(false);expect(result.mayMintExecutionAuthority).toBe(false)});
  it("rejects checkpoint substitution after qualification",async()=>{const x=await fixture();await writeFile(x.modelFile,"substituted checkpoint bytes");await expect(verifyModelCandidateArtifact(x.candidate)).rejects.toThrow("checkpoint_tree_digest_mismatch")});
  it("rejects symlink injection into a qualified checkpoint",async()=>{const x=await fixture(),outside=path.join(path.dirname(x.dir),`outside-${crypto.randomUUID()}.txt`);await writeFile(outside,"outside");try{await symlink(outside,path.join(x.dir,"linked.bin"));await expect(verifyModelCandidateArtifact(x.candidate)).rejects.toThrow("symlink_forbidden")}finally{await rm(outside,{force:true})}});
  it("requires local verifiable checkpoint material",async()=>{const x=await fixture(),candidate={...x.candidate,checkpointUri:"https://models.example/candidate"};await expect(verifyModelCandidateArtifact(candidate)).rejects.toThrow("locally_verifiable_checkpoint")});
});
