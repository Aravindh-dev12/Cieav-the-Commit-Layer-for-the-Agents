import {mkdtemp,readFile,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach,describe,expect,it} from "vitest";
import {CieavContinuingAuthorityStore} from "./continuing-authority.js";

const stores:CieavContinuingAuthorityStore[]=[];
afterEach(async()=>{for(const store of stores.splice(0))await store.close()});

function fabric(status:"ISSUED"|"CONSUMED"="CONSUMED"){
  return {
    async listTickets(){return[{id:"ticket-1",status,proposalId:"proposal-1",realityBoundCommitId:"commit-1"}] as any},
    async getProposalRecord(id:string){return id==="proposal-1"?{proposal:{id:"proposal-1",taskId:"task-1",subjectId:"agent-1",operation:"deploy",normalizedArgumentsDigest:"a".repeat(64)},decision:{decision:"ALLOW"}} as any:null}
  } as any;
}
async function makeStore(f=fabric()){
  const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-continuing-authority-")),file=path.join(dir,"state.json");
  const store=new CieavContinuingAuthorityStore(file,"s".repeat(64),f);stores.push(store);return{store,file};
}
function input(){return{
  subjectId:"agent-1",taskId:"task-1",proposalId:"proposal-1",realityBoundCommitId:"commit-1",executionTicketId:"ticket-1",
  operation:"deploy",normalizedArgumentsDigest:"a".repeat(64),expiresAt:new Date(Date.now()+60_000).toISOString(),
  conditions:[{id:"human-distance",metric:"human.distance.m",operator:"GTE" as const,expected:2,maxAgeMs:5_000}],
  budgets:[{dimension:"energy_wh",limit:10}]
}}

describe("CieavContinuingAuthorityStore",()=>{
  it("requires an already-consumed execution ticket",async()=>{
    const{store}=await makeStore(fabric("ISSUED"));
    await expect(store.create(input())).rejects.toThrow("consumed_execution_ticket_required");
  });

  it("allows continuation only while fresh runtime conditions remain valid",async()=>{
    const{store}=await makeStore(),session=await store.create(input());
    await store.recordObservation(session.id,{metric:"human.distance.m",value:3,observedAt:new Date().toISOString(),evidenceRef:"sensor://lidar/1"});
    await expect(store.assertMayContinue(session.id)).resolves.toMatchObject({mayContinue:true,authority:false,executionAuthorityIssued:false});
    await store.recordObservation(session.id,{metric:"human.distance.m",value:1,observedAt:new Date().toISOString(),evidenceRef:"sensor://lidar/2"});
    await expect(store.assertMayContinue(session.id)).rejects.toThrow("below minimum");
    await expect(store.get(session.id)).resolves.toMatchObject({state:"STOP_REQUIRED"});
  });

  it("fails closed when required evidence becomes stale",async()=>{
    const{store}=await makeStore(),session=await store.create(input());
    await store.recordObservation(session.id,{metric:"human.distance.m",value:3,observedAt:new Date(Date.now()-10_000).toISOString(),evidenceRef:"sensor://lidar/stale"});
    await expect(store.assertMayContinue(session.id)).rejects.toThrow("evidence is stale");
    await expect(store.get(session.id)).resolves.toMatchObject({state:"STOP_REQUIRED"});
  });

  it("enforces autonomy budgets without minting new execution authority",async()=>{
    const{store}=await makeStore(),session=await store.create({...input(),conditions:[]});
    await expect(store.consumeBudget(session.id,"energy_wh",6)).resolves.toMatchObject({state:"ACTIVE"});
    await expect(store.consumeBudget(session.id,"energy_wh",5)).rejects.toThrow("autonomy budget energy_wh exhausted");
    const stopped=await store.get(session.id);
    expect(stopped).toMatchObject({state:"STOP_REQUIRED",authority:false,executionAuthorityIssued:false});
  });

  it("detects authenticated-store tampering after restart",async()=>{
    const{store,file}=await makeStore(),session=await store.create({...input(),conditions:[]});await store.close();stores.splice(stores.indexOf(store),1);
    const raw=await readFile(file,"utf8"),env=JSON.parse(raw);env.payload.sessions[0].operation="tampered";await writeFile(file,JSON.stringify(env));
    const reopened=new CieavContinuingAuthorityStore(file,"s".repeat(64),fabric());stores.push(reopened);
    await expect(reopened.get(session.id)).rejects.toThrow("integrity check failed");
  });
});
