import {afterEach,describe,expect,it} from "vitest";
import {mkdtemp,rm,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {CieavAuthorityGradeExporter} from "./authority-grade-exporter.js";

const dirs:string[]=[];
afterEach(async()=>{await Promise.all(dirs.splice(0).map(dir=>rm(dir,{recursive:true,force:true})))});

describe("CieavAuthorityGradeExporter",()=>{
  it("fails closed when the persisted execution fabric envelope is tampered",async()=>{
    const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-authority-grade-"));dirs.push(dir);
    const file=path.join(dir,"execution-fabric-state.json");
    await writeFile(file,JSON.stringify({payload:{version:1,proposals:[]},mac:"forged-but-not-authenticated"}),"utf8");
    const ticket={
      id:"11111111-1111-4111-8111-111111111111",status:"CONSUMED",consumedAt:new Date().toISOString(),
      proposalId:"22222222-2222-4222-8222-222222222222",taskId:"33333333-3333-4333-8333-333333333333",
      realityBoundCommitId:"44444444-4444-4444-8444-444444444444"
    };
    const kernel={executionFabric:{listTickets:async()=>[ticket]}} as any;
    const proofStore={} as any;
    const exporter=new CieavAuthorityGradeExporter(kernel,proofStore,file,"k".repeat(64));
    await expect(exporter.exportByTicket(ticket.id,"test-redaction-v1")).rejects.toThrow("authority_grade_execution_envelope_integrity_failed");
  });

  it("requires a consumed one-use execution ticket before reading settlement evidence",async()=>{
    const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-authority-grade-"));dirs.push(dir);
    const file=path.join(dir,"execution-fabric-state.json");
    const ticket={id:"11111111-1111-4111-8111-111111111111",status:"ISSUED",proposalId:"22222222-2222-4222-8222-222222222222"};
    const kernel={executionFabric:{listTickets:async()=>[ticket]}} as any;
    const exporter=new CieavAuthorityGradeExporter(kernel,{} as any,file,"k".repeat(64));
    await expect(exporter.exportByTicket(ticket.id,"test-redaction-v1")).rejects.toThrow("authority_grade_consumed_ticket_required");
  });
});
