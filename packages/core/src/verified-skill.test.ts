import {describe,expect,it} from "vitest";
import type {AuthorizedOutcomeTrajectory,CognitiveProgram} from "@cieav/contracts";
import {activateVerifiedSkill,compileVerifiedSkillCandidate,createQualifiedVerifiedSkill,qualifyVerifiedSkill,revokeVerifiedSkill} from "./verified-skill.js";

const at="2026-08-22T19:00:00.000Z";
const program:CognitiveProgram={version:"CIEAV_COGNITIVE_PROGRAM_V1",strategy:"verified deployment reasoning",steps:[{stepId:"retrieve",kind:"RETRIEVE",engineId:"deployment-history",purpose:"Load verified prior deployment state."},{stepId:"prove",kind:"PROVE",engineId:"deployment-proof",purpose:"Require independent deployment proof."}],authority:false};
const trajectory=(id:string,overrides:Partial<AuthorizedOutcomeTrajectory>={}):AuthorizedOutcomeTrajectory=>({
  version:"CIEAV_AUTHORIZED_OUTCOME_TRAJECTORY_V2",trajectoryId:id,objective:"deploy governed release",principalIdentityRef:"principal:user",agentIdentityRef:"attestation:test",worldBeforeDigest:"b".repeat(64),operation:"deploy.release",exactArgumentsDigest:"d".repeat(64),executionEvents:["EXECUTE:PASS"],evidence:[{kind:"API_READBACK",source:"trusted-provider",observedAt:at,summary:"release verified",digest:"e".repeat(64)}],outcome:"SUCCESS",recovery:[],cryptographicallyVerified:true,authorityGrade:true,realityBound:true,eligibleAgenticRl:true,redactionProfile:"training-v1",authority:false,productionAuthority:false,...overrides
});
const good=[trajectory("trajectory-skill-0001"),trajectory("trajectory-skill-0002"),trajectory("trajectory-skill-0003")];

function candidate(trajectories=good){return compileVerifiedSkillCandidate({id:"candidate-deploy-release-v1",name:"Verified release reasoning",capability:"deployment.reasoning",program,trajectories,createdAt:at})}

describe("Verified Skills",()=>{
  it("qualifies only after the minimum repeated authority-grade successful evidence",()=>{
    const c=candidate(),q=qualifyVerifiedSkill(c,good,{},at);
    expect(q.passed).toBe(true);expect(q.metrics).toMatchObject({samples:3,successes:3,failures:0,unknown:0,successRate:1,authorityGradeCoverage:1,realityBoundCoverage:1,cryptographicCoverage:1,proofCoverage:1});
    expect(q.authority).toBe(false);expect(q.productionAuthority).toBe(false);expect(q.mayMintExecutionAuthority).toBe(false);
    const skill=createQualifiedVerifiedSkill(c,q,at);expect(skill.state).toBe("QUALIFIED");expect(skill.id.length).toBeLessThan(200);
  });

  it("blocks qualification when UNKNOWN, failure, missing crypto, missing authority grade, or missing proof is present",()=>{
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
    const c=compileVerifiedSkillCandidate({id:"candidate-schema-release-v1",name:"Parameterized release reasoning",capability:"deployment.reasoning",program,trajectories:variable,createdAt:at,argumentPolicy:{mode:"SCHEMA_DIGEST",argumentSchemaDigest:"a".repeat(64)}});
    const q=qualifyVerifiedSkill(c,variable,{},at);expect(q.passed).toBe(false);expect(q.reasons).toContain("schema_argument_policy_requires_external_deterministic_qualification");
  });

  it("requires the candidate evidence set and exact operation context to remain unchanged",()=>{
    const c=candidate();
    expect(qualifyVerifiedSkill(c,good.slice(0,2),{},at).reasons).toContain("candidate_evidence_set_mismatch");
    const changed=good.map((t,i)=>i===2?{...t,operation:"deploy.other"}:t);
    const q=qualifyVerifiedSkill(c,changed,{},at);expect(q.passed).toBe(false);expect(q.reasons).toContain("candidate_operation_mismatch");
  });

  it("requires explicit activation approval and keeps activation non-authoritative",()=>{
    const c=candidate(),q=qualifyVerifiedSkill(c,good,{},at),qualified=createQualifiedVerifiedSkill(c,q,at);
    expect(()=>activateVerifiedSkill(qualified,{approvalRef:"",activatedBy:"release-owner"})).toThrow("verified_skill_activation_requires_explicit_approval");
    const active=activateVerifiedSkill(qualified,{approvalRef:"review:verified-skill-approval-0001",activatedBy:"release-owner",activatedAt:at});
    expect(active).toMatchObject({state:"ACTIVE",activationApprovalRef:"review:verified-skill-approval-0001",authority:false,productionAuthority:false,mayMintExecutionAuthority:false});
    const revoked=revokeVerifiedSkill(active,{reason:"qualification evidence superseded",revokedAt:at});expect(revoked.state).toBe("REVOKED");
    expect(()=>activateVerifiedSkill(revoked,{approvalRef:"review:again-0001",activatedBy:"release-owner"})).toThrow("verified_skill_not_qualified_for_activation");
  });
});
