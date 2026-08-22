import type * as http from "node:http";
import {CognitiveCellDescriptorSchema,EpistemicClaimSchema,IntelligenceClaimEvidenceRequestSchema,IntelligenceExperienceRequestSchema,IntelligenceInvalidateRequestSchema,IntelligencePlanRequestSchema,WorkspaceContributionSchema} from "@cieav/contracts";
import {z} from "zod";
import {CieavUniversalIntelligenceStore} from "./universal-intelligence-store.js";

const WorkspaceCreateSchema=z.object({workspaceId:z.string().min(8).max(160),objective:z.string().min(1).max(5000),createdAt:z.string().datetime(),privacy:z.enum(["LOCAL_ONLY","REDACTED_REMOTE_ALLOWED","REMOTE_ALLOWED"]),authority:z.literal(false).default(false)});
const HeartbeatSchema=z.object({health:z.enum(["HEALTHY","DEGRADED","UNHEALTHY"]),at:z.string().datetime(),authority:z.literal(false).default(false)});
const RevokeSchema=z.object({at:z.string().datetime(),authority:z.literal(false).default(false)});
export type IntelligenceApiResult={status:number;body:unknown};
async function readBody(req:http.IncomingMessage){const chunks:Buffer[]=[];let size=0;for await(const chunk of req){const b=Buffer.from(chunk);size+=b.length;if(size>256000)throw new Error("body_too_large");chunks.push(b)}return chunks.length?JSON.parse(Buffer.concat(chunks).toString("utf8")):{} }

export class CieavUniversalIntelligenceApi{
  constructor(readonly store:CieavUniversalIntelligenceStore){}
  async handleGateway(req:http.IncomingMessage,pathname:string,url:URL):Promise<IntelligenceApiResult|null>{
    if(req.method==="GET"&&pathname==="/v1/intelligence/health")return{status:200,body:await this.store.health()};
    if(req.method==="GET"&&pathname==="/v1/intelligence/snapshot"){const privacy=z.enum(["LOCAL_ONLY","REDACTED_REMOTE_ALLOWED","REMOTE_ALLOWED"]).parse(url.searchParams.get("privacy")??"LOCAL_ONLY"),staleRaw=url.searchParams.get("staleAfterMs"),staleAfterMs=staleRaw?z.coerce.number().int().positive().max(86_400_000).parse(staleRaw):undefined;return{status:200,body:await this.store.snapshot({now:new Date().toISOString(),privacy,...(staleAfterMs?{staleAfterMs}:{})})}}
    if(req.method==="GET"&&pathname==="/v1/intelligence/cells")return{status:200,body:{cells:await this.store.listCells(),authority:false,mayMintExecutionAuthority:false}};
    if(req.method==="POST"&&pathname==="/v1/intelligence/cells"){const cell=CognitiveCellDescriptorSchema.parse(await readBody(req));return{status:201,body:{cell:await this.store.registerCell(cell),authority:false}}}
    if(req.method==="PUT"&&pathname==="/v1/intelligence/cells"){const cell=CognitiveCellDescriptorSchema.parse(await readBody(req));return{status:200,body:{cell:await this.store.upsertCell(cell),authority:false}}}
    const heartbeat=pathname.match(/^\/v1\/intelligence\/cells\/([^/]+)\/heartbeat$/);if(req.method==="POST"&&heartbeat?.[1]){const input=HeartbeatSchema.parse(await readBody(req));return{status:200,body:{cell:await this.store.heartbeatCell(decodeURIComponent(heartbeat[1]),input.health,input.at),authority:false}}}
    const revoke=pathname.match(/^\/v1\/intelligence\/cells\/([^/]+)\/revoke$/);if(req.method==="POST"&&revoke?.[1]){const input=RevokeSchema.parse(await readBody(req));return{status:200,body:{cell:await this.store.revokeCell(decodeURIComponent(revoke[1]),input.at),authority:false}}}
    if(req.method==="POST"&&pathname==="/v1/intelligence/workspaces"){const input=WorkspaceCreateSchema.parse(await readBody(req));return{status:201,body:{workspace:await this.store.createWorkspace(input),authority:false}}}
    const contribute=pathname.match(/^\/v1\/intelligence\/workspaces\/([^/]+)\/contributions$/);if(req.method==="POST"&&contribute?.[1]){const contribution=WorkspaceContributionSchema.parse(await readBody(req));if(contribution.workspaceId!==decodeURIComponent(contribute[1]))throw new Error("workspace_id_mismatch");return{status:201,body:{contribution:await this.store.contribute(contribution),authority:false}}}
    const plan=pathname.match(/^\/v1\/intelligence\/workspaces\/([^/]+)\/plan$/);if(req.method==="POST"&&plan?.[1]){const input=IntelligencePlanRequestSchema.parse(await readBody(req)),result=await this.store.plan(decodeURIComponent(plan[1]),{now:input.now,privacy:input.privacy,...(input.staleAfterMs!==undefined?{staleAfterMs:input.staleAfterMs}:{}),...(input.currentRealityDigest?{currentRealityDigest:input.currentRealityDigest}:{}),...(input.authorityEnvelopeRef?{authorityEnvelopeRef:input.authorityEnvelopeRef}:{}),uncertainty:input.uncertainty,proofObligations:input.proofObligations,recoveryRequirements:input.recoveryRequirements,...(input.budget.maxLatencyMs!==undefined?{maxLatencyMs:input.budget.maxLatencyMs}:{}),...(input.budget.maxCostUsd!==undefined?{maxCostUsd:input.budget.maxCostUsd}:{}),...(input.budget.maxModelCalls!==undefined?{maxModelCalls:input.budget.maxModelCalls}:{})});return{status:200,body:result}}
    if(req.method==="POST"&&pathname==="/v1/intelligence/claims"){const claim=EpistemicClaimSchema.parse(await readBody(req));return{status:201,body:{claim:await this.store.upsertClaim(claim),authority:false}}}
    const evidence=pathname.match(/^\/v1\/intelligence\/claims\/([^/]+)\/evidence$/);if(req.method==="POST"&&evidence?.[1]){const input=IntelligenceClaimEvidenceRequestSchema.parse(await readBody(req));return{status:200,body:{claim:await this.store.addClaimEvidence(decodeURIComponent(evidence[1]),input.kind,input.evidence),authority:false}}}
    if(req.method==="POST"&&pathname==="/v1/intelligence/invalidate"){const input=IntelligenceInvalidateRequestSchema.parse(await readBody(req));return{status:200,body:{claims:await this.store.invalidateClaims(input.condition,input.observedAt),authority:false}}}
    if(req.method==="POST"&&pathname==="/v1/intelligence/experience"){const input=IntelligenceExperienceRequestSchema.parse(await readBody(req));return{status:201,body:await this.store.ingestVerifiedExperience(input.trajectory)}}
    return null;
  }
}
