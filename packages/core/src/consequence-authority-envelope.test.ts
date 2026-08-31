import crypto from "node:crypto";
import {describe,expect,it} from "vitest";
import {mintConsequenceAuthorityEnvelope,verifyConsequenceAuthorityEnvelope,assertConsequenceAuthorityRoute} from "./consequence-authority-envelope.js";

const h=(c:string)=>c.repeat(64);
const issuedAt=new Date();

function route(){return{
  routeId:"route:git-main",
  toolId:"git-ref",
  protocol:"GIT",
  operation:"UPDATE_REF",
  target:"repo://acme/service#refs/heads/main",
  normalizedArgumentsDigest:h("a"),
  trustedToolBindingDigest:h("b"),
  canonicalRealityResolutionDigest:h("c"),
  routeDigest:h("d"),
  authority:false as const,
  mayMintExecutionAuthority:false as const
}}

function envelope(){return mintConsequenceAuthorityEnvelope({
  consequenceRef:crypto.randomUUID(),
  semanticIdentityDigest:h("1"),
  bundleDigest:h("2"),
  canonicalRealityRefs:["git://github.com/acme/service#refs/heads/main"],
  permittedEffectClasses:["UPDATE"],
  permittedBudgetDeltas:{"deploy:production":1},
  invariantWitnesses:[{result:"PRESERVES",basisDigest:h("3")}],
  reservation:{id:"reservation-1",digest:h("4")},
  proofPlan:{id:"proof-1",quorumDigest:h("5")},
  quarantineClosureDigests:[],
  authorityPolicy:{permissionGraphDigest:h("6"),algebraPolicyDigest:h("7")},
  trustedToolBindingDigest:h("b"),
  canonicalRealityResolutionDigest:h("c"),
  permittedRoutes:[route()],
  ttlSeconds:30,
  at:issuedAt
})}

describe("Consequence Authority Envelope",()=>{
  it("mints one-use local authority bound to one admitted consequence and route",()=>{
    const value=envelope();
    expect(value.authority).toBe(true);
    expect(value.authorityClass).toBe("CONSEQUENCE_BOUND_EXECUTION");
    expect(value.oneUse).toBe(true);
    expect(value.mayMintExecutionAuthority).toBe(false);
    expect(verifyConsequenceAuthorityEnvelope(value,new Date(issuedAt.getTime()+10_000)).envelopeDigest).toBe(value.envelopeDigest);
    expect(assertConsequenceAuthorityRoute(value,route()).routeId).toBe("route:git-main");
  });

  it("fails closed on route substitution",()=>{
    const value=envelope();
    expect(()=>assertConsequenceAuthorityRoute(value,{...route(),routeDigest:h("e")})).toThrow("consequence_authority_route_binding_mismatch");
  });

  it("fails closed after envelope expiry",()=>{
    const value=envelope();
    expect(()=>verifyConsequenceAuthorityEnvelope(value,new Date(issuedAt.getTime()+31_000))).toThrow("consequence_authority_envelope_expired");
  });
});
