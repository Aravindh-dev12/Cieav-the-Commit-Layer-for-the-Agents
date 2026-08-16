import {describe,expect,it} from "vitest";
import type {ToolDescriptor} from "@cieav/contracts";
import {buildToolCatalog,descriptorFromEffectNode,filterToolDescriptors,toolCatalogDigest} from "./tool-broker.js";

const base:ToolDescriptor={id:"mcp:list",provider:"MCP",sourceId:"cieav-reality-control",sourceOperation:"list_intents",name:"list_intents",description:"List intents",inputSchema:{},consequences:["READ"],requiresCommitment:false,readOnly:true,externalEffect:false,trust:"TRUSTED_CONNECTOR",available:true,constraints:{roots:[],hosts:[],commands:[]},metadata:{}};

describe("Tool Broker v1",()=>{
  it("normalizes Effect Node capabilities without granting authority",()=>{const t=descriptorFromEffectNode("00000000-0000-4000-8000-000000000001",{id:"proc",kind:"PROCESS",operations:["run"],roots:[],hosts:[],commands:["npm"],metadata:{}},"run");expect(t.provider).toBe("EFFECT_NODE");expect(t.requiresCommitment).toBe(true);expect(t.consequences).toContain("EXECUTE_CODE")});
  it("filters monotonically and excludes external effects by default",()=>{const external={...base,id:"a2a:send",provider:"A2A" as const,externalEffect:true,requiresCommitment:true};expect(filterToolDescriptors([base,external],{allowExternalEffects:false,allowCommitmentRequired:true,maximumTools:200})).toEqual([base])});
  it("fails closed on conflicting duplicate descriptors",()=>{expect(()=>filterToolDescriptors([base,{...base,description:"different"}],{allowExternalEffects:true,allowCommitmentRequired:true,maximumTools:200})).toThrow(/conflicting tool descriptor/i)});
  it("builds stable non-authoritative catalogs",()=>{const policy={allowExternalEffects:true,allowCommitmentRequired:true,maximumTools:200};const a=buildToolCatalog([base],policy,"2026-08-16T12:00:00.000Z");expect(a.executionAuthority).toBe(false);expect(a.catalogDigest).toBe(toolCatalogDigest(a.tools));expect(toolCatalogDigest([base])).toBe(toolCatalogDigest([base]))});
});
