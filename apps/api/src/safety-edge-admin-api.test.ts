import {describe,expect,it,vi} from "vitest";
import {CieavSafetyEdgeAdminApi} from "./safety-edge-admin-api.js";

function req(method:string,value:unknown={}):any{const data=Buffer.from(JSON.stringify(value));return{method,async *[Symbol.asyncIterator](){if(data.length)yield data}}}
function store(){return{
  continuingAuthority:{list:vi.fn(async()=>[]),get:vi.fn(async()=>null),recordObservation:vi.fn(),consumeBudget:vi.fn(),revoke:vi.fn()},
  reflexLayer:{listPolicies:vi.fn(async()=>[]),putPolicy:vi.fn(async(x:any)=>x),evaluate:vi.fn(async()=>({decision:"CONTINUE"}))},
  edgeDevices:{list:vi.fn(async()=>[]),register:vi.fn(async(x:any)=>x),heartbeat:vi.fn(),revoke:vi.fn()},
  edgeSafeState:{configured:vi.fn(()=>[])},
  edgeRuntime:{listEnvelopes:vi.fn(async()=>[]),installEnvelope:vi.fn(),revokeEnvelope:vi.fn(),authorize:vi.fn(async()=>({authorized:false,entry:{}})),listJournal:vi.fn(async()=>[])},
  edgeAuthorityIssuer:{issue:vi.fn(async(x:any)=>x)},
  executionRouter:{registeredProtocols:vi.fn(()=>["MQTT","ROS2"])}
} as any}

describe("CieavSafetyEdgeAdminApi",()=>{
  it("binds edge envelope issuance to the ticket id in the trusted route",async()=>{const s=store(),api=new CieavSafetyEdgeAdminApi(s),ticket="11111111-1111-4111-8111-111111111111";const result=await api.handle(req("POST",{executionTicketId:"22222222-2222-4222-8222-222222222222",deviceId:"robot-1",transport:"ROS2_ACTION",resource:"/move",operation:"move",ttlSeconds:30,maxOfflineAgeMs:5000}),`/v1/agent-kernel/edge/tickets/${ticket}/envelope`);expect(result?.status).toBe(201);expect(s.edgeAuthorityIssuer.issue).toHaveBeenCalledWith(expect.objectContaining({executionTicketId:ticket,deviceId:"robot-1"}))});
  it("exposes runtime status without granting authority",async()=>{const s=store(),api=new CieavSafetyEdgeAdminApi(s);const result=await api.handle(req("GET"),"/v1/agent-kernel/edge/runtime");expect(result).toMatchObject({status:200,body:{authority:false,executionAuthorityIssued:false,registeredProtocols:["MQTT","ROS2"]}})});
  it("returns blocked edge authorization as HTTP 403",async()=>{const s=store(),api=new CieavSafetyEdgeAdminApi(s);const result=await api.handle(req("POST",{}),"/v1/agent-kernel/edge/authorize");expect(result?.status).toBe(403)});
  it("does not claim unrelated agent-kernel paths",async()=>{const api=new CieavSafetyEdgeAdminApi(store());await expect(api.handle(req("GET"),"/v1/agent-kernel/tasks")).resolves.toBeNull()});
});
