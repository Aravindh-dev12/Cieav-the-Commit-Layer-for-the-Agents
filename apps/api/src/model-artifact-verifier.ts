import crypto from "node:crypto";
import {lstat,readdir,readFile,realpath,stat} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import type {CieavModelCandidate} from "./model-qualification-store.js";

const Hex64=/^[a-f0-9]{64}$/;
const sha256=(value:Buffer|string)=>crypto.createHash("sha256").update(value).digest("hex");
const within=(root:string,target:string)=>{const rel=path.relative(root,target);return rel===""||(!rel.startsWith("..")&&!path.isAbsolute(rel))};
async function walk(root:string,current:string,out:string[],limits:{files:number;bytes:number}){for(const entry of await readdir(current,{withFileTypes:true})){const full=path.join(current,entry.name);if(entry.isSymbolicLink())throw new Error("model_checkpoint_symlink_forbidden");if(entry.isDirectory()){await walk(root,full,out,limits);continue}if(!entry.isFile())throw new Error("model_checkpoint_non_regular_entry");const info=await stat(full);limits.files++;limits.bytes+=info.size;if(limits.files>200_000||limits.bytes>1_099_511_627_776)throw new Error("model_checkpoint_verification_limit_exceeded");out.push(full)}}
async function treeDigest(root:string,excluded:Set<string>){const files:string[]=[];await walk(root,root,files,{files:0,bytes:0});const hash=crypto.createHash("sha256");for(const file of files.filter(f=>!excluded.has(f)).sort((a,b)=>path.relative(root,a).split(path.sep).join("/").localeCompare(path.relative(root,b).split(path.sep).join("/")))){const rel=Buffer.from(path.relative(root,file).split(path.sep).join("/"),"utf8"),body=await readFile(file),digest=crypto.createHash("sha256").update(body).digest(),relLen=Buffer.alloc(8),digestLen=Buffer.alloc(8);relLen.writeBigUInt64BE(BigInt(rel.length));digestLen.writeBigUInt64BE(BigInt(digest.length));hash.update(relLen);hash.update(rel);hash.update(digestLen);hash.update(digest)}return hash.digest("hex")}

export async function verifyModelCandidateArtifact(candidate:CieavModelCandidate){
  if(candidate.state!=="QUALIFIED")throw new Error("model_artifact_verification_requires_qualified_candidate");if(!candidate.checkpointUri.startsWith("file:"))throw new Error("model_activation_requires_locally_verifiable_checkpoint");
  const checkpoint=await realpath(fileURLToPath(candidate.checkpointUri)),info=await lstat(checkpoint);if(!info.isDirectory())throw new Error("model_checkpoint_directory_required");
  const manifestPath=path.join(checkpoint,"training-round.json"),manifestReal=await realpath(manifestPath);if(!within(checkpoint,manifestReal))throw new Error("model_training_manifest_path_escape");const raw=await readFile(manifestReal),manifest=JSON.parse(raw.toString("utf8"));
  if(manifest?.architecture!=="CIEAV_ML_TRAINING_ROUND_V1"||manifest?.authority!==false||manifest?.status!=="TRAINED_UNQUALIFIED"||manifest?.qualification!=="UNQUALIFIED")throw new Error("model_training_manifest_contract_mismatch");
  const manifestCheckpoint=manifest?.checkpoint;if(!manifestCheckpoint||typeof manifestCheckpoint!=="object"||String(manifestCheckpoint.path)!==checkpoint||String(manifestCheckpoint.sha256)!==candidate.checkpointDigest||!Hex64.test(candidate.checkpointDigest))throw new Error("model_training_manifest_checkpoint_binding_mismatch");
  if(candidate.trainingReportDigest&&sha256(raw)!==candidate.trainingReportDigest)throw new Error("model_training_report_digest_mismatch");
  const listed=Array.isArray(manifestCheckpoint.excludedPaths)?manifestCheckpoint.excludedPaths.map((v:unknown)=>path.resolve(String(v))):[];const excluded=new Set<string>();for(const item of listed){const resolved=path.resolve(item);if(!within(checkpoint,resolved))throw new Error("model_checkpoint_exclusion_outside_checkpoint");excluded.add(resolved)}excluded.add(manifestReal);
  const actual=await treeDigest(checkpoint,excluded);if(actual!==candidate.checkpointDigest)throw new Error("model_checkpoint_tree_digest_mismatch");
  return{ok:true,checkpoint,checkpointDigest:actual,trainingReportDigest:sha256(raw),verifiedAt:new Date().toISOString(),authority:false as const,productionAuthority:false as const,mayMintExecutionAuthority:false as const};
}
