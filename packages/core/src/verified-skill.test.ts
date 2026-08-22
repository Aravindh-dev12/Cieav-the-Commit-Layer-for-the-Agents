import {describe,expect,it} from "vitest";
import type {AuthorizedOutcomeTrajectory,CognitiveProgram,VerifiedSkillValidationCase} from "@cieav/contracts";
import {activateVerifiedSkill,activateVerifiedSkillV2,compileVerifiedSkillCandidate,createQualifiedVerifiedSkill,createQualifiedVerifiedSkillV2,qualifyVerifiedSkill,qualifyVerifiedSkillV2,revokeVerifiedSkill,verifiedSkillDigest,verifiedSkillValidationCaseDigest} from "./verified-skill.js";

const at="2026-08-22T19:00:00.000Z";
const program:CognitiveProgram={version:"CIEAV_COGNITIVE_PROGRAM_V1",strategy:"verified deployment reasoning",steps:[{stepId:"retrieve",kind:"RETRIEVE",engineId:"deployment-history",purpose:"Load verified prior deployment state."},{stepId:"prove",kind:"PROVE",engineId:"deployment-proof",purpose:"Require independent deployment proof."}],authority:false};
const trajectory=(id:string,overrides:Partial<AuthorizedOutcomeTrajectory>={}):AuthorizedOutcomeTrajectory=>({
  version:"CIEAV_AUTHORIZED_OUTCOME_TRAJECTORY_V2",trajectoryId:id,objective:"deploy governed release",principalIdentityRef:"principal:user",agentIdentityRef:"attestation:test",worldBeforeDigest:"b".repeat(64),operation:"deploy.release",exactArgumentsDigest:"d".repeat(64),executionEvents:["EXECUTE:PASS"],evidence:[{kind:"API_READBACK",source:"trusted-provider",observedAt:at,summary:"release verified",digest:"e".repeat(64)}],outcome:"SUCCESS",recovery:[],cryptographicallyVerified:true,authorityGrade:true,realityBound:true,eligibleAgenticRl:true,redactionProfile:"training-v1",authority:false,productionAuthority:false,...overrides
});
const good=[trajectory("trajectory-skill-0001"),trajectory("trajectory-skill-0002"),trajectory("trajectory-skill-0003")];

function candidate(trajectories=good){return compileVerifiedSkillCandidate({id:"candidate-deploy-release-v1",name:"Verified release reasoning",capability:"deployment.reasoning",routing:{description:"Use for governed software release planning and verification.",keywords:["deploy","release","rollout"]},program,trajectories,createdAt:at})}
function validation(candidateDigest:string,id:string,overrides:Partial<VerifiedSkillValidationCase>={}):VerifiedSkillValidationCase{const draft:VerifiedSkillValidationCase={version:"CIEAV_VERIFIED_SKILL_VALIDATION_CASE_V1",caseId:id,caseDigest:"0".repeat(64),environmentDigest:"1".repeat(64),candidateDigest,baselineConfigurationDigest:"2".repeat(64),baselineOutcome:"FAILURE",skillOutcome:"SUCCESS",baselineSteps:8,skillSteps:5,baselineTokens:5000,skillTokens:3200,verifierRef:"deterministic:test-verifier-v1",verifierDigest:"3".repeat(64),provenance:"CIEAV_DETERMINISTIC_HARNESS",heldOut:true,derivedFromTrajectoryIds:[],authority:false,productionAuthority:false,mayMintExecutionAuthority:false,...overrides};return{...draft,caseDigest:verifiedSkillValidationCaseDigest(draft)}}

