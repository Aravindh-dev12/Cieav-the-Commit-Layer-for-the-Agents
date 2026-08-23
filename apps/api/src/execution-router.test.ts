import {describe,expect,it,vi} from "vitest";
import type {ExecutionProposal,ExecutionTicket,FederatedTool} from "@cieav/contracts/execution-fabric";
import {CieavExecutionRouter,type CieavExecutionAdapter} from "./execution-router.js";
import type {CieavExecutionFabricStore} from "./execution-fabric.js";
import type {CieavControlPlaneStore} from "./control-plane.js";
import type {CieavContinuingAuthorityStore} from "./continuing-authority.js";

const ticket={id:"11111111-1111-4111-8111-111111111111",version:1 as const,proposalId:"22222222-2222-4222-8222-222222222222",intentId:"33333333-3333-4333-8333-333333333333",taskId:"44444444-4444-4444-8444-444444444444",toolId:"gmail.send",authorizationDigest:"a".repeat(64),realityBoundCommitId:"55555555-5555-4555-8555-555555555555",credentialLeaseId:"66666666-6666-4666-8666-666666666666",routeDigest:"b".repeat(64),issuedAt:"2026-08-19T00:00:00.000Z",expiresAt:"2026-08-19T23:00:00.000Z",status:"ISSUED" as const} satisfies ExecutionTicket;
const tool={id:"gmail.send",displayName:"Gmail Send",protocol:"MCP" as const,operation:"send",downstreamRef:"mcp://gmail/send",credentialMode:"CIEAV_INJECTED" as const,risk:"HIGH" as const,consequenceCapable:true,proofSources:["provider"],enabled:true} satisfies FederatedTool;
const proposal={id:ticket.proposalId,version:1 as const,taskId:ticket.taskId,intentId:ticket.intentId,scopeDeviceId:"dev_test_12345678",subjectId:"agent-1",identityAttestationId:"77777777-7777-4777-8777-777777777777",credentialLeaseId:ticket.credentialLeaseId,toolId:tool.id,protocol:"MCP" as const,operation:"send",target:"mailto:customer@example.com",risk:"HIGH" as const,normalizedArgumentsDigest:"c".repeat(64),semanticEffect:{kind:"COMMUNICATE" as const,target:"customer@example.com",attributes:{}},realityWitness:{version:1 as const,observedAt:"2026-08-19T00:00:00.000Z",facts:[{key:"message",valueDigest:"d".repeat(64),source:"provider",observedAt:"2026-08-19T00:00:00.000Z"}],digest:"e".repeat(64)},expectedPostStateDigest:"f".repeat(64),proofObligationDigest:"1".repeat(64),attenuationWitnessIds:[],createdAt:"2026-08-19T00:00:00.000Z"} satisfies ExecutionProposal;
const continuingTool={...tool,executionMode:"CONTINUING" as const} satisfies FederatedTool;
const continuingProposal={...proposal,continuingAuthority:{ttlSeconds:60,conditions:[{id:"watchdog",metric:"watchdog.ok",operator:"TRUE" as const,maxAgeMs:5_000}],budgets:[]}} satisfies ExecutionProposal;
const args={to:"customer@example.com"};
const mandate={id:"88888888-8888-4888-8888-888888888888",version:1 as const,rootIntentId:proposal.intentId,taskId:proposal.taskId,proposalId:proposal.id,subjectId:proposal.subjectId,identityAttestationId:proposal.identityAttestationId,permissionGraphDigest:"2".repeat(64),authorizationDecisionDigest:"3".repeat(64),realityBoundCommitId:ticket.realityBoundCommitId,effectKey:"4".repeat(64),routeDigest:"5".repeat(64),normalizedArgumentsDigest:"6".repeat(64),expectedPostStateDigest:proposal.expectedPostStateDigest,proofObligationDigest:proposal.proofObligationDigest,interpositionPostureDigest:"7".repeat(64),issuedAt:"2026-08-19T00:00:00.000Z",expiresAt:"2026-08-19T23:00:00.000Z",maxUses:1 as const,status:"ISSUED" as const,signatureAlgorithm:"HMAC-SHA256" as const,signature:"x".repeat(32)};

