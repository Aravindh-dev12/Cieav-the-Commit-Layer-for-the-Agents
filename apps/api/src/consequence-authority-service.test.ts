import crypto from "node:crypto";
import {describe,expect,it} from "vitest";
import {ConsequenceAlgebraPolicySchema,type ExecutionProposal,type FederatedTool,type FormalAuthorizationDecision,type CanonicalRealityResolution} from "@cieav/contracts";
import {trustedToolAuthorizationBinding,digest} from "@cieav/core/execution-fabric";
import {makeRealityAddress,admitConsequence} from "@cieav/core/consequence-algebra";
import {materializeResolvedExecutionProposal} from "@cieav/core/resolved-consequence-materialization";
import {compileExecutionConsequenceBundle} from "@cieav/core/consequence-bundle";
import {mintLocalConsequenceAuthority,assertLocalConsequenceAuthorityCurrent} from "./consequence-authority-service.js";

const h=(c:string)=>c.repeat(64);
const now="2026-08-30T16:00:00.000Z";

function proposal():ExecutionProposal{return{
  id:crypto.randomUUID(),version:1,taskId:crypto.randomUUID(),intentId:crypto.randomUUID(),scopeDeviceId:"device-0001",subjectId:"agent-1",
  identityAttestationId:crypto.randomUUID(),credentialLeaseId:crypto.randomUUID(),toolId:"git-ref",protocol:"GIT",operation:"UPDATE_REF",
  target:"repo://acme/service#refs/heads/main",risk:"HIGH",normalizedArgumentsDigest:h("a"),
  semanticEffect:{kind:"UPDATE",target:"repo://acme/service#refs/heads/main",objectRef:"refs/heads/main",attributes:{revision:"abc"}},
  realityWitness:{version:1,observedAt:now,facts:[{key:"head",valueDigest:h("b"),source:"git",observedAt:now}],digest:h("c")},
  expectedPostStateDigest:h("d"),proofObligationDigest:h("e"),attenuationWitnessIds:[],createdAt:now
}}

function tool():FederatedTool{return{
  id:"git-ref",displayName:"Qualified Git ref",protocol:"GIT",operation:"UPDATE_REF",downstreamRef:"git://local",
  credentialMode:"CIEAV_INJECTED",risk:"HIGH",consequenceCapable:true,proofSources:["git-readback"],enabled:true,
  consequenceContract:{version:"CIEAV_TRUSTED_TOOL_CONSEQUENCE_CONTRACT_V1",effectKinds:["UPDATE"],targetBinding:"SEMANTIC_TARGET",targetPrefixes:["repo://"],requiredAttributeKeys:["revision"],duplicateSemantics:"RECONCILE_BEFORE_RETRY",canonicalResolverId:"cieav.git.ref.v1",canonicalResolverVersion:"1",authority:false}
}}

function policy(){return ConsequenceAlgebraPolicySchema.parse({version:"CIEAV_CONSEQUENCE_ALGEBRA_POLICY_V1",enabled:true,failClosedUnknown:true,reservationTtlSeconds:60,proofabilityRisks:["CRITICAL"],proofProviderBindings:{},evidenceProviderRegistry:[],evidenceQuorumRequirements:[],defaultAggregationLimits:{},aggregationWindowSeconds:86400,aggregationScope:"ROOT_INTENT",maxActiveConsequences:10000,maxHistoryConsequences:100000,authority:false,mayMintExecutionAuthority:false})}

function setup(){
  const p=proposal(),binding=trustedToolAuthorizationBinding(tool(),p,{requireContract:true});
  const address=makeRealityAddress({version:"CIEAV_REALITY_ADDRESS_V1",namespace:"git",authorityDomain:`device:${p.scopeDeviceId}`,resourceKind:"GIT_REF",stableId:"github.com/acme/service#refs/heads/main",aliases:[p.target!],parentRefs:[],identityEvidenceRefs:["git:qualified-fixture"],resolverId:"cieav.git.ref.v1",resolverVersion:"1"});
  const resolution:CanonicalRealityResolution={version:"CIEAV_CANONICAL_REALITY_RESOLUTION_V1",requestDigest:h("1"),resolverManifestDigest:h("2"),address,canonicalRealityRef:h("3"),verificationRefs:["git:qualified-fixture"],resolutionDigest:h("4"),authority:false,mayMintExecutionAuthority:false};
  const materialization=materializeResolvedExecutionProposal(p,resolution),bundle=compileExecutionConsequenceBundle(p,binding,materialization),admission=admitConsequence(materialization,{activeNodes:[],requireProofability:false}),formalDecision:FormalAuthorizationDecision={decision:"ALLOW",graphDigest:h("5"),intentId:p.intentId,subjectId:p.subjectId,toolId:p.toolId,operation:p.operation,matchedEdgeIds:[crypto.randomUUID()],evidenceRefs:["policy:test"],reasons:["qualified test allow"],evaluatedAt:now,engine:"CIEAV_FORMAL_AUTH_V1"};
  return{p,binding,resolution,materialization,bundle,admission,formalDecision};
}

describe("local consequence authority service",()=>{
  it("mints a one-use envelope from the real consequence pipeline",()=>{
    const s=setup(),algebraPolicy=policy(),snapshot={proposal:s.p,materialization:s.materialization,consequenceBundle:s.bundle,canonicalRealityResolution:s.resolution,trustedToolBinding:s.binding,formalDecision:s.formalDecision,algebraAdmission:s.admission,algebraPolicy,quarantineClosures:[],routeDigest:digest({route:"git",proposal:s.p.id}),at:new Date(now),ttlSeconds:30};
    const envelope=mintLocalConsequenceAuthority(snapshot);
    expect(envelope.authority).toBe(true);expect(envelope.oneUse).toBe(true);expect(envelope.consequenceRef).toBe(s.p.id);expect(envelope.bundleDigest).toBe(s.bundle.bundleDigest);expect(envelope.canonicalRealityRefs).toEqual([s.resolution.canonicalRealityRef]);
    expect(assertLocalConsequenceAuthorityCurrent(envelope,snapshot,new Date("2026-08-30T16:00:10.000Z")).envelopeDigest).toBe(envelope.envelopeDigest);
  });

  it("revokes unused authority when the authority policy snapshot drifts",()=>{
    const s=setup(),algebraPolicy=policy(),snapshot={proposal:s.p,materialization:s.materialization,consequenceBundle:s.bundle,canonicalRealityResolution:s.resolution,trustedToolBinding:s.binding,formalDecision:s.formalDecision,algebraAdmission:s.admission,algebraPolicy,quarantineClosures:[],routeDigest:digest({route:"git",proposal:s.p.id}),at:new Date(now),ttlSeconds:30},envelope=mintLocalConsequenceAuthority(snapshot);
    const changed=ConsequenceAlgebraPolicySchema.parse({...algebraPolicy,failClosedUnknown:false});
    expect(()=>assertLocalConsequenceAuthorityCurrent(envelope,{...snapshot,algebraPolicy:changed},new Date("2026-08-30T16:00:10.000Z"))).toThrow("consequence_authority_snapshot_drift");
  });
});
