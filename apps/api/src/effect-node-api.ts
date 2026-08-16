import crypto from "node:crypto";
import type {IncomingMessage} from "node:http";
import {EffectNodeHeartbeatSchema,EffectNodePairingRequestSchema} from "@cieav/contracts";
import {CieavEffectAuthority} from "./effect-authority.js";
import {CieavEffectNodeRegistry} from "./effect-node-registry.js";

async function parseBody(req:IncomingMessage){const chunks:Buffer[]=[];let size=0;for await(const chunk of req){const b=Buffer.from(chunk);size+=b.length;if(size>512_000)throw new Error("body_too_large");chunks.push(b)}return chunks.length?JSON.parse(Buffer.concat(chunks).toString("utf8")):{} }
export type EffectNodeRouteResult={status:number;body:unknown};

export class CieavEffectNodeApi{
  constructor(readonly registry:CieavEffectNodeRegistry,readonly authority:CieavEffectAuthority,private readonly transportSecret:string){if(transportSecret.length<32)throw new Error("CIEAV node transport secret is too weak")}
  transportToken(nodeId:string){return crypto.createHmac("sha256",this.transportSecret).update(`cieav-node-transport-v1:${nodeId}`).digest("base64url")}
  async handlePair(req:IncomingMessage):Promise<EffectNodeRouteResult>{const input=EffectNodePairingRequestSchema.parse(await parseBody(req)),node=await this.registry.pair(input),gatewayAuthority=await this.authority.publicIdentity();return{status:201,body:{node,gatewayAuthority,nodeTransportToken:this.transportToken(node.nodeId)}}}
  async handleHeartbeat(req:IncomingMessage):Promise<EffectNodeRouteResult>{const heartbeat=EffectNodeHeartbeatSchema.parse(await parseBody(req)),node=await this.registry.heartbeat(heartbeat);return{status:200,body:{node}}}
  async handleGateway(req:IncomingMessage,pathname:string):Promise<EffectNodeRouteResult|null>{
    if(req.method==="POST"&&pathname==="/v1/nodes/pairing-code")return{status:201,body:this.registry.issuePairingCode()};
    if(req.method==="GET"&&pathname==="/v1/nodes")return{status:200,body:{nodes:await this.registry.list(),gatewayAuthority:await this.authority.publicIdentity()}};
    const q=pathname.match(/^\/v1\/nodes\/([0-9a-f-]+)\/quarantine$/i);if(req.method==="POST"&&q?.[1]){const raw=await parseBody(req),reason=typeof raw?.reason==="string"&&raw.reason.trim()?raw.reason:"Quarantined by local Gateway operator.";return{status:200,body:{node:await this.registry.quarantine(q[1],reason)}}}
    const r=pathname.match(/^\/v1\/nodes\/([0-9a-f-]+)\/restore$/i);if(req.method==="POST"&&r?.[1])return{status:200,body:{node:await this.registry.restore(r[1])}};
    return null;
  }
}
