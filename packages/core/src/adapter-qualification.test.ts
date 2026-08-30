import {describe,expect,it} from "vitest";
import type {QualifiedToolManifest} from "@cieav/contracts";
import {adapterQualificationReport,assertAdapterQualificationReportIntegrity,assertQualifiedToolManifestCurrent,assertQualifiedToolManifestIntegrity,makeQualifiedToolManifest} from "./adapter-qualification.js";

const d=(c:string)=>c.repeat(64);
const base=():Omit<QualifiedToolManifest,"manifestDigest">=>({
  version:"CIEAV_QUALIFIED_TOOL_MANIFEST_V1",
  toolId:"browser.commit",
  protocols:["BROWSER"],
  effectClasses:["UPDATE"],
  trustedToolContractDigest:d("1"),
  semanticCompiler:{id:"cieav.browser.semantic.v1",version:"1",digest:d("2"),authority:false},
  canonicalResolver:{id:"cieav.http.resource.v1",version:"1",manifestDigest:d("3"),authority:false},
  adapterArtifact:{kind:"SOURCE",digest:d("4"),provenanceRefs:["git:browser-adapter"],authority:false},
  runtimeIdentity:{runtimeKinds:["BROWSER_HOST"],requiredAttestationClasses:["LOCAL_KEY"],runtimeDigest:d("5"),authority:false},
  credentialClasses:["CIEAV_INJECTED"],
  proof:{proofContractRef:"proof:browser-dom",providerClasses:["LOCAL_READBACK"],proofContractDigest:d("6"),authority:false},
  recovery:{recoveryContractRef:"recovery:browser",recoveryContractDigest:d("7"),reconciliationSupported:true,compensationSupported:false,authority:false},
  commitPoint:{class:"BROWSER_INPUT",preflightSideEffectFree:true,oneUseAuthoritySpentImmediatelyBeforeEffect:true,ambiguousAfterBoundaryBecomesUnknown:true,qualificationEvidenceRefs:["test:browser-commit-point-e2e"],authority:false},
  offlineCapability:"LOCAL_ONLY",
  qualificationEvidenceRefs:["test:browser-commit-point-e2e","test:execution-router"],
  qualificationState:"QUALIFIED",
  productionQualified:true,
  authority:false,
  mayMintExecutionAuthority:false
});
const current={trustedToolContractDigest:d("1"),semanticCompilerDigest:d("2"),canonicalResolverManifestDigest:d("3"),adapterArtifactDigest:d("4"),runtimeDigest:d("5"),proofContractDigest:d("6"),recoveryContractDigest:d("7")};

describe("CIEAV adapter qualification",()=>{
  it("creates a zero-authority production-qualified manifest with deterministic integrity",()=>{const manifest=makeQualifiedToolManifest(base());expect(manifest.productionQualified).toBe(true);expect(manifest.authority).toBe(false);expect(manifest.mayMintExecutionAuthority).toBe(false);expect(assertQualifiedToolManifestIntegrity(manifest).manifestDigest).toBe(manifest.manifestDigest);expect(assertQualifiedToolManifestCurrent(manifest,current).toolId).toBe("browser.commit")});
  it("detects manifest tampering",()=>{const manifest=makeQualifiedToolManifest(base());expect(()=>assertQualifiedToolManifestIntegrity({...manifest,offlineCapability:"FULL"})).toThrow("qualified_tool_manifest_integrity_mismatch")});
  it.each([
    ["trusted consequence contract",{...current,trustedToolContractDigest:d("a")},"qualified_tool_contract_drift"],
    ["semantic compiler",{...current,semanticCompilerDigest:d("a")},"qualified_tool_semantic_compiler_drift"],
    ["canonical resolver",{...current,canonicalResolverManifestDigest:d("a")},"qualified_tool_resolver_drift"],
    ["adapter artifact",{...current,adapterArtifactDigest:d("a")},"qualified_tool_adapter_artifact_drift"],
    ["runtime identity",{...current,runtimeDigest:d("a")},"qualified_tool_runtime_identity_drift"],
    ["proof contract",{...current,proofContractDigest:d("a")},"qualified_tool_proof_contract_drift"],
    ["recovery contract",{...current,recoveryContractDigest:d("a")},"qualified_tool_recovery_contract_drift"]
  ])("fails closed on %s drift",(_label,state,error)=>{const manifest=makeQualifiedToolManifest(base());expect(()=>assertQualifiedToolManifestCurrent(manifest,state)).toThrow(String(error))});
  it("does not allow a suspended manifest to present as production qualified",()=>{expect(()=>makeQualifiedToolManifest({...base(),qualificationState:"SUSPENDED",productionQualified:true})).toThrow()});
  it("requires an exact commit-point contract for production qualification",()=>{expect(()=>makeQualifiedToolManifest({...base(),commitPoint:{...base().commitPoint,preflightSideEffectFree:false}})).toThrow()});
  it("produces an integrity-bound zero-authority qualification report",()=>{const manifest=makeQualifiedToolManifest(base()),report=adapterQualificationReport(manifest,[{id:"browser-commit-point",result:"PASS",evidenceRefs:["test:browser-commit-point-e2e"],reason:"one-use authority is spent immediately before the first browser effect"}]);expect(report.qualified).toBe(true);expect(report.authority).toBe(false);expect(assertAdapterQualificationReportIntegrity(report).reportDigest).toBe(report.reportDigest)})
});