describe("Verified Skills",()=>{
  it("qualifies V1 source evidence only after the minimum repeated authority-grade successful evidence",()=>{
    const c=candidate(),q=qualifyVerifiedSkill(c,good,{},at);
    expect(q.passed).toBe(true);expect(q.metrics).toMatchObject({samples:3,successes:3,failures:0,unknown:0,successRate:1,authorityGradeCoverage:1,realityBoundCoverage:1,cryptographicCoverage:1,proofCoverage:1});
    expect(q.authority).toBe(false);expect(q.productionAuthority).toBe(false);expect(q.mayMintExecutionAuthority).toBe(false);
    const skill=createQualifiedVerifiedSkill(c,q,at);expect(skill.state).toBe("QUALIFIED");expect(skill.id.length).toBeLessThan(200);
  });

  it("blocks V1 source qualification when UNKNOWN, failure, missing crypto, missing authority grade, or missing proof is present",()=>{
    for(const bad of [
      trajectory("trajectory-skill-bad-unknown",{outcome:"UNKNOWN",eligibleAgenticRl:false}),
      trajectory("trajectory-skill-bad-failure",{outcome:"FAILURE",eligibleAgenticRl:false}),
      trajectory("trajectory-skill-bad-crypto",{cryptographicallyVerified:false,eligibleAgenticRl:false}),
      trajectory("trajectory-skill-bad-authority",{authorityGrade:false,eligibleAgenticRl:false}),
      trajectory("trajectory-skill-bad-proof",{evidence:[],eligibleAgenticRl:false})
    ]){
      const evidence=[good[0]!,good[1]!,bad],c=candidate(evidence),q=qualifyVerifiedSkill(c,evidence,{},at);expect(q.passed).toBe(false);expect(()=>createQualifiedVerifiedSkill(c,q,at)).toThrow("verified_skill_qualification_did_not_pass");
    }
  });

  it("does not automatically generalize variable arguments into a broad skill",()=>{
    const variable=[good[0]!,good[1]!,trajectory("trajectory-skill-variable",{exactArgumentsDigest:"f".repeat(64)})];
    expect(()=>candidate(variable)).toThrow("verified_skill_candidate_requires_explicit_argument_schema_for_variable_arguments");
    const c=compileVerifiedSkillCandidate({id:"candidate-schema-release-v1",name:"Parameterized release reasoning",capability:"deployment.reasoning",routing:{description:"Parameterized governed release reasoning.",keywords:["deploy"]},program,trajectories:variable,createdAt:at,argumentPolicy:{mode:"SCHEMA_DIGEST",argumentSchemaDigest:"a".repeat(64)}});
    const q=qualifyVerifiedSkill(c,variable,{},at);expect(q.passed).toBe(false);expect(q.reasons).toContain("schema_argument_policy_requires_external_deterministic_qualification");
  });

  it("requires the candidate evidence set and exact operation context to remain unchanged",()=>{
    const c=candidate();
    expect(qualifyVerifiedSkill(c,good.slice(0,2),{},at).reasons).toContain("candidate_evidence_set_mismatch");
    const changed=good.map((t,i)=>i===2?{...t,operation:"deploy.other"}:t);
    const q=qualifyVerifiedSkill(c,changed,{},at);expect(q.passed).toBe(false);expect(q.reasons).toContain("candidate_operation_mismatch");
  });

  it("requires held-out intervention validation before V2 qualification",()=>{
    const c=candidate(),source=qualifyVerifiedSkill(c,good,{},at),digest=verifiedSkillDigest(c),cases=[validation(digest,"validation-case-0001"),validation(digest,"validation-case-0002",{baselineOutcome:"UNKNOWN"}),validation(digest,"validation-case-0003",{baselineOutcome:"SUCCESS",skillOutcome:"SUCCESS"})];
    const q=qualifyVerifiedSkillV2(c,source,cases,{},at);
    expect(q.passed).toBe(true);expect(q.metrics).toMatchObject({validationCases:3,skillSuccesses:3,skillFailures:0,skillUnknown:0,repairs:2,regressions:0,skillSuccessRate:1});
    const skill=createQualifiedVerifiedSkillV2(c,q,at);expect(skill).toMatchObject({version:"CIEAV_VERIFIED_SKILL_V2",state:"QUALIFIED",authority:false,productionAuthority:false,mayMintExecutionAuthority:false});
  });

  it("fails V2 qualification on even one baseline-success regression",()=>{
    const c=candidate(),source=qualifyVerifiedSkill(c,good,{},at),digest=verifiedSkillDigest(c),cases=[validation(digest,"validation-regression-0001"),validation(digest,"validation-regression-0002"),validation(digest,"validation-regression-0003",{baselineOutcome:"SUCCESS",skillOutcome:"UNKNOWN"})];
    const q=qualifyVerifiedSkillV2(c,source,cases,{},at);expect(q.passed).toBe(false);expect(q.metrics.regressions).toBe(1);expect(q.reasons.some(reason=>reason.startsWith("regressions "))).toBe(true);expect(()=>createQualifiedVerifiedSkillV2(c,q,at)).toThrow("verified_skill_v2_qualification_did_not_pass");
  });

  it("fails V2 qualification when validation is contaminated by source trajectories or candidate content changes",()=>{
    const c=candidate(),source=qualifyVerifiedSkill(c,good,{},at),digest=verifiedSkillDigest(c);
    const contaminated=[validation(digest,"validation-heldout-0001",{derivedFromTrajectoryIds:[good[0]!.trajectoryId]}),validation(digest,"validation-heldout-0002"),validation(digest,"validation-heldout-0003")];
    expect(qualifyVerifiedSkillV2(c,source,contaminated,{},at).reasons).toContain("validation_case_not_held_out:validation-heldout-0001");
    const mismatch=[validation("f".repeat(64),"validation-mismatch-0001"),validation(digest,"validation-mismatch-0002"),validation(digest,"validation-mismatch-0003")];
    expect(qualifyVerifiedSkillV2(c,source,mismatch,{},at).reasons).toContain("validation_candidate_digest_mismatch:validation-mismatch-0001");
  });

  it("detects validation-result tampering and duplicate-case padding",()=>{
    const c=candidate(),source=qualifyVerifiedSkill(c,good,{},at),digest=verifiedSkillDigest(c),first=validation(digest,"validation-integrity-0001"),tampered={...first,skillOutcome:"FAILURE" as const},second=validation(digest,"validation-integrity-0002"),duplicate={...second,caseId:"validation-integrity-0003"};
    const tamperedResult=qualifyVerifiedSkillV2(c,source,[tampered,validation(digest,"validation-integrity-0004"),validation(digest,"validation-integrity-0005")],{},at);expect(tamperedResult.reasons).toContain("validation_case_digest_mismatch:validation-integrity-0001");
    const padded=qualifyVerifiedSkillV2(c,source,[first,second,duplicate],{},at);expect(padded.reasons).toContain("duplicate_validation_case_digest");
  });

  it("requires explicit V2 activation approval and keeps activation non-authoritative",()=>{
    const c=candidate(),source=qualifyVerifiedSkill(c,good,{},at),digest=verifiedSkillDigest(c),q=qualifyVerifiedSkillV2(c,source,[validation(digest,"validation-activate-0001"),validation(digest,"validation-activate-0002"),validation(digest,"validation-activate-0003")],{},at),qualified=createQualifiedVerifiedSkillV2(c,q,at);
    expect(()=>activateVerifiedSkillV2(qualified,{approvalRef:"",activatedBy:"release-owner"})).toThrow("verified_skill_v2_activation_requires_explicit_approval");
    const active=activateVerifiedSkillV2(qualified,{approvalRef:"approval:verified-skill-v2-0001",activatedBy:"release-owner",activatedAt:at});
    expect(active).toMatchObject({state:"ACTIVE",activationApprovalRef:"approval:verified-skill-v2-0001",authority:false,productionAuthority:false,mayMintExecutionAuthority:false});
  });

  it("retains legacy V1 activation only for compatibility and supports revocation",()=>{
    const c=candidate(),q=qualifyVerifiedSkill(c,good,{},at),qualified=createQualifiedVerifiedSkill(c,q,at);
    expect(()=>activateVerifiedSkill(qualified,{approvalRef:"",activatedBy:"release-owner"})).toThrow("verified_skill_activation_requires_explicit_approval");
    const active=activateVerifiedSkill(qualified,{approvalRef:"review:verified-skill-approval-0001",activatedBy:"release-owner",activatedAt:at});
    const revoked=revokeVerifiedSkill(active,{reason:"qualification evidence superseded",revokedAt:at});expect(revoked.state).toBe("REVOKED");
    expect(()=>activateVerifiedSkill(revoked,{approvalRef:"review:again-0001",activatedBy:"release-owner"})).toThrow("verified_skill_not_qualified_for_activation");
  });
});
