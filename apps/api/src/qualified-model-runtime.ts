import {CognitiveCellDescriptorSchema,type CognitiveCellDescriptor} from "@cieav/contracts";
import type {CieavModelCandidate} from "./model-qualification-store.js";

const ROLE_CAPABILITIES={
  ROUTER:["cognitive-routing","model-selection","budget-aware-routing"],
  CORE_REASONER:["reasoning","planning","consequence-reasoning"],
  CONSEQUENCE_MODEL:["consequence-prediction","outcome-estimation","reversibility-analysis"],
  PROOF_PLANNER:["proof-planning","evidence-planning","settlement-planning"],
  AUTHORITY_ADVISOR:["authority-advice","least-authority-analysis","permission-analysis"],
  RECOVERY_MODEL:["recovery-planning","reconciliation-planning","unknown-outcome-recovery"],
  CRITIC_REWARD:["critique","reward-estimation","trajectory-assessment"],
  SKILL_COMPILER:["skill-compilation","trajectory-patterning","candidate-skill-generation"]
} as const;

export function qualifiedModelCellId(candidateId:string){return`qualified-model:${candidateId}`}

export function qualifiedModelToCognitiveCell(candidate:CieavModelCandidate,now:string):CognitiveCellDescriptor{
  if(candidate.state!=="ACTIVE")throw new Error(`qualified_model_not_active:${candidate.candidateId}`);
  if(candidate.authority!==false||candidate.productionAuthority!==false||candidate.promotionExecuted!==false||candidate.mayMintExecutionAuthority!==false||candidate.mayPromoteSelf!==false)throw new Error("qualified_model_authority_invariant_violation");
  if(!candidate.qualificationSuiteDigest||candidate.qualificationMeanReward===undefined||!candidate.activationApprovalRef||!candidate.activatedAt)throw new Error("qualified_model_activation_evidence_missing");
  const roleTag=`role:${candidate.role}`,competence:Record<string,number>={[roleTag]:1,"qualified-model":1,"agentic-rl-qualified":Math.max(0,Math.min(1,(candidate.qualificationMeanReward+1)/2))};
  return CognitiveCellDescriptorSchema.parse({
    version:"CIEAV_COGNITIVE_CELL_V1",id:qualifiedModelCellId(candidate.candidateId),type:"MODEL",provider:"cieav.qualified-model-registry",identityRef:`checkpoint-sha256:${candidate.checkpointDigest}`,
    capabilities:[...ROLE_CAPABILITIES[candidate.role]],inputModalities:["text","structured"],outputModalities:["text","structured"],local:candidate.checkpointUri.startsWith("file:"),privacyBoundary:candidate.checkpointUri.startsWith("file:")?"LOCAL_ONLY":"REDACTED_REMOTE_ALLOWED",health:"HEALTHY",lastHeartbeatAt:now,competence,proofCapabilities:[],authority:false,mayMintExecutionAuthority:false
  });
}

export async function activeQualifiedModelCells(store:{modelQualifications:{listActive():Promise<CieavModelCandidate[]>}},now:string){const active=await store.modelQualifications.listActive();return active.map(candidate=>qualifiedModelToCognitiveCell(candidate,now)).sort((a,b)=>a.id.localeCompare(b.id))}
