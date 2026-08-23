import crypto from "node:crypto";
import {createReadStream} from "node:fs";
import {realpath,stat} from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import {pathToFileURL} from "node:url";
import {LearningDatasetMaterializationSchema,type LearningDatasetMaterialization} from "@cieav/contracts";
import type {CieavLearningDatasetVault} from "./learning-dataset-vault.js";

const methodsByKind:Record<LearningDatasetMaterialization["kind"],LearningDatasetMaterialization["supportedMethods"]>={
  REDACTED_TRAJECTORY_JSONL:["OFFLINE_RL"],PREFERENCE_PAIRS_JSONL:["DPO","KTO"],SFT_MESSAGES_JSONL:["SFT"],RL_ENVIRONMENT_SET:["GRPO","RLVR"],REWARD_EXAMPLES_JSONL:["REWARD_MODEL"],QUALIFIED_TEACHER_CORPUS_JSONL:["DISTILLATION"]
};
const inside=(root:string,target:string)=>target===root||target.startsWith(root+path.sep);
const dangerousKey=/secret|password|credential|private.?key|api.?key|bearer|access.?token|refresh.?token/i;
const nonempty=(v:unknown)=>typeof v==="string"&&v.trim().length>0;
const finite=(v:unknown)=>typeof v==="number"&&Number.isFinite(v);
const verified=(record:Record<string,unknown>)=>record.cryptographicallyVerified===true&&record.authorityGrade===true&&record.realityBound===true&&nonempty(record.redactionProfile);

function validateRecord(kind:LearningDatasetMaterialization["kind"],value:unknown,line:number){
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Error(`learning_materialization_line_not_object:${line}`);const record=value as Record<string,unknown>;
  if(Object.keys(record).some(key=>dangerousKey.test(key)))throw new Error(`learning_materialization_sensitive_key_forbidden:${line}`);
  if(record.authority===true||record.productionAuthority===true)throw new Error(`learning_materialization_authority_claim_forbidden:${line}`);
  if(kind==="SFT_MESSAGES_JSONL"){
    if(!Array.isArray(record.messages)||record.messages.length<2)throw new Error(`learning_materialization_sft_messages_required:${line}`);
    for(const message of record.messages){if(!message||typeof message!=="object"||Array.isArray(message))throw new Error(`learning_materialization_sft_message_invalid:${line}`);const m=message as Record<string,unknown>;if(!["system","user","assistant"].includes(String(m.role))||!nonempty(m.content))throw new Error(`learning_materialization_sft_message_invalid:${line}`)}
  }else if(kind==="PREFERENCE_PAIRS_JSONL"){
    if(!nonempty(record.prompt)||!nonempty(record.chosen)||!nonempty(record.rejected)||record.chosen===record.rejected)throw new Error(`learning_materialization_preference_pair_invalid:${line}`);
  }else if(kind==="RL_ENVIRONMENT_SET"){
    if(!nonempty(record.prompt)||!record.expectation||typeof record.expectation!=="object"||Array.isArray(record.expectation))throw new Error(`learning_materialization_rl_environment_invalid:${line}`);
    if(record.candidate!==undefined&&record.candidate!==null&&record.requiresFreshModelRollout!==true)throw new Error(`learning_materialization_replay_requires_fresh_rollout:${line}`);
  }else if(kind==="REDACTED_TRAJECTORY_JSONL"){
    if(!nonempty(record.trajectoryId)||!nonempty(record.operation)||!nonempty(record.exactArgumentsDigest)||!["SUCCESS","FAILURE","UNKNOWN"].includes(String(record.outcome)))throw new Error(`learning_materialization_trajectory_invalid:${line}`);
    if("objective" in record||"rawArguments" in record||"credentialLease" in record||"executionTicket" in record)throw new Error(`learning_materialization_trajectory_contains_unbounded_private_or_authority_data:${line}`);
    if(!verified(record))throw new Error(`learning_materialization_offline_rl_requires_verified_authority_grade_reality_bound_trajectory:${line}`);
    if(!nonempty(record.prompt)||!nonempty(record.chosen)||!nonempty(record.rejected)||record.chosen===record.rejected||!finite(record.chosenReward)||!finite(record.rejectedReward)||(record.chosenReward as number)<=(record.rejectedReward as number))throw new Error(`learning_materialization_offline_rl_preference_invalid:${line}`);
    if(record.expectedOutcome==="UNKNOWN"&&record.chosenOutcome==="SUCCESS")throw new Error(`learning_materialization_unknown_mapped_to_success:${line}`);
  }else if(kind==="QUALIFIED_TEACHER_CORPUS_JSONL"){
    if(!verified(record)||record.teacherQualified!==true||!nonempty(record.teacherQualificationRef)||!nonempty(record.teacherModelDigest)||!/^[a-f0-9]{64}$/.test(String(record.teacherModelDigest)))throw new Error(`learning_materialization_distillation_teacher_provenance_invalid:${line}`);
    if(!nonempty(record.text)&&!nonempty(record.completion))throw new Error(`learning_materialization_distillation_target_missing:${line}`);
    if(record.expectedOutcome==="UNKNOWN"&&record.targetOutcome==="SUCCESS")throw new Error(`learning_materialization_unknown_mapped_to_success:${line}`);
  }else if(kind==="REWARD_EXAMPLES_JSONL"){
    if(typeof record.reward!=="number"||!Number.isFinite(record.reward)||!record.input||typeof record.input!=="object")throw new Error(`learning_materialization_reward_example_invalid:${line}`);
  }
}

