import {afterEach,describe,expect,it} from "vitest";
import {mkdtemp,rm,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {CieavAgentKernelStore} from "./agent-kernel.js";
import {CieavAuthorityGradeExporter} from "./authority-grade-exporter.js";

const dirs:string[]=[];
afterEach(async()=>{await Promise.all(dirs.splice(0).map(dir=>rm(dir,{recursive:true,force:true})))});

describe("CieavAuthorityGradeExporter",()=>{
  it("fails closed when the authenticated Execution Fabric store is tampered",async()=>{
    const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-authority-grade-"));dirs.push(dir);
    await writeFile(path.join(dir,"execution-fabric-state.json"),JSON.stringify({payload:{version:1,proposals:[]},mac:"forged-but-not-authenticated"}),"utf8");
    const kernel=new CieavAgentKernelStore(path.join(dir,"agent-kernel-state.json"),"k".repeat(64));
    const exporter=new CieavAuthorityGradeExporter(kernel,{} as any);
    await expect(exporter.exportByTicket("11111111-1111-4111-8111-111111111111","test-redaction-v1")).rejects.toThrow("integrity check failed");
  });

  it("requires a consumed one-use execution ticket before reading settlement evidence",async()=>{
    const ticket={id:"11111111-1111-4111-8111-111111111111",status:"ISSUED",proposalId:"22222222-2222-4222-8222-222222222222"};
    const kernel={executionFabric:{listTickets:async()=>[ticket]}} as any;
    const exporter=new CieavAuthorityGradeExporter(kernel,{} as any);
    await expect(exporter.exportByTicket(ticket.id,"test-redaction-v1")).rejects.toThrow("authority_grade_consumed_ticket_required");
  });
});