function fabric(sequence:string[]=[],overrides:{proposal?:ExecutionProposal;tool?:FederatedTool}={}){
  const activeProposal=overrides.proposal??proposal,activeTool=overrides.tool??tool;
  const inspectTicket=vi.fn(async()=>({ticket,proposal:activeProposal,tool:activeTool}));
  const consumeTicket=vi.fn(async()=>{sequence.push("ticket");return{ticket:{...ticket,status:"CONSUMED" as const,consumedAt:"2026-08-19T00:00:01.000Z"},proposal:activeProposal,tool:activeTool,normalizedArguments:args}});
  const recordExecutionAttempt=vi.fn(async()=>({audit:{}}));
  return{store:{inspectTicket,consumeTicket,recordExecutionAttempt} as unknown as CieavExecutionFabricStore,inspectTicket,consumeTicket,recordExecutionAttempt};
}
function control(sequence:string[]=[],withMandate=true){
  const getPosture=vi.fn(async()=>({mode:"MANDATORY",ready:true}));
  const listMandates=vi.fn(async()=>withMandate?[mandate]:[]);
  const consumeMandate=vi.fn(async()=>{sequence.push("mandate");return{...mandate,status:"CONSUMED" as const,consumedAt:"2026-08-19T00:00:00.500Z"}});
  const recordAttempt=vi.fn(async(x:any)=>x);
  return{store:{getPosture,listMandates,consumeMandate,recordAttempt} as unknown as CieavControlPlaneStore,getPosture,listMandates,consumeMandate,recordAttempt};
}
function continuing(sequence:string[]=[],unsafe=false){
  const create=vi.fn(async()=>{sequence.push("session");return{id:"99999999-9999-4999-8999-999999999999"}});
  const recordObservation=vi.fn(async()=>{sequence.push("observation");return{}});
  const consumeBudget=vi.fn(async()=>({}));
  const assertMayContinue=vi.fn(async()=>{sequence.push("continue");if(unsafe)throw new Error("watchdog unsafe");return{mayContinue:true}});
  const complete=vi.fn(async()=>{sequence.push("complete");return{state:"COMPLETED"}});
  const revoke=vi.fn(async()=>{sequence.push("revoke");return{state:"REVOKED"}});
  return{store:{create,recordObservation,consumeBudget,assertMayContinue,complete,revoke} as unknown as CieavContinuingAuthorityStore,create,recordObservation,consumeBudget,assertMayContinue,complete,revoke};
}