async function digestFile(file:string){const hash=crypto.createHash("sha256");for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest("hex")}

export class CieavTrustedLearningMaterializer{
  constructor(private readonly datasetRoot:string,private readonly vault:CieavLearningDatasetVault){}
  async materialize(datasetId:string,input:{relativePath:string;kind:LearningDatasetMaterialization["kind"];redactionProfile:string;schemaVersion:string;createdAt?:string}){
    if(!/^[a-zA-Z0-9._/-]{1,500}$/.test(input.relativePath)||input.relativePath.includes("..")||path.isAbsolute(input.relativePath))throw new Error("learning_materialization_relative_path_invalid");
    const root=await realpath(this.datasetRoot),file=await realpath(path.resolve(root,input.relativePath));if(!inside(root,file))throw new Error("learning_materialization_outside_dataset_root");const info=await stat(file);if(!info.isFile())throw new Error("learning_materialization_requires_file");if(info.size<=0||info.size>1_073_741_824)throw new Error("learning_materialization_file_size_invalid");
    const stream=createReadStream(file,{encoding:"utf8"}),lines=readline.createInterface({input:stream,crlfDelay:Infinity});let count=0,teacherIdentity:string|undefined;try{for await(const raw of lines){if(!raw.trim())continue;if(++count>1_000_000)throw new Error("learning_materialization_too_many_records");if(Buffer.byteLength(raw,"utf8")>2_000_000)throw new Error(`learning_materialization_record_too_large:${count}`);let value:unknown;try{value=JSON.parse(raw)}catch{throw new Error(`learning_materialization_invalid_json:${count}`)}validateRecord(input.kind,value,count);if(input.kind==="QUALIFIED_TEACHER_CORPUS_JSONL"){const record=value as Record<string,unknown>,identity=`${record.teacherModelDigest}\0${record.teacherQualificationRef}`;if(teacherIdentity&&teacherIdentity!==identity)throw new Error(`learning_materialization_distillation_mixed_teacher_identity:${count}`);teacherIdentity=identity}}}finally{lines.close();stream.destroy()}if(!count)throw new Error("learning_materialization_empty_dataset");
    const dataset=await this.vault.get(datasetId);if(!dataset)throw new Error("learning_materialization_dataset_not_found");const createdAt=input.createdAt??new Date().toISOString(),materialization=LearningDatasetMaterializationSchema.parse({kind:input.kind,uri:pathToFileURL(file).href,digest:await digestFile(file),sourceManifestDigest:dataset.manifest.datasetDigest,redactionProfile:input.redactionProfile,schemaVersion:input.schemaVersion,supportedMethods:methodsByKind[input.kind],createdAt});return this.vault.attachMaterialization(datasetId,materialization,createdAt)
  }
}