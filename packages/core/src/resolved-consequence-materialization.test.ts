import {describe,expect,it} from "vitest";
import type {ExecutionProposal} from "@cieav/contracts";
import {CanonicalRealityResolverRegistry,verifyCanonicalRealityResolution} from "./reality-resolver.js";
import {materializeResolvedExecutionProposal} from "./resolved-consequence-materialization.js";

const witness={version:1 as const,observedAt:"2026-08-30T00:00:00.000Z",facts:[{key:"git.ref",valueDigest:"a".repeat(64),source:"git-readback",observedAt:"2026-08-30T00:00:00.000Z"}],digest:"b".repeat(64)};
const baseProposal={
  version:1 as const,
  taskId:"11111111-1111-4111-8111-111111111111",
  intentId:"22222222-2222-4222-8222-222222222222",
  scopeDeviceId:"device-m3-test",
  subjectId:"agent-1",
  identityAttestationId:"33333333-3333-4333-8333-333333333333",
  credentialLeaseId:"44444444-4444-4444-8444-444444444444",
  operation:"update-ref",
  risk:"HIGH" as const,
  normalizedArgumentsDigest:"c".repeat(64),
  semanticEffect:{kind:"UPDATE" as const,attributes:{ref:"refs/heads/main",operation:"fast-forward"}},
  realityWitness:witness,
  expectedPostStateDigest:"d".repeat(64),
  proofObligationDigest:"e".repeat(64),
  attenuationWitnessIds:[],
  createdAt:"2026-08-30T00:00:00.000Z"
};

const resolution=(routeNativeIdentity:string,namespace:string)=>new CanonicalRealityResolverRegistry().resolve("cieav.git.ref.v1","1",{
  version:"CIEAV_CANONICAL_REALITY_RESOLUTION_REQUEST_V1",
  routeNativeIdentity,
  namespace,
  authorityDomain:"device:device-m3-test",
  resourceKind:"GIT_REF",
  aliases:[],
  parentRefs:[],
  identityEvidenceRefs:["proof:git-ref"],
  context:{},
  authority:false
});

describe("resolved execution consequence materialization",()=>{
  it("gives heterogeneous Git routes one semantic consequence identity and one footprint",()=>{
    const http:ExecutionProposal={...baseProposal,id:"55555555-5555-4555-8555-555555555555",toolId:"github.http",protocol:"HTTP",target:"https://github.com/Acme/Platform.git#refs/heads/main"};
    const cli:ExecutionProposal={...baseProposal,id:"66666666-6666-4666-8666-666666666666",toolId:"git.cli",protocol:"CLI",target:"git@github.com:Acme/Platform.git#main"};
    const httpResolution=resolution(http.target!,"http"),cliResolution=resolution(cli.target!,"cli");
    expect(verifyCanonicalRealityResolution(httpResolution)).toBe(true);
    expect(verifyCanonicalRealityResolution(cliResolution)).toBe(true);
    const httpMaterialization=materializeResolvedExecutionProposal(http,httpResolution),cliMaterialization=materializeResolvedExecutionProposal(cli,cliResolution);
    const canonicalRef=httpResolution.canonicalRealityRef;
    expect(httpMaterialization.realityAddress.stableId).toBe("git://github.com/Acme/Platform#refs/heads/main");
    expect(cliMaterialization.realityAddress.stableId).toBe(httpMaterialization.realityAddress.stableId);
    expect(cliMaterialization.semanticIdentity.targetRealityRefs).toEqual([canonicalRef]);
    expect(httpMaterialization.semanticIdentity.targetRealityRefs).toEqual([canonicalRef]);
    expect(cliMaterialization.semanticIdentity.transitionShape).toBe(httpMaterialization.semanticIdentity.transitionShape);
    expect(cliMaterialization.semanticIdentity.digest).toBe(httpMaterialization.semanticIdentity.digest);
    expect(cliMaterialization.footprint.realityRead).toEqual([canonicalRef]);
    expect(cliMaterialization.footprint.realityWrite).toEqual([canonicalRef]);
    expect(httpMaterialization.footprint.realityRead).toEqual([canonicalRef]);
    expect(httpMaterialization.footprint.realityWrite).toEqual([canonicalRef]);
    expect(cliMaterialization.footprint.invariantsTouched).toContain(`resource:${canonicalRef}`);
    expect(httpMaterialization.footprint.invariantsTouched).toContain(`resource:${canonicalRef}`);
    expect(cliMaterialization.authority).toBe(false);
  });

  it.each([
    ["READ","realityRead"],
    ["UPDATE","realityWrite"],
    ["DELETE","delete"],
    ["CREATE","create"],
    ["GRANT_ACCESS","grant"],
    ["REVOKE_ACCESS","revoke"]
  ] as const)("propagates the canonical ref through %s footprints",(kind,field)=>{
    const proposal:ExecutionProposal={...baseProposal,id:crypto.randomUUID(),toolId:"github.http",protocol:"HTTP",target:"https://github.com/Acme/Platform.git#refs/heads/main",semanticEffect:{kind,attributes:{ref:"refs/heads/main"}}};
    const r=resolution(proposal.target!,"http"),materialization=materializeResolvedExecutionProposal(proposal,r);
    expect(materialization.semanticIdentity.targetRealityRefs).toEqual([r.canonicalRealityRef]);
    expect(materialization.footprint.realityRead).toContain(r.canonicalRealityRef);
    expect(materialization.footprint[field]).toContain(r.canonicalRealityRef);
    expect(materialization.footprint.invariantsTouched).toContain(`resource:${r.canonicalRealityRef}`);
  });
});
