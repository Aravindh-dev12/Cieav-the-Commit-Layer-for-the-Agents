import crypto from "node:crypto";
import {z} from "zod";
import type {CieavExecutionFabricStore} from "./execution-fabric.js";

const Hex64=z.string().regex(/^[a-f0-9]{64}$/);
const IssueSchema=z.object({
  executionTicketId:z.string().uuid(),deviceId:z.string().min(1).max(500),transport:z.enum(["ROS2_ACTION","ROS2_SERVICE","ROS2_TOPIC","MQTT_PUBLISH"]),
  resource:z.string().min(1).max(1000),operation:z.string().min(1).max(300),ttlSeconds:z.number().int().positive().max(3600),maxOfflineAgeMs:z.number().int().positive().max(3600_000)
}).strict();
const EnvelopeBaseSchema=z.object({
  id:z.string().uuid(),version:z.literal(1),protocol:z.literal("CIEAV_EDGE_PREDELEGATION_V1"),authority:z.literal(false),executionAuthorityIssued:z.literal(false),
  deviceId:z.string(),allowedTransports:z.array(z.enum(["ROS2_ACTION","ROS2_SERVICE","ROS2_TOPIC","MQTT_PUBLISH"])),allowedResources:z.array(z.string()),allowedOperations:z.array(z.string()),allowedArgumentDigests:z.array(Hex64),
  authorityBindingDigest:Hex64,issuerProofRef:z.string(),issuedAt:z.string().datetime(),expiresAt:z.string().datetime(),maxOfflineAgeMs:z.number().int().positive(),maxUses:z.literal(1)
}).strict();

type FabricView=Pick<CieavExecutionFabricStore,"listTickets"|"getProposalRecord"|"listTools">;
const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value as Record<string,unknown>).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(",")}}`:JSON.stringify(value)??"undefined";
const digest=(value:unknown)=>crypto.createHash("sha256").update(canonical(value)).digest("hex");

export class CieavEdgeAuthorityIssuer{
  constructor(private readonly verificationSecret:string,private readonly fabric:FabricView){if(verificationSecret.length<32)throw new Error("CIEAV edge authority issuer secret is too weak")}
  private sign(base:z.infer<typeof EnvelopeBaseSchema>){return crypto.createHmac("sha256",this.verificationSecret).update(`cieav-edge-predelegation-v1\n${canonical(base)}`).digest("base64url")}
  async issue(raw:unknown){
    const input=IssueSchema.parse(raw),tickets=await this.fabric.listTickets(),ticket=tickets.find(x=>x.id===input.executionTicketId);
    if(!ticket||ticket.status!=="CONSUMED")throw new Error("consumed_execution_ticket_required");
    const record=await this.fabric.getProposalRecord(ticket.proposalId);if(!record)throw new Error("execution_proposal_not_found");
    if(record.decision.decision!=="ALLOW")throw new Error("formal_authorization_not_allow");
    const proposal=record.proposal,tools=await this.fabric.listTools(),tool=tools.find(x=>x.id===proposal.toolId&&x.enabled);if(!tool)throw new Error("registered_tool_not_active");
    if(!["ROS2","MQTT"].includes(tool.protocol)||tool.protocol!==proposal.protocol)throw new Error("edge_envelope_requires_ros2_or_mqtt_tool");
    const expectedTransport=tool.protocol==="MQTT"?"MQTT_PUBLISH":input.transport;
    if(tool.protocol==="MQTT"&&input.transport!=="MQTT_PUBLISH")throw new Error("edge_transport_protocol_mismatch");
    if(tool.protocol==="ROS2"&&!input.transport.startsWith("ROS2_"))throw new Error("edge_transport_protocol_mismatch");
    if(proposal.operation!==input.operation)throw new Error("edge_operation_must_match_authorized_proposal");
    if(proposal.target&&proposal.target!==input.resource)throw new Error("edge_resource_must_match_authorized_target");
    if(!proposal.target&&tool.downstreamRef!==input.resource)throw new Error("edge_resource_must_match_registered_tool");
    const now=Date.now(),ticketConsumedAt=Date.parse(ticket.consumedAt??"");if(!Number.isFinite(ticketConsumedAt))throw new Error("consumed_execution_ticket_timestamp_required");
    const ttl=Math.min(input.ttlSeconds,3600),expiresAt=Math.min(now+ttl*1000,ticketConsumedAt+3600_000);if(expiresAt<=now)throw new Error("edge_authority_source_too_old");
    const authorityBindingDigest=digest({protocol:"CIEAV_EDGE_AUTHORITY_ATTENUATION_V1",ticketId:ticket.id,proposalId:proposal.id,authorizationDigest:ticket.authorizationDigest,realityBoundCommitId:ticket.realityBoundCommitId,routeDigest:ticket.routeDigest,subjectId:proposal.subjectId,deviceId:input.deviceId,transport:expectedTransport,resource:input.resource,operation:proposal.operation,normalizedArgumentsDigest:proposal.normalizedArgumentsDigest});
    const base=EnvelopeBaseSchema.parse({id:crypto.randomUUID(),version:1,protocol:"CIEAV_EDGE_PREDELEGATION_V1",authority:false,executionAuthorityIssued:false,deviceId:input.deviceId,allowedTransports:[expectedTransport],allowedResources:[input.resource],allowedOperations:[proposal.operation],allowedArgumentDigests:[proposal.normalizedArgumentsDigest],authorityBindingDigest,issuerProofRef:`cieav://execution-ticket/${ticket.id}`,issuedAt:new Date(now).toISOString(),expiresAt:new Date(expiresAt).toISOString(),maxOfflineAgeMs:Math.min(input.maxOfflineAgeMs,ttl*1000),maxUses:1});
    return{...base,signature:this.sign(base),used:0};
  }
}
