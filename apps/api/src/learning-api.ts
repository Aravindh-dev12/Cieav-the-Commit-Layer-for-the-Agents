import type * as http from "node:http";
import {z} from "zod";
import {LearningMethodSchema} from "@cieav/contracts";
import type {CieavUniversalIntelligenceStore} from "./universal-intelligence-store.js";
import {CieavTrustedLearningMaterializer} from "./trusted-learning-materializer.js";

const DatasetCreateSchema=z.object({purpose:z.enum(["OUTCOME_POLICY","RECOVERY","CALIBRATION"]),createdAt:z.string().datetime().optional()}).strict();
const MaterializeSchema=z.object({relativePath:z.string().min(1).max(500),kind:z.enum(["REDACTED_TRAJECTORY_JSONL","PREFERENCE_PAIRS_JSONL","SFT_MESSAGES_JSONL","RL_ENVIRONMENT_SET","REWARD_EXAMPLES_JSONL","QUALIFIED_TEACHER_CORPUS_JSONL"]),redactionProfile:z.string().min(1).max(300),schemaVersion:z.string().min(1).max(100),createdAt:z.string().datetime().optional()}).strict();
const JobCreateSchema=z.object({jobId:z.string().min(8).max(200),providerId:z.string().min(1).max(200),method:LearningMethodSchema,datasetId:z.string().min(8).max(200),baseModel:z.string().min(1).max(500).optional(),outputScope:z.string().min(1).max(200),qualificationProfile:z.string().min(1).max(300),createdAt:z.string().datetime().optional()}).strict();
const TimestampSchema=z.object({at:z.string().datetime().optional()}).strict();
async function readBody(req:http.IncomingMessage){const chunks:Buffer[]=[];let size=0;for await(const chunk of req){const b=Buffer.from(chunk);size+=b.length;if(size>512_000)throw new Error("body_too_large");chunks.push(b)}return chunks.length?JSON.parse(Buffer.concat(chunks).toString("utf8")):{} }
export type LearningApiResult={status:number;body:unknown};

export class CieavLearningApi{
  private readonly materializer:CieavTrustedLearningMaterializer;
  constructor(private readonly intelligence:CieavUniversalIntelligenceStore){this.materializer=new CieavTrustedLearningMaterializer(intelligence.learningDatasetRoot,intelligence.learningVault)}
  async handleGateway(req:http.IncomingMessage,pathname:string):Promise<LearningApiResult|null>{
    if(req.method==="GET"&&pathname==="/v1/learning/health")return{status:200,body:{vault:await this.intelligence.learningVault.health(),jobs:await this.intelligence.learningJobs.health(),providers:await this.intelligence.runtime.learningProviders.health(),authority:false,productionAuthority:false,mayMintExecutionAuthority:false,mayPromoteModel:false}};
    if(req.method==="GET"&&pathname==="/v1/learning/providers")return{status:200,body:{providers:this.intelligence.runtime.learningProviders.list(),authority:false,productionAuthority:false,mayMintExecutionAuthority:false,mayPromoteModel:false}};
    if(req.method==="GET"&&pathname==="/v1/learning/datasets")return{status:200,body:{datasets:await this.intelligence.learningVault.list(),authority:false,productionAuthority:false,mayMintExecutionAuthority:false}};
    if(req.method==="POST"&&pathname==="/v1/learning/datasets"){const input=DatasetCreateSchema.parse(await readBody(req)),dataset=await this.intelligence.learningVault.createDataset(input.purpose,input.createdAt??new Date().toISOString());return{status:201,body:{dataset,authority:false,productionAuthority:false,mayMintExecutionAuthority:false,mayPromoteModel:false}}}
    const datasetRead=pathname.match(/^\/v1\/learning\/datasets\/([^/]+)$/);if(req.method==="GET"&&datasetRead?.[1]){const dataset=await this.intelligence.learningVault.get(decodeURIComponent(datasetRead[1]));return dataset?{status:200,body:{dataset,authority:false,productionAuthority:false,mayMintExecutionAuthority:false}}:{status:404,body:{error:"not_found"}}}
    const materialize=pathname.match(/^\/v1\/learning\/datasets\/([^/]+)\/materialize$/);if(req.method==="POST"&&materialize?.[1]){const input=MaterializeSchema.parse(await readBody(req)),dataset=await this.materializer.materialize(decodeURIComponent(materialize[1]),input);return{status:200,body:{dataset,authority:false,productionAuthority:false,mayMintExecutionAuthority:false,mayPromoteModel:false}}}
    if(req.method==="GET"&&pathname==="/v1/learning/jobs")return{status:200,body:{jobs:await this.intelligence.learningJobs.list(),authority:false,productionAuthority:false,mayMintExecutionAuthority:false,mayPromoteModel:false}};
    if(req.method==="POST"&&pathname==="/v1/learning/jobs"){const input=JobCreateSchema.parse(await readBody(req)),job=await this.intelligence.learningJobs.enqueue(input);return{status:201,body:{job,authority:false,productionAuthority:false,mayMintExecutionAuthority:false,mayPromoteModel:false}}}
    const jobRead=pathname.match(/^\/v1\/learning\/jobs\/([^/]+)$/);if(req.method==="GET"&&jobRead?.[1]){const job=await this.intelligence.learningJobs.get(decodeURIComponent(jobRead[1]));return job?{status:200,body:{job,authority:false,productionAuthority:false,mayMintExecutionAuthority:false,mayPromoteModel:false}}:{status:404,body:{error:"not_found"}}}
    const run=pathname.match(/^\/v1\/learning\/jobs\/([^/]+)\/run$/);if(req.method==="POST"&&run?.[1]){const jobId=decodeURIComponent(run[1]),existing=await this.intelligence.learningJobs.get(jobId);if(!existing)return{status:404,body:{error:"not_found"}};if(existing.state!=="QUEUED")return{status:409,body:{error:`learning_job_not_queued:${existing.state}`,job:existing,authority:false}};void this.intelligence.learningJobs.run(jobId).catch(error=>console.error("CIEAV learning job execution failed",jobId,String((error as any)?.message??error)));return{status:202,body:{accepted:true,jobId,pollPath:`/v1/intelligence/learning/jobs/${encodeURIComponent(jobId)}`,authority:false,productionAuthority:false,mayMintExecutionAuthority:false,mayPromoteModel:false}}}
    const cancel=pathname.match(/^\/v1\/learning\/jobs\/([^/]+)\/cancel$/);if(req.method==="POST"&&cancel?.[1]){const input=TimestampSchema.parse(await readBody(req)),job=await this.intelligence.learningJobs.cancel(decodeURIComponent(cancel[1]),input.at??new Date().toISOString());return{status:200,body:{job,authority:false,productionAuthority:false,mayMintExecutionAuthority:false,mayPromoteModel:false}}}
    return null;
  }
}
