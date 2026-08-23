import type {IncomingMessage} from "node:http";
import type {CieavAgentKernelStore} from "./agent-kernel.js";
import type {RealityRouteResult} from "./reality-api.js";

const MAX_BODY=256_000;
async function body(req:IncomingMessage){const chunks:Buffer[]=[];let size=0;for await(const chunk of req){const b=Buffer.from(chunk);size+=b.length;if(size>MAX_BODY)throw new Error("body_too_large");chunks.push(b)}return chunks.length?JSON.parse(Buffer.concat(chunks).toString("utf8")):{} }
const conflict=(err:unknown):RealityRouteResult=>({status:409,body:{error:String((err as any)?.message??err)}});

export class CieavSafetyEdgeAdminApi{
  constructor(private readonly store:CieavAgentKernelStore){}
  async handle(req:IncomingMessage,pathname:string):Promise<RealityRouteResult|null>{
    if(req.method==="GET"&&pathname==="/v1/agent-kernel/continuing-authority")return{status:200,body:{sessions:await this.store.continuingAuthority.list()}};
    const ca=pathname.match(/^\/v1\/agent-kernel\/continuing-authority\/([0-9a-f-]+)$/i);if(req.method==="GET"&&ca?.[1]){const session=await this.store.continuingAuthority.get(ca[1]);return session?{status:200,body:{session}}:{status:404,body:{error:"not_found"}}}
    const caObs=pathname.match(/^\/v1\/agent-kernel\/continuing-authority\/([0-9a-f-]+)\/observations$/i);if(req.method==="POST"&&caObs?.[1]){try{return{status:201,body:{session:await this.store.continuingAuthority.recordObservation(caObs[1],await body(req))}}}catch(err){return conflict(err)}}
    const caBudget=pathname.match(/^\/v1\/agent-kernel\/continuing-authority\/([0-9a-f-]+)\/budgets\/([^/]+)\/consume$/i);if(req.method==="POST"&&caBudget?.[1]&&caBudget?.[2]){const raw=await body(req);try{return{status:200,body:{session:await this.store.continuingAuthority.consumeBudget(caBudget[1],decodeURIComponent(caBudget[2]),Number(raw?.amount))}}}catch(err){return conflict(err)}}
    const caRevoke=pathname.match(/^\/v1\/agent-kernel\/continuing-authority\/([0-9a-f-]+)\/revoke$/i);if(req.method==="POST"&&caRevoke?.[1]){const raw=await body(req);try{return{status:200,body:{session:await this.store.continuingAuthority.revoke(caRevoke[1],String(raw?.reason??"trusted gateway revocation"))}}}catch(err){return conflict(err)}}

    if(pathname==="/v1/agent-kernel/reflex/policies"){if(req.method==="GET")return{status:200,body:{policies:await this.store.reflexLayer.listPolicies()}};if(req.method==="PUT"||req.method==="POST"){try{return{status:200,body:{policy:await this.store.reflexLayer.putPolicy(await body(req))}}}catch(err){return conflict(err)}}}
    const reflexEvaluate=pathname.match(/^\/v1\/agent-kernel\/reflex\/policies\/([^/]+)\/evaluate$/i);if(req.method==="POST"&&reflexEvaluate?.[1]){const raw=await body(req);try{return{status:200,body:{decision:await this.store.reflexLayer.evaluate(decodeURIComponent(reflexEvaluate[1]),raw?.signals??[],raw?.continuingAuthoritySessionId?String(raw.continuingAuthoritySessionId):undefined)}}}catch(err){return conflict(err)}}

    if(pathname==="/v1/agent-kernel/edge/devices"){if(req.method==="GET")return{status:200,body:{devices:await this.store.edgeDevices.list()}};if(req.method==="POST"){try{return{status:201,body:{device:await this.store.edgeDevices.register(await body(req))}}}catch(err){return conflict(err)}}}
    const heartbeat=pathname.match(/^\/v1\/agent-kernel\/edge\/devices\/([^/]+)\/heartbeat$/i);if(req.method==="POST"&&heartbeat?.[1]){const raw=await body(req);try{return{status:200,body:{device:await this.store.edgeDevices.heartbeat(decodeURIComponent(heartbeat[1]),String(raw?.identityDigest??""),raw?.watchdogHealthy===undefined?undefined:Boolean(raw.watchdogHealthy))}}}catch(err){return conflict(err)}}
    const revokeDevice=pathname.match(/^\/v1\/agent-kernel\/edge\/devices\/([^/]+)\/revoke$/i);if(req.method==="POST"&&revokeDevice?.[1]){const raw=await body(req);try{return{status:200,body:{device:await this.store.edgeDevices.revoke(decodeURIComponent(revokeDevice[1]),String(raw?.reason??"trusted gateway revocation"))}}}catch(err){return conflict(err)}}
    if(req.method==="GET"&&pathname==="/v1/agent-kernel/edge/safe-state")return{status:200,body:{hooks:this.store.edgeSafeState.configured()}};

    if(pathname==="/v1/agent-kernel/edge/envelopes"){if(req.method==="GET")return{status:200,body:{envelopes:await this.store.edgeRuntime.listEnvelopes()}};if(req.method==="POST"){try{return{status:201,body:{envelope:await this.store.edgeRuntime.installEnvelope(await body(req))}}}catch(err){return conflict(err)}}}
    const issueEnvelope=pathname.match(/^\/v1\/agent-kernel\/edge\/tickets\/([0-9a-f-]+)\/envelope$/i);if(req.method==="POST"&&issueEnvelope?.[1]){const raw=await body(req);try{return{status:201,body:{envelope:await this.store.edgeAuthorityIssuer.issue({...raw,executionTicketId:issueEnvelope[1]})}}}catch(err){return conflict(err)}}
    const revokeEnvelope=pathname.match(/^\/v1\/agent-kernel\/edge\/envelopes\/([0-9a-f-]+)\/revoke$/i);if(req.method==="POST"&&revokeEnvelope?.[1]){try{return{status:200,body:{envelope:await this.store.edgeRuntime.revokeEnvelope(revokeEnvelope[1])}}}catch(err){return conflict(err)}}
    if(req.method==="POST"&&pathname==="/v1/agent-kernel/edge/authorize"){try{const result=await this.store.edgeRuntime.authorize(await body(req));return{status:result.authorized?200:403,body:result}}catch(err){return conflict(err)}}
    if(req.method==="GET"&&pathname==="/v1/agent-kernel/edge/journal")return{status:200,body:{journal:await this.store.edgeRuntime.listJournal()}};
    if(req.method==="GET"&&pathname==="/v1/agent-kernel/edge/runtime")return{status:200,body:{authority:false,executionAuthorityIssued:false,registeredProtocols:this.store.executionRouter.registeredProtocols(),safeStateHooks:this.store.edgeSafeState.configured(),deviceCount:(await this.store.edgeDevices.list()).length,envelopeCount:(await this.store.edgeRuntime.listEnvelopes()).length,journalEntries:(await this.store.edgeRuntime.listJournal()).length}};
    return null;
  }
}
