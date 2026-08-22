import {describe,expect,it} from "vitest";
import type {CognitiveCellDescriptor} from "@cieav/contracts";
import {CognitiveCellRegistry} from "./cognitive-runtime.js";
import {buildCortexProgram,buildIntelligenceStateFromRegistry,cognitiveCellToEngine} from "./cortex.js";

const now="2026-08-22T14:30:00.000Z";
const cell=(overrides:Partial<CognitiveCellDescriptor>={}):CognitiveCellDescriptor=>({version:"CIEAV_COGNITIVE_CELL_V1",id:"local-reasoner",type:"MODEL",provider:"local",capabilities:["reason"],inputModalities:["text"],outputModalities:["text"],local:true,privacyBoundary:"LOCAL_ONLY",health:"HEALTHY",lastHeartbeatAt:now,competence:{reason:.9},proofCapabilities:[],authority:false,mayMintExecutionAuthority:false,...overrides});

describe("Cortex runtime",()=>{
  it("converts admissible cognitive cells to zero-authority engines",()=>{
    expect(cognitiveCellToEngine(cell())).toMatchObject({id:"local-reasoner",kind:"MODEL",local:true,authority:false});
    expect(cognitiveCellToEngine(cell({id:"external-agent",type:"AGENT",provider:"mcp",local:false,privacyBoundary:"REDACTED_REMOTE_ALLOWED"}))).toMatchObject({id:"external-agent",kind:"AGENT",local:false,authority:false});
    expect(cognitiveCellToEngine(cell({id:"robot",type:"ROBOT"}))).toBeNull();
    expect(cognitiveCellToEngine(cell({id:"tool",type:"TOOL"}))).toBeNull();
  });

  it("builds Intelligence State from healthy live cells and respects LOCAL_ONLY",()=>{
    const registry=new CognitiveCellRegistry();registry.register(cell());registry.register(cell({id:"remote-reasoner",provider:"remote",local:false,privacyBoundary:"REDACTED_REMOTE_ALLOWED"}));registry.register(cell({id:"remote-agent",type:"AGENT",provider:"mcp",local:false,privacyBoundary:"REDACTED_REMOTE_ALLOWED"}));
    const state=buildIntelligenceStateFromRegistry(registry,{objective:"repair code",self:{now:"2026-08-22T14:30:10.000Z",privacy:"LOCAL_ONLY"},uncertainty:.4});
    expect(state.availableEngines.map(x=>x.id)).toEqual(["local-reasoner"]);expect(state).toMatchObject({authority:false,mayMintExecutionAuthority:false});
  });

  it("produces a real deterministic cognitive program from registered cells",()=>{
    const registry=new CognitiveCellRegistry();registry.register(cell());registry.register(cell({id:"proof-local",type:"PROOF_PROVIDER",provider:"proof",capabilities:["prove"],competence:{prove:.8}}));
    const {program}=buildCortexProgram(registry,{objective:"repair code",self:{now:"2026-08-22T14:30:10.000Z",privacy:"LOCAL_ONLY"},uncertainty:.4});
    expect(program.strategy).toBe("EVIDENCE_AWARE_REASONING");expect(program.steps.map(x=>x.kind)).toEqual(["MODEL","PROVE"]);expect(program.authority).toBe(false);
  });

  it("uses an external agent as bounded cognition when no model or qualified skill is admissible",()=>{
    const registry=new CognitiveCellRegistry();registry.register(cell({id:"mcp-coder",type:"AGENT",provider:"mcp",local:false,privacyBoundary:"REDACTED_REMOTE_ALLOWED",competence:{code:.8}}));
    const {state,program}=buildCortexProgram(registry,{objective:"inspect a repository and propose a repair",self:{now:"2026-08-22T14:30:10.000Z",privacy:"REDACTED_REMOTE_ALLOWED"},uncertainty:.3});
    expect(state.availableEngines).toEqual([expect.objectContaining({id:"mcp-coder",kind:"AGENT",authority:false})]);
    expect(program.strategy).toBe("BOUNDED_AGENT_DELEGATION");expect(program.steps[0]).toMatchObject({kind:"AGENT",engineId:"mcp-coder"});expect(program.authority).toBe(false);
  });

  it("prefers a qualified model over an unverified external agent",()=>{
    const registry=new CognitiveCellRegistry();registry.register(cell({privacyBoundary:"REDACTED_REMOTE_ALLOWED"}));registry.register(cell({id:"mcp-coder",type:"AGENT",provider:"mcp",local:false,privacyBoundary:"REDACTED_REMOTE_ALLOWED"}));
    const {program}=buildCortexProgram(registry,{objective:"repair code",self:{now:"2026-08-22T14:30:10.000Z",privacy:"REDACTED_REMOTE_ALLOWED"},uncertainty:.3});
    expect(program.strategy).toBe("EVIDENCE_AWARE_REASONING");expect(program.steps[0]).toMatchObject({kind:"MODEL",engineId:"local-reasoner"});
  });

  it("stops when no admissible cognitive cell exists",()=>{
    const registry=new CognitiveCellRegistry();registry.register(cell({id:"remote-only",provider:"remote",local:false,privacyBoundary:"REDACTED_REMOTE_ALLOWED"}));
    const {program}=buildCortexProgram(registry,{objective:"private task",self:{now:"2026-08-22T14:30:10.000Z",privacy:"LOCAL_ONLY"},uncertainty:.2});
    expect(program.strategy).toBe("STOP_NO_ADMISSIBLE_ENGINE");expect(program.steps[0].kind).toBe("STOP");
  });
});
