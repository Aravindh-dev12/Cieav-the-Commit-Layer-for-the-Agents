import {
  AgentRuntimeProposalSchema,
  ContinuityWitnessSchema,
  ModelExecutionProvenanceSchema,
  ToolCapabilityEpochSchema,
  type AgentRuntimeProposal,
  type ContinuityDimension,
  type ContinuityState,
  type ContinuityWitness,
  type ModelExecutionProvenance,
  type ToolCapabilityEpoch
} from "@cieav/contracts/continuity";
import {digest} from "./execution-fabric.js";

export function modelExecutionProvenance(input:Omit<ModelExecutionProvenance,"version"|"provenanceDigest"|"authority"|"mayMintExecutionAuthority">):ModelExecutionProvenance{
  const base={version:"CIEAV_MODEL_EXECUTION_PROVENANCE_V1" as const,...input,authority:false as const,mayMintExecutionAuthority:false as const};
  return ModelExecutionProvenanceSchema.parse({...base,provenanceDigest:digest(base)});
}

export function toolCapabilityEpoch(input:Omit<ToolCapabilityEpoch,"version"|"epochDigest"|"authority">):ToolCapabilityEpoch{
  const base={version:"CIEAV_TOOL_CAPABILITY_EPOCH_V1" as const,...input,authority:false as const};
  return ToolCapabilityEpochSchema.parse({...base,epochDigest:digest(base)});
}

export function continuityWitness(input:{
  dimension:ContinuityDimension;
  previousRef:string;
  currentRef:string;
  state:ContinuityState;
  basis:unknown;
  evidenceRefs?:string[];
  affectedConsequenceRefs?:string[];
  createdAt?:string;
}):ContinuityWitness{
  const base={
    version:"CIEAV_CONTINUITY_WITNESS_V1" as const,
    dimension:input.dimension,
    previousRef:input.previousRef,
    currentRef:input.currentRef,
    state:input.state,
    basisDigest:digest(input.basis),
    evidenceRefs:input.evidenceRefs??[],
    affectedConsequenceRefs:input.affectedConsequenceRefs??[],
    createdAt:input.createdAt??new Date().toISOString(),
    authority:false as const,
    mayMintExecutionAuthority:false as const
  };
  return ContinuityWitnessSchema.parse({...base,witnessDigest:digest(base)});
}

export function evaluateModelContinuity(previous:ModelExecutionProvenance,current:ModelExecutionProvenance,options:{previousSemanticIdentityDigest?:string;currentSemanticIdentityDigest?:string;affectedConsequenceRefs?:string[]}={}):ContinuityWitness{
  const semanticKnown=Boolean(options.previousSemanticIdentityDigest&&options.currentSemanticIdentityDigest);
  const sameSemantic=semanticKnown&&options.previousSemanticIdentityDigest===options.currentSemanticIdentityDigest;
  const modelChanged=previous.servingModel!==current.servingModel||previous.servingModelSnapshot!==current.servingModelSnapshot;
  const toolSetChanged=previous.toolSetDigest!==current.toolSetDigest;
  const contextChanged=previous.contextDigest!==current.contextDigest;
  let state:ContinuityState="PRESERVED";
  if(toolSetChanged)state="REQUIRES_REAUTHORIZATION";
  else if(modelChanged||contextChanged){
    if(!semanticKnown)state="REQUIRES_REINTERPRETATION";
    else if(!sameSemantic)state="BROKEN";
    else state="REQUIRES_REAUTHORIZATION";
  }
  return continuityWitness({
    dimension:"INTELLIGENCE",
    previousRef:previous.provenanceDigest,
    currentRef:current.provenanceDigest,
    state,
    basis:{previous:previous.provenanceDigest,current:current.provenanceDigest,modelChanged,toolSetChanged,contextChanged,previousSemanticIdentityDigest:options.previousSemanticIdentityDigest??null,currentSemanticIdentityDigest:options.currentSemanticIdentityDigest??null},
    affectedConsequenceRefs:options.affectedConsequenceRefs
  });
}

export function evaluateToolEpochContinuity(previous:ToolCapabilityEpoch,current:ToolCapabilityEpoch,options:{affectedConsequenceRefs?:string[]}={}):ContinuityWitness{
  if(current.epoch<=previous.epoch)throw new Error("tool_capability_epoch_must_advance");
  let state:ContinuityState="PRESERVED";
  if(current.authorityImpact==="INVALIDATES_EXISTING_AUTHORITY")state="BROKEN";
  else if(current.authorityImpact==="REQUIRES_REEVALUATION")state="REQUIRES_REAUTHORIZATION";
  else if(previous.currentToolSetDigest!==current.currentToolSetDigest)state="REQUIRES_REAUTHORIZATION";
  return continuityWitness({
    dimension:"TOOL",
    previousRef:previous.epochDigest,
    currentRef:current.epochDigest,
    state,
    basis:{previous:previous.epochDigest,current:current.epochDigest,authorityImpact:current.authorityImpact,addedToolRefs:current.addedToolRefs,removedToolRefs:current.removedToolRefs},
    affectedConsequenceRefs:options.affectedConsequenceRefs
  });
}

export function agentRuntimeProposal(input:Omit<AgentRuntimeProposal,"version"|"proposalDigest"|"authority"|"mayMintExecutionAuthority">):AgentRuntimeProposal{
  const base={version:"CIEAV_AGENT_RUNTIME_PROPOSAL_V1" as const,...input,authority:false as const,mayMintExecutionAuthority:false as const};
  return AgentRuntimeProposalSchema.parse({...base,proposalDigest:digest(base)});
}
