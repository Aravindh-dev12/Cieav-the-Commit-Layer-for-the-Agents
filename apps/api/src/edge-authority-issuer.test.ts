import crypto from "node:crypto";
import {describe,expect,it} from "vitest";
import {CieavEdgeAuthorityIssuer} from "./edge-authority-issuer.js";
import {CieavEdgeRuntime} from "./edge-runtime.js";
import {mkdtemp} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const ticket={id:"11111111-1111-4111-8111-111111111111",proposalId:"22222222-2222-4222-8222-222222222222",status:"CONSUMED",consumedAt:new Date().toISOString(),authorizationDigest:"a".repeat(64),realityBoundCommitId:"33333333-3333-4333-8333-333333333333",routeDigest:"b".repeat(64)};
const proposal={id:ticket.proposalId,subjectId:"agent-1",toolId:"ros.arm",protocol:"ROS2",operation:"send_goal",target:"/arm_controller/follow_joint_trajectory",normalizedArgumentsDigest:"c".repeat(64)};
const tool={id:"ros.arm",enabled:true,protocol:"ROS2",operation:"send_goal",downstreamRef:"/arm_controller/follow_joint_trajectory"};
function fabric(overrides:{ticket?:any;proposal?:any;tool?:any;decision?:"ALLOW"|"BLOCK"}={}){return{async listTickets(){return[overrides.ticket??ticket]},async getProposalRecord(id:string){return id===ticket.proposalId?{proposal:overrides.proposal??proposal,decision:{decision:overrides.decision??"ALLOW"}}:null},async listTools(){return[overrides.tool??tool]}} as any}
const input=(overrides:Record<string,unknown>={})=>({executionTicketId:ticket.id,deviceId:"edge-arm-1",transport:"ROS2_ACTION",resource:proposal.target,operation:proposal.operation,ttlSeconds:60,maxOfflineAgeMs:10_000,...overrides});

describe("CieavEdgeAuthorityIssuer",()=>{
  it("derives a one-use exact envelope that the edge verifier accepts",async()=>{const secret="v".repeat(64),issuer=new CieavEdgeAuthorityIssuer(secret,fabric()),envelope=await issuer.issue(input());expect(envelope).toMatchObject({allowedOperations:[proposal.operation],allowedArgumentDigests:[proposal.normalizedArgumentsDigest],maxUses:1,authority:false,executionAuthorityIssued:false});const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-edge-issuer-")),runtime=new CieavEdgeRuntime(path.join(dir,"edge.json"),"s".repeat(64),secret);await expect(runtime.installEnvelope(envelope)).resolves.toMatchObject({id:envelope.id});await runtime.close()});
  it("refuses to derive from an unconsumed ticket",async()=>{const issuer=new CieavEdgeAuthorityIssuer("v".repeat(64),fabric({ticket:{...ticket,status:"ISSUED",consumedAt:undefined}}));await expect(issuer.issue(input())).rejects.toThrow("consumed_execution_ticket_required")});
  it("cannot broaden the authorized operation or target",async()=>{const issuer=new CieavEdgeAuthorityIssuer("v".repeat(64),fabric());await expect(issuer.issue(input({operation:"override_limits"}))).rejects.toThrow("edge_operation_must_match_authorized_proposal");await expect(issuer.issue(input({resource:"/other_controller"}))).rejects.toThrow("edge_resource_must_match_authorized_target")});
  it("rejects non-edge protocols and non-ALLOW source authorization",async()=>{const issuerHttp=new CieavEdgeAuthorityIssuer("v".repeat(64),fabric({tool:{...tool,protocol:"HTTP"},proposal:{...proposal,protocol:"HTTP"}}));await expect(issuerHttp.issue(input())).rejects.toThrow("edge_envelope_requires_ros2_or_mqtt_tool");const issuerBlocked=new CieavEdgeAuthorityIssuer("v".repeat(64),fabric({decision:"BLOCK"}));await expect(issuerBlocked.issue(input())).rejects.toThrow("formal_authorization_not_allow")});
  it("binds the envelope to the exact source transaction",async()=>{const issuer=new CieavEdgeAuthorityIssuer("v".repeat(64),fabric()),one=await issuer.issue(input()),two=await issuer.issue(input({deviceId:"edge-arm-2"}));expect(one.authorityBindingDigest).not.toBe(two.authorityBindingDigest);expect(one.signature).not.toBe(two.signature);expect(crypto.createHash("sha256").update(one.signature).digest("hex")).toMatch(/^[a-f0-9]{64}$/)});
});