describe("CIEAV mandatory execution router",()=>{
  it("checks adapter availability before consuming one-use authority",async()=>{const f=fabric(),router=new CieavExecutionRouter(f.store);await expect(router.dispatch(ticket.id,args)).rejects.toThrow("execution_adapter_unavailable:MCP");expect(f.inspectTicket).toHaveBeenCalledOnce();expect(f.consumeTicket).not.toHaveBeenCalled()});

  it("consumes exact arguments before invoking the adapter",async()=>{const sequence:string[]=[],f=fabric(sequence),execute=vi.fn(async()=>{sequence.push("execute");return{attemptedAt:"2026-08-19T00:00:02.000Z",transport:"ACCEPTED" as const,evidenceSeeds:[{kind:"provider",source:"gmail",summary:"Provider accepted request"}]}}),adapter:CieavExecutionAdapter={protocol:"MCP",execute},router=new CieavExecutionRouter(f.store,[adapter]);const out=await router.dispatch(ticket.id,args);expect(f.consumeTicket).toHaveBeenCalledWith(ticket.id,args);expect(sequence).toEqual(["ticket","execute"]);expect(out.result.transport).toBe("ACCEPTED");expect(f.recordExecutionAttempt).toHaveBeenCalledWith(ticket.id,"ACCEPTED",expect.any(String),expect.any(Object))});

  it("selects exactly one MCP transport when multiple trusted adapters share the protocol",async()=>{const sequence:string[]=[],f=fabric(sequence),stdio:CieavExecutionAdapter={protocol:"MCP",supports:()=>false,execute:async()=>{sequence.push("stdio");return{attemptedAt:new Date().toISOString(),transport:"ACCEPTED",evidenceSeeds:[]}}},remote:CieavExecutionAdapter={protocol:"MCP",supports:()=>true,execute:async()=>{sequence.push("remote");return{attemptedAt:new Date().toISOString(),transport:"ACCEPTED",evidenceSeeds:[]}}},router=new CieavExecutionRouter(f.store,[stdio,remote]);await router.dispatch(ticket.id,args);expect(sequence).toEqual(["ticket","remote"])});

  it("fails closed when two adapters claim the same protocol action",async()=>{const f=fabric(),one:CieavExecutionAdapter={protocol:"MCP",supports:()=>true,execute:async()=>({attemptedAt:new Date().toISOString(),transport:"ACCEPTED",evidenceSeeds:[]})},two:CieavExecutionAdapter={...one};const router=new CieavExecutionRouter(f.store,[one,two]);await expect(router.dispatch(ticket.id,args)).rejects.toThrow("execution_adapter_ambiguous:MCP");expect(f.consumeTicket).not.toHaveBeenCalled()});

  it("requires and consumes an Operation Mandate before the Execution Ticket in MANDATORY posture",async()=>{const sequence:string[]=[],f=fabric(sequence),c=control(sequence),adapter:CieavExecutionAdapter={protocol:"MCP",execute:async()=>{sequence.push("execute");return{attemptedAt:"2026-08-19T00:00:02.000Z",transport:"ACCEPTED",evidenceSeeds:[]}}},router=new CieavExecutionRouter(f.store,[adapter],c.store);await router.dispatch(ticket.id,args);expect(sequence).toEqual(["mandate","ticket","execute"]);expect(c.consumeMandate).toHaveBeenCalledWith(mandate.id,proposal,args);expect(c.recordAttempt).toHaveBeenCalledOnce()});

  it("refuses mandatory dispatch when no Operation Mandate exists",async()=>{const f=fabric(),c=control([],false),adapter:CieavExecutionAdapter={protocol:"MCP",execute:async()=>({attemptedAt:new Date().toISOString(),transport:"ACCEPTED",evidenceSeeds:[]})},router=new CieavExecutionRouter(f.store,[adapter],c.store);await expect(router.dispatch(ticket.id,args)).rejects.toThrow("operation_mandate_required_for_mandatory_dispatch");expect(f.consumeTicket).not.toHaveBeenCalled()});

  it("records UNKNOWN when an adapter throws after authority is consumed",async()=>{const f=fabric(),adapter:CieavExecutionAdapter={protocol:"MCP",execute:async()=>{throw new Error("socket closed after write")}},router=new CieavExecutionRouter(f.store,[adapter]);await expect(router.dispatch(ticket.id,args)).rejects.toThrow("execution_adapter_outcome_unknown");expect(f.consumeTicket).toHaveBeenCalledOnce();expect(f.recordExecutionAttempt).toHaveBeenCalledWith(ticket.id,"UNKNOWN",expect.stringContaining("quarantined"),expect.any(Object))});

  it("refuses a CONTINUING tool before consuming its ticket when the adapter lacks continuing-safety support",async()=>{const f=fabric([],{tool:continuingTool,proposal:continuingProposal}),execute=vi.fn(async()=>({attemptedAt:new Date().toISOString(),transport:"ACCEPTED" as const,evidenceSeeds:[]})),adapter:CieavExecutionAdapter={protocol:"MCP",execute},router=new CieavExecutionRouter(f.store,[adapter]);await expect(router.dispatch(ticket.id,args)).rejects.toThrow("execution_adapter_lacks_continuing_authority:MCP");expect(f.consumeTicket).not.toHaveBeenCalled();expect(execute).not.toHaveBeenCalled()});

  it("runs the initial continuing-authority safety gate before the adapter's first downstream effect",async()=>{const sequence:string[]=[],f=fabric(sequence,{tool:continuingTool,proposal:continuingProposal}),ca=continuing(sequence),collectInitialSafety=vi.fn(async()=>{sequence.push("observe");return{observations:[{metric:"watchdog.ok",value:true,observedAt:new Date().toISOString(),evidenceRef:"watchdog://local/1"}]}}),execute=vi.fn(async()=>{sequence.push("execute");return{attemptedAt:new Date().toISOString(),transport:"ACCEPTED" as const,evidenceSeeds:[]}}),adapter:CieavExecutionAdapter={protocol:"MCP",supportsContinuingAuthority:true,collectInitialSafety,execute},router=new CieavExecutionRouter(f.store,[adapter],undefined,undefined,ca.store);await router.dispatch(ticket.id,args);expect(sequence).toEqual(["ticket","session","observe","observation","continue","execute","continue","complete"]);expect(ca.create).toHaveBeenCalledOnce();expect(execute).toHaveBeenCalledOnce()});

  it("records REJECTED and never executes when the initial continuing-authority safety gate fails",async()=>{const sequence:string[]=[],f=fabric(sequence,{tool:continuingTool,proposal:continuingProposal}),ca=continuing(sequence,true),execute=vi.fn(async()=>{sequence.push("execute");return{attemptedAt:new Date().toISOString(),transport:"ACCEPTED" as const,evidenceSeeds:[]}}),adapter:CieavExecutionAdapter={protocol:"MCP",supportsContinuingAuthority:true,collectInitialSafety:async()=>({observations:[{metric:"watchdog.ok",value:false,observedAt:new Date().toISOString(),evidenceRef:"watchdog://local/fault"}]}),execute},router=new CieavExecutionRouter(f.store,[adapter],undefined,undefined,ca.store);await expect(router.dispatch(ticket.id,args)).rejects.toThrow("continuing_authority_initial_gate_blocked");expect(execute).not.toHaveBeenCalled();expect(ca.revoke).toHaveBeenCalledOnce();expect(f.recordExecutionAttempt).toHaveBeenCalledWith(ticket.id,"REJECTED",expect.stringContaining("safety gate blocked"),expect.any(Object))});
});
