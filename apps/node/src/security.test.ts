import {mkdtemp,readFile,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach,describe,expect,it} from "vitest";
import type {EffectProposal,ToolDescriptor} from "@cieav/contracts";
import {effectInputDigest,executeEffectNodeTool} from "@cieav/core";

const dirs:string[]=[];afterEach(async()=>{await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})))});
const proposal=(input:unknown):EffectProposal=>({version:1,requestId:"00000000-0000-4000-8000-000000000001",commitmentId:"00000000-0000-4000-8000-000000000002",toolId:"node:n:c:write",provider:"EFFECT_NODE",sourceId:"n",sourceOperation:"write",actionType:"filesystem.write",input,inputDigest:effectInputDigest(input),catalogDigest:"a".repeat(64),consequenceGraphDigest:"b".repeat(64),proofObligationDigest:"c".repeat(64),createdAt:"2026-08-16T12:00:00.000Z"});
const tool=(root:string):ToolDescriptor=>({id:"node:n:c:write",provider:"EFFECT_NODE",sourceId:"n",sourceOperation:"write",name:"c.write",description:"write",inputSchema:{},consequences:["UPDATE"],requiresCommitment:true,readOnly:false,externalEffect:true,trust:"VERIFIED_NODE",available:true,constraints:{roots:[root],hosts:[],commands:[]},metadata:{capabilityKind:"FILESYSTEM"}});

describe("Effect Node execution confinement",()=>{
  it("writes only beneath configured roots",async()=>{const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-node-"));dirs.push(dir);const file=path.join(dir,"ok.txt"),result=await executeEffectNodeTool(proposal({path:file,content:"hello"}),tool(dir));expect(result.ok).toBe(true);expect(await readFile(file,"utf8")).toBe("hello")});
  it("rejects traversal outside configured roots",async()=>{const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-node-"));dirs.push(dir);const result=await executeEffectNodeTool(proposal({path:path.join(dir,"..","escape.txt"),content:"no"}),tool(dir));expect(result.ok).toBe(false);expect(result.error).toMatch(/outside_allowed_roots/i)});
});
