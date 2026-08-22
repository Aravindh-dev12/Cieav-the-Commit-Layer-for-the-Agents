import type {
  CognitiveCellDescriptor,
  CognitiveEngine,
  CognitiveProgram,
  EpistemicClaim,
  IntelligenceState,
} from "@cieav/contracts";
import {CognitiveCellRegistry,type SelfModelInput} from "./cognitive-runtime.js";
import {buildBaselineCognitiveProgram} from "./consequence-intelligence.js";

const engineKinds=new Set(["MODEL","SKILL","RETRIEVER","SIMULATOR","PROOF_PROVIDER","HUMAN"] as const);
type EngineKind="MODEL"|"SKILL"|"RETRIEVER"|"SIMULATOR"|"PROOF_PROVIDER"|"HUMAN";

export function cognitiveCellToEngine(cell:CognitiveCellDescriptor):CognitiveEngine|null{
  if(!engineKinds.has(cell.type as EngineKind))return null;
  if(cell.authority!==false||cell.mayMintExecutionAuthority!==false)throw new Error("cortex_rejects_authoritative_cell");
  return{
    id:cell.id,
    kind:cell.type as EngineKind,
    provider:cell.provider,
    local:cell.local,
    modalities:[...new Set([...cell.inputModalities,...cell.outputModalities])],
    competenceTags:Object.entries(cell.competence).filter(([,score])=>score>=.5).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([tag])=>tag),
    authority:false,
  };
}

export type CortexInput={
  objective:string;
  self:SelfModelInput;
  epistemicState?:EpistemicClaim[];
  currentRealityDigest?:string;
  availableTools?:string[];
  availableSkills?:string[];
  authorityEnvelopeRef?:string;
  activeHypotheses?:string[];
  uncertainty?:number;
  proofObligations?:string[];
  recoveryRequirements?:string[];
  maxLatencyMs?:number;
  maxCostUsd?:number;
  maxModelCalls?:number;
};

export function buildIntelligenceStateFromRegistry(registry:CognitiveCellRegistry,input:CortexInput):IntelligenceState{
  const self=registry.selfModel({...input.self,uncertainty:input.uncertainty??input.self.uncertainty});
  const healthy=new Set(self.healthyCellIds);
  const engines=self.cells.filter(cell=>healthy.has(cell.id)).map(cognitiveCellToEngine).filter((engine):engine is CognitiveEngine=>Boolean(engine));
  return{
    version:"CIEAV_INTELLIGENCE_STATE_V1",
    objective:input.objective,
    epistemicState:[...(input.epistemicState??[])],
    ...(input.currentRealityDigest?{currentRealityDigest:input.currentRealityDigest}:{}),
    availableEngines:engines,
    availableTools:[...(input.availableTools??[])],
    availableSkills:[...(input.availableSkills??[])],
    ...(input.authorityEnvelopeRef?{authorityEnvelopeRef:input.authorityEnvelopeRef}:{}),
    activeHypotheses:[...(input.activeHypotheses??[])],
    uncertainty:input.uncertainty??self.uncertainty,
    proofObligations:[...(input.proofObligations??[])],
    recoveryRequirements:[...(input.recoveryRequirements??[])],
    budget:{
      privacy:self.privacy,
      ...(input.maxLatencyMs!==undefined?{maxLatencyMs:input.maxLatencyMs}:{}),
      ...(input.maxCostUsd!==undefined?{maxCostUsd:input.maxCostUsd}:{}),
      ...(input.maxModelCalls!==undefined?{maxModelCalls:input.maxModelCalls}:{}),
    },
    authority:false,
    mayMintExecutionAuthority:false,
  };
}

export function buildCortexProgram(registry:CognitiveCellRegistry,input:CortexInput):{state:IntelligenceState;program:CognitiveProgram}{
  const state=buildIntelligenceStateFromRegistry(registry,input);
  const program=buildBaselineCognitiveProgram(state);
  if(program.authority!==false)throw new Error("cortex_program_claimed_authority");
  return{state,program};
}

export const CORTEX_AUTHORITY=false as const;
export const CORTEX_MAY_MINT_EXECUTION_AUTHORITY=false as const;
