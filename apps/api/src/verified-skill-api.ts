import type * as http from "node:http";
import {z} from "zod";
import {VerifiedSkillArtifactV2Schema,VerifiedSkillProvenanceSchema,VerifiedSkillValidationEvidenceBundleSchema} from "@cieav/contracts";
import type {CieavUniversalIntelligenceStore} from "./universal-intelligence-store.js";
import {CieavVerifiedSkillStore} from "./verified-skill-store.js";

const ProvenanceInputSchema=VerifiedSkillProvenanceSchema.innerType().omit({subjectDigest:true,candidateDigest:true,sourceQualificationDigest:true,validationDigest:true,authority:true,productionAuthority:true,mayMintExecutionAuthority:true}).superRefine((value,ctx)=>{if(Boolean(value.externalAttestationRef)!==Boolean(value.externalAttestationDigest))ctx.addIssue({code:z.ZodIssueCode.custom,path:["externalAttestationRef"],message:"external_attestation_reference_and_digest_must_be_paired"})});
const RegisterSchema=z.object({artifact:VerifiedSkillArtifactV2Schema,validationEvidence:VerifiedSkillValidationEvidenceBundleSchema,provenance:ProvenanceInputSchema,registeredAt:z.string().datetime().optional()}).strict();
const ActivateSchema=z.object({approvalRef:z.string().min(8).max(500),activatedBy:z.string().min(1).max(300),at:z.string().datetime().optional()}).strict();
const ReasonSchema=z.object({reason:z.string().min(1).max(1000),at:z.string().datetime().optional()}).strict();
async function readBody(req:http.IncomingMessage){const chunks:Buffer[]=[];let size=0;for await(const chunk of req){const b=Buffer.from(chunk);size+=b.length;if(size>2_000_000)throw new Error("body_too_large");chunks.push(b)}return chunks.length?JSON.parse(Buffer.concat(chunks).toString("utf8")):{} }
export type VerifiedSkillApiResult={status:number;body:unknown};

export class CieavVerifiedSkillApi{
  constructor(readonly store:CieavVerifiedSkillStore,private readonly intelligence:CieavUniversalIntelligenceStore){}
  async handleGateway(req:http.IncomingMessage,pathname:string):Promise<VerifiedSkillApiResult|null>{
    if(req.method==="GET"&&pathname==="/v1/verified-skills/health")return{status:200,body:await this.store.health()};
    if(req.method==="GET"&&pathname==="/v1/verified-skills")return{status:200,body:{skills:await this.store.list(),authority:false,productionAuthority:false,mayMintExecutionAuthority:false}};
    if(req.method==="POST"&&pathname==="/v1/verified-skills"){
      const input=RegisterSchema.parse(await readBody(req)),record=await this.store.registerQualified(input.artifact,input.validationEvidence,input.provenance,input.registeredAt??new Date().toISOString());return{status:201,body:{record,authority:false,productionAuthority:false,mayMintExecutionAuthority:false}};
    }
    if(req.method==="POST"&&pathname==="/v1/verified-skills/reconcile"){const result=await this.store.reconcileDependencies(this.intelligence.runtime.cells);return{status:200,body:result}};
    const read=pathname.match(/^\/v1\/verified-skills\/([^/]+)$/);if(req.method==="GET"&&read?.[1]){const record=await this.store.get(decodeURIComponent(read[1]));return record?{status:200,body:{record,authority:false,productionAuthority:false,mayMintExecutionAuthority:false}}:{status:404,body:{error:"not_found"}}}
    const activate=pathname.match(/^\/v1\/verified-skills\/([^/]+)\/activate$/);if(req.method==="POST"&&activate?.[1]){const input=ActivateSchema.parse(await readBody(req)),record=await this.store.activate(decodeURIComponent(activate[1]),this.intelligence.runtime.cells,{approvalRef:input.approvalRef,activatedBy:input.activatedBy,...(input.at?{at:input.at}:{})});return{status:200,body:{record,authority:false,productionAuthority:false,mayMintExecutionAuthority:false}}}
    const quarantine=pathname.match(/^\/v1\/verified-skills\/([^/]+)\/quarantine$/);if(req.method==="POST"&&quarantine?.[1]){const input=ReasonSchema.parse(await readBody(req)),record=await this.store.quarantine(decodeURIComponent(quarantine[1]),input.reason,input.at??new Date().toISOString());return{status:200,body:{record,authority:false,productionAuthority:false,mayMintExecutionAuthority:false}}}
    const revoke=pathname.match(/^\/v1\/verified-skills\/([^/]+)\/revoke$/);if(req.method==="POST"&&revoke?.[1]){const input=ReasonSchema.parse(await readBody(req)),record=await this.store.revoke(decodeURIComponent(revoke[1]),input.reason,input.at??new Date().toISOString());return{status:200,body:{record,authority:false,productionAuthority:false,mayMintExecutionAuthority:false}}}
    return null;
  }
}
