import crypto from "node:crypto";
import {spawn} from "node:child_process";
import {mkdir,readFile,realpath,stat} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {LearningJobResultSchema,LearningProviderDescriptorSchema,ProviderHealthSchema,type LearningJobRequest,type LearningProviderDescriptor,type ProviderHealth} from "@cieav/contracts";
import type {LearningProvider} from "@cieav/core/provider-runtime";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../..");
const sha256File=async(file:string)=>{const data=await readFile(file);return crypto.createHash("sha256").update(data).digest("hex")};
const inside=(root:string,target:string)=>target===root||target.startsWith(root+path.sep);
const boundedName=(value:string)=>{if(!/^[a-zA-Z0-9._/-]{1,200}$/.test(value)||value.includes("..")||path.isAbsolute(value))throw new Error("local_learning_output_scope_invalid");return value};
async function canonicalExistingWithin(root:string,target:string){const canonicalRoot=await realpath(root),canonicalTarget=await realpath(target);if(!inside(canonicalRoot,canonicalTarget))throw new Error("local_learning_dataset_outside_allowed_root");return canonicalTarget}

export class CieavLocalTrlLearningProvider implements LearningProvider{
  readonly descriptor:LearningProviderDescriptor=LearningProviderDescriptorSchema.parse({id:"cieav.local.trl",version:"1",methods:["SFT","DPO","KTO","GRPO"],local:true,authority:false,productionAuthority:false});
  constructor(private readonly options:{datasetRoot:string;outputRoot:string;python?:string;timeoutMs?:number}){}
  async health():Promise<ProviderHealth>{try{await mkdir(this.options.datasetRoot,{recursive:true,mode:0o700});await mkdir(this.options.outputRoot,{recursive:true,mode:0o700});await stat(path.join(ROOT,"ml/train_trl.py"));return ProviderHealthSchema.parse({ok:true,providerId:this.descriptor.id,checkedAt:new Date().toISOString(),detail:"local TRL runner available; outputs remain unqualified",authority:false})}catch(error:any){return ProviderHealthSchema.parse({ok:false,providerId:this.descriptor.id,checkedAt:new Date().toISOString(),detail:String(error?.message??error).slice(0,1000),authority:false})}}
  async run(request:LearningJobRequest){
    if(!this.descriptor.methods.includes(request.method))throw new Error(`local_learning_method_not_supported:${request.method}`);
    if(!request.baseModel)throw new Error("local_learning_base_model_required");
    if(request.dataset.kind!=="DATASET")throw new Error("local_learning_dataset_artifact_required");
    let datasetPath:string;try{const url=new URL(request.dataset.uri);if(url.protocol!=="file:")throw new Error("local_learning_dataset_must_be_file_uri");datasetPath=fileURLToPath(url)}catch(error:any){if(String(error?.message??error).includes("must_be_file_uri"))throw error;throw new Error("local_learning_dataset_uri_invalid")}
    datasetPath=await canonicalExistingWithin(this.options.datasetRoot,datasetPath);if(await sha256File(datasetPath)!==request.dataset.digest)throw new Error("local_learning_dataset_digest_mismatch");
    const output=path.resolve(this.options.outputRoot,boundedName(request.outputScope));const outputRoot=path.resolve(this.options.outputRoot);if(!inside(outputRoot,output))throw new Error("local_learning_output_outside_allowed_root");
    try{await stat(output);throw new Error("local_learning_output_already_exists")}catch(error:any){if(error?.code!=="ENOENT")throw error}
    await mkdir(path.dirname(output),{recursive:true,mode:0o700});
    const stage=request.method.toLowerCase(),python=this.options.python??process.env.CIEAV_ML_PYTHON??(process.platform==="win32"?"python":"python3"),args=[path.join(ROOT,"ml/train_trl.py"),"--stage",stage,"--model",request.baseModel,"--dataset",datasetPath,"--output",output,"--seed","1729","--data-seed","1729","--full-determinism"],timeoutMs=this.options.timeoutMs??21_600_000;
    const logs=await new Promise<{code:number|null;stderr:string}>((resolve,reject)=>{const child=spawn(python,args,{cwd:ROOT,stdio:["ignore","ignore","pipe"],windowsHide:true,shell:false,env:{...process.env,PYTHONUNBUFFERED:"1"}});let stderr="",settled=false;const timer=setTimeout(()=>{child.kill("SIGTERM");if(!settled){settled=true;reject(new Error("local_learning_training_timeout"))}},timeoutMs);child.stderr?.on("data",chunk=>{if(stderr.length<12000)stderr+=(Buffer.isBuffer(chunk)?chunk.toString("utf8"):String(chunk)).slice(0,12000-stderr.length)});child.on("error",error=>{clearTimeout(timer);if(!settled){settled=true;reject(error)}});child.on("close",code=>{clearTimeout(timer);if(!settled){settled=true;resolve({code,stderr})}})});
    if(logs.code!==0)return LearningJobResultSchema.parse({provider:this.descriptor,jobId:request.jobId,status:"FAILED",artifacts:[],metrics:{},candidateQualified:false,promotionExecuted:false,authority:false,productionAuthority:false,error:`local TRL exited ${logs.code}: ${logs.stderr}`.slice(0,1500)});
    const manifestPath=path.join(output,"training-round.json"),manifest=JSON.parse(await readFile(manifestPath,"utf8"));if(manifest?.architecture!=="CIEAV_ML_TRAINING_ROUND_V1"||manifest?.authority!==false||manifest?.qualification!=="UNQUALIFIED"||manifest?.status!=="TRAINED_UNQUALIFIED")throw new Error("local_learning_training_round_contract_mismatch");if(manifest?.dataset?.sha256!==request.dataset.digest)throw new Error("local_learning_training_manifest_dataset_mismatch");const checkpointDigest=String(manifest?.checkpoint?.sha256??"");if(!/^[0-9a-f]{64}$/.test(checkpointDigest))throw new Error("local_learning_checkpoint_digest_missing");const reportDigest=await sha256File(manifestPath);
    return LearningJobResultSchema.parse({provider:this.descriptor,jobId:request.jobId,status:"SUCCEEDED_UNQUALIFIED",artifacts:[{kind:"CHECKPOINT",uri:pathToFileURL(output).href,digest:checkpointDigest},{kind:"REPORT",uri:pathToFileURL(manifestPath).href,digest:reportDigest}],metrics:{},candidateQualified:false,promotionExecuted:false,authority:false,productionAuthority:false});
  }
}
