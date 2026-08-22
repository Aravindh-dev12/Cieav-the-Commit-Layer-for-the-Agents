import {
  CognitiveCellDescriptorSchema,
  VerifiedSkillArtifactSchema,
  VerifiedSkillArtifactV2Schema,
  VerifiedSkillInUseSchema,
  type CognitiveCellDescriptor,
  type CognitiveCellPrivacy,
  type VerifiedSkillArtifact,
  type VerifiedSkillArtifactV2,
  type VerifiedSkillInUse
} from "@cieav/contracts";
import {CognitiveCellRegistry} from "./cognitive-runtime.js";
import {verifiedSkillDigest} from "./verified-skill.js";

const privacyRank:Record<CognitiveCellPrivacy,number>={LOCAL_ONLY:0,REDACTED_REMOTE_ALLOWED:1,REMOTE_ALLOWED:2};
const privacyByRank=(rank:number):CognitiveCellPrivacy=>rank<=0?"LOCAL_ONLY":rank===1?"REDACTED_REMOTE_ALLOWED":"REMOTE_ALLOWED";

function dependencyIds(skill:VerifiedSkillArtifactV2){return[...new Set(skill.candidate.program.steps.map(step=>step.engineId).filter((id):id is string=>Boolean(id)))].sort()}
function dependencyCells(registry:CognitiveCellRegistry,skill:VerifiedSkillArtifactV2){
  const ids=dependencyIds(skill);
  const cells=ids.map(id=>{const cell=registry.get(id);if(!cell)throw new Error(`verified_skill_dependency_not_found:${id}`);if(cell.health!=="HEALTHY"&&cell.health!=="DEGRADED")throw new Error(`verified_skill_dependency_unavailable:${id}`);if(cell.authority!==false||cell.mayMintExecutionAuthority!==false)throw new Error(`verified_skill_dependency_claimed_authority:${id}`);return cell});
  return{ids,cells};
}
function compositePrivacy(cells:CognitiveCellDescriptor[]):CognitiveCellPrivacy{
  if(!cells.length)return"LOCAL_ONLY";
  if(cells.every(cell=>cell.local))return"LOCAL_ONLY";
  return privacyByRank(Math.min(...cells.filter(cell=>!cell.local).map(cell=>privacyRank[cell.privacyBoundary])));
}

/**
 * V1 artifacts are intentionally not admitted to production runtime projection:
 * source-trajectory success alone does not establish that using the synthesized
 * skill is beneficial on held-out cases.
 */
export function rejectLegacyVerifiedSkillForRuntime(raw:VerifiedSkillArtifact):never{
  VerifiedSkillArtifactSchema.parse(raw);
  throw new Error("verified_skill_v1_runtime_projection_forbidden_requalify_v2");
}

export function verifiedSkillV2ToCognitiveCell(registry:CognitiveCellRegistry,raw:VerifiedSkillArtifactV2,now=new Date().toISOString()):CognitiveCellDescriptor{
  const skill=VerifiedSkillArtifactV2Schema.parse(raw);
  if(skill.state!=="ACTIVE")throw new Error("verified_skill_v2_must_be_active_for_runtime_projection");
  if(!skill.activationApprovalRef)throw new Error("verified_skill_v2_activation_approval_missing");
  const {cells}=dependencyCells(registry,skill),local=cells.every(cell=>cell.local),privacyBoundary=compositePrivacy(cells),degraded=cells.some(cell=>cell.health==="DEGRADED");
  return CognitiveCellDescriptorSchema.parse({
    version:"CIEAV_COGNITIVE_CELL_V1",
    id:`verified-skill:${skill.id}`,
    type:"SKILL",
    provider:"cieav-verified-skill-v2",
    identityRef:`verified-skill-artifact:${verifiedSkillDigest(skill)}`,
    capabilities:[skill.candidate.capability],
    inputModalities:["objective","workspace-context"],
    outputModalities:["cognitive-program"],
    local,
    privacyBoundary,
    health:degraded?"DEGRADED":"HEALTHY",
    lastHeartbeatAt:now,
    competence:{[skill.candidate.capability]:skill.qualification.metrics.skillSuccessRate},
    proofCapabilities:[],
    authority:false,
    mayMintExecutionAuthority:false
  });
}

export function buildVerifiedSkillInUse(registry:CognitiveCellRegistry,raw:VerifiedSkillArtifactV2,input:{objective:string;privacy:CognitiveCellPrivacy;generatedAt?:string}):VerifiedSkillInUse{
  const skill=VerifiedSkillArtifactV2Schema.parse(raw);
  if(skill.state!=="ACTIVE"||!skill.activationApprovalRef)throw new Error("verified_skill_v2_not_active");
  const {ids,cells}=dependencyCells(registry,skill),privacy=compositePrivacy(cells),local=cells.every(cell=>cell.local);
  if(input.privacy==="LOCAL_ONLY"&&!local)throw new Error("verified_skill_remote_dependency_forbidden_for_local_only");
  if(input.privacy==="REDACTED_REMOTE_ALLOWED"&&privacy==="REMOTE_ALLOWED")throw new Error("verified_skill_dependency_privacy_too_broad");
  const dependencySnapshot=cells.map(cell=>({id:cell.id,identityRef:cell.identityRef??null,health:cell.health,lastHeartbeatAt:cell.lastHeartbeatAt,local:cell.local,privacyBoundary:cell.privacyBoundary,capabilities:[...cell.capabilities].sort()}));
  return VerifiedSkillInUseSchema.parse({
    version:"CIEAV_VERIFIED_SKILL_IN_USE_V1",
    skillId:skill.id,
    skillArtifactDigest:verifiedSkillDigest(skill),
    candidateDigest:verifiedSkillDigest(skill.candidate),
    objectiveDigest:verifiedSkillDigest({objective:input.objective}),
    dependencyCellIds:ids,
    dependencySnapshotDigest:verifiedSkillDigest(dependencySnapshot),
    local,
    privacy,
    generatedAt:input.generatedAt??new Date().toISOString(),
    activationApprovalRef:skill.activationApprovalRef,
    authority:false,
    productionAuthority:false,
    mayMintExecutionAuthority:false
  });
}

export const VERIFIED_SKILL_RUNTIME_AUTHORITY=false as const;
export const VERIFIED_SKILL_RUNTIME_MAY_MINT_EXECUTION_AUTHORITY=false as const;
