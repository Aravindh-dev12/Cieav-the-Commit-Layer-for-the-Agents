import {mkdtemp,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach,describe,expect,it} from "vitest";
import {CieavEffectNodeRegistry} from "./effect-node-registry.js";
import {CieavToolBroker} from "./tool-broker.js";

const dirs:string[]=[];afterEach(async()=>{await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})))});
async function broker(){const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-tool-broker-"));dirs.push(dir);return new CieavToolBroker(new CieavEffectNodeRegistry(path.join(dir,"nodes.json"),"s".repeat(48)))}
const mcp={id:"mcp:list_intents",provider:"MCP" as const,sourceId:"cieav-reality-control",sourceOperation:"list_intents",name:"list_intents",description:"List authorized intents",inputSchema:{},consequences:["READ" as const],requiresCommitment:false,readOnly:true,externalEffect:false,trust:"TRUSTED_CONNECTOR" as const,available:true,constraints:{roots:[],hosts:[],commands:[]},metadata:{}};

describe("CIEAV Tool Broker runtime",()=>{
  it("registers trusted descriptors and emits non-authoritative catalogs",async()=>{const b=await broker();b.register(mcp);const catalog=await b.catalog({allowExternalEffects:false,allowCommitmentRequired:true,maximumTools:200});expect(catalog.tools.map(t=>t.id)).toEqual([mcp.id]);expect(catalog.executionAuthority).toBe(false);expect(catalog.catalogDigest).toMatch(/^[0-9a-f]{64}$/)});
  it("does not accept Effect Node tools outside the verified registry",async()=>{const b=await broker();expect(()=>b.register({...mcp,id:"node:fake",provider:"EFFECT_NODE",trust:"VERIFIED_NODE"})).toThrow(/verified_node_registry/i)});
  it("fails closed on conflicting registrations",async()=>{const b=await broker();b.register(mcp);expect(()=>b.register({...mcp,description:"changed"})).toThrow(/conflict/i)});
  it("can narrow catalog visibility without enlarging source capabilities",async()=>{const b=await broker();b.register(mcp);b.register({...mcp,id:"browser:read",provider:"BROWSER",sourceId:"browser",sourceOperation:"observe",name:"observe",description:"Observe page"});const catalog=await b.catalog({allowedProviders:["MCP"],allowExternalEffects:false,allowCommitmentRequired:true,maximumTools:200});expect(catalog.tools).toHaveLength(1);expect(catalog.tools[0]?.provider).toBe("MCP")});
});
