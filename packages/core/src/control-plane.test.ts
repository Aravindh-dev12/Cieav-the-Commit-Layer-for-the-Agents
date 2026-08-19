import {describe,expect,it} from "vitest";
import {evaluateInterpositionPosture,issueOperationMandate,verifyOperationMandate} from "./control-plane.js";

const managed={id:"gmail-send",toolId:"cieav.gmail.send",protocol:"MCP" as const,consequenceCapable:true,managedByCieav:true,directAccessDeclared:false,credentialExposure:"CIEAV_ONLY" as const,enabled:true,evidenceRefs:["registry:managed"]};

describe("CIEAV interposition posture",()=>{
  it("marks a fully mediated consequence route mandatory-ready",()=>{
    const posture=evaluateInterpositionPosture("MANDATORY",[managed]);
    expect(posture.ready).toBe(true);
    expect(posture.reasons).toEqual([]);
  });
  it("fails mandatory readiness when a direct bypass route exists",()=>{
    const posture=evaluateInterpositionPosture("MANDATORY",[{...managed,directAccessDeclared:true}]);
    expect(posture.ready).toBe(false);
    expect(posture.reasons.join(" ")).toContain("direct bypass");
  });
  it("fails mandatory readiness when credentials are agent-visible",()=>{
    const posture=evaluateInterpositionPosture("MANDATORY",[{...managed,credentialExposure:"AGENT_VISIBLE" as const}]);
    expect(posture.ready).toBe(false);
    expect(posture.reasons.join(" ")).toContain("exposes credentials");
  });
});

describe("CIEAV Operation Mandate",()=>{
  it("is single-use scoped and cryptographically verifiable",()=>{
    const secret="m".repeat(64),now=Date.now();
    const mandate=issueOperationMandate(secret,{rootIntentId:"11111111-1111-4111-8111-111111111111",taskId:"22222222-2222-4222-8222-222222222222",proposalId:"33333333-3333-4333-8333-333333333333",subjectId:"agent-1",identityAttestationId:"44444444-4444-4444-8444-444444444444",permissionGraphDigest:"a".repeat(64),authorizationDecisionDigest:"b".repeat(64),realityBoundCommitId:"55555555-5555-4555-8555-555555555555",effectKey:"c".repeat(64),routeDigest:"d".repeat(64),normalizedArgumentsDigest:"e".repeat(64),expectedPostStateDigest:"f".repeat(64),proofObligationDigest:"0".repeat(64),interpositionPostureDigest:"1".repeat(64),issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+30_000).toISOString()});
    expect(mandate.maxUses).toBe(1);
    expect(mandate.status).toBe("ISSUED");
    expect(verifyOperationMandate(secret,mandate)).toBe(true);
    expect(verifyOperationMandate("x".repeat(64),mandate)).toBe(false);
  });
});
