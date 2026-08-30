import crypto from "node:crypto";
import {mkdtemp,readFile,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach,describe,expect,it} from "vitest";
import type {QualifiedToolManifest} from "@cieav/contracts";
import {adapterQualificationReport,makeQualifiedToolManifest} from "@cieav/core/adapter-qualification";
import {CieavAdapterQualificationStore} from "./adapter-qualification-store.js";

const dirs:string[]=[];
afterEach(()=>{dirs.length=0});
const d=(c:string)=>c.repeat(64),secret="adapter-qualification-store-secret-0123456789";
async function store(){const dir=await mkdtemp(path.join(os.tmpdir(),"cieav-adapter-qualification-"));dirs.push(dir);return{file:path.join(dir,"qualification.json"),value:new CieavAdapterQualificationStore(path.join(dir,"qualification.json"),secret)}}
const base=():Omit<QualifiedToolManifest,"manifestDigest">=>({
  version:"CIEAV_QUALIFIED_TOOL_MANIFEST_V1",toolId:"browser.commit",protocols:["BROWSER"],effectClasses:["UPDATE"],trustedToolContractDigest:d("1"),
  semanticCompiler:{id:"cieav.browser.semantic.v1",version:"1",digest:d("2"),authority:false},canonicalResolver:{id:"cieav.http.resource.v1",version:"1",manifestDigest:d("3"),authority:false},
  adapterArtifact:{kind:"SOURCE",digest:d("4"),provenanceRefs:["git:browser-adapter"],authority:false},runtimeIdentity:{runtimeKinds:["BROWSER_HOST"],requiredAttestationClasses:["LOCAL_KEY"],runtimeDigest:d("5"),authority:false},credentialClasses:["CIEAV_INJECTED"],
  proof:{proofContractRef:"proof:browser-dom",providerClasses:["LOCAL_READBACK"],proofContractDigest:d("6"),authority:false},recovery:{recoveryContractRef:"recovery:browser",recoveryContractDigest:d("7"),reconciliationSupported:true,compensationSupported:false,authority:false},
  commitPoint:{class:"BROWSER_INPUT",preflightSideEffectFree:true,oneUseAuthoritySpentImmediatelyBeforeEffect:true,ambiguousAfterBoundaryBecomesUnknown:true,qualificationEvidenceRefs:["test:browser-commit-point-e2e"],authority:false},offlineCapability:"LOCAL_ONLY",qualificationEvidenceRefs:["test:browser-commit-point-e2e"],qualificationState:"QUALIFIED",productionQualified:true,authority:false,mayMintExecutionAuthority:false
});
const current={trustedToolContractDigest:d("1"),semanticCompilerDigest:d("2"),canonicalResolverManifestDigest:d("3"),adapterArtifactDigest:d("4"),runtimeDigest:d("5"),proofContractDigest:d("6"),recoveryContractDigest:d("7")};

describe("CIEAV adapter qualification store",()=>{
  it("persists a qualified manifest and report across restart",async()=>{const {file,value}=await store(),manifest=makeQualifiedToolManifest(base()),report=adapterQualificationReport(manifest,[{id:"commit-point",result:"PASS",evidenceRefs:["test:browser-commit-point-e2e"],reason:"qualified commit point"}]);await value.putManifest(manifest);await value.putReport(report);expect((await value.requireCurrentQualified("browser.commit",current)).manifestDigest).toBe(manifest.manifestDigest);await value.close();const restarted=new CieavAdapterQualificationStore(file,secret);expect(await restarted.verifyIntegrity()).toBe(true);expect((await restarted.requireCurrentQualified("browser.commit",current)).manifestDigest).toBe(manifest.manifestDigest)});
  it("fails closed when a current component drifts",async()=>{const {value}=await store(),manifest=makeQualifiedToolManifest(base()),report=adapterQualificationReport(manifest,[{id:"all",result:"PASS",evidenceRefs:[],reason:"qualified"}]);await value.putManifest(manifest);await value.putReport(report);await expect(value.requireCurrentQualified("browser.commit",{...current,adapterArtifactDigest:d("a")})).rejects.toThrow("qualified_tool_adapter_artifact_drift")});
  it("suspension immediately removes production qualification and requires fresh evidence after requalification",async()=>{const {value}=await store(),manifest=makeQualifiedToolManifest(base()),report=adapterQualificationReport(manifest,[{id:"all",result:"PASS",evidenceRefs:[],reason:"qualified"}]);await value.putManifest(manifest);await value.putReport(report);const suspended=await value.setState("browser.commit","SUSPENDED");expect(suspended.productionQualified).toBe(false);await expect(value.requireCurrentQualified("browser.commit",current)).rejects.toThrow("qualified_tool_manifest_not_production_qualified");const requalified=await value.setState("browser.commit","QUALIFIED");expect(requalified.manifestDigest).not.toBe(manifest.manifestDigest);await expect(value.requireCurrentQualified("browser.commit",current)).rejects.toThrow("qualified_tool_report_required")});
  it("revocation is durable across restart",async()=>{const {file,value}=await store(),manifest=makeQualifiedToolManifest(base());await value.putManifest(manifest);await value.setState("browser.commit","REVOKED");await value.close();const restarted=new CieavAdapterQualificationStore(file,secret);expect((await restarted.getManifest("browser.commit"))?.qualificationState).toBe("REVOKED")});
  it("detects HMAC tampering on disk",async()=>{const {file,value}=await store(),manifest=makeQualifiedToolManifest(base());await value.putManifest(manifest);await value.close();const envelope=JSON.parse(await readFile(file,"utf8"));envelope.payload.manifests[0].offlineCapability="FULL";await writeFile(file,JSON.stringify(envelope));const restarted=new CieavAdapterQualificationStore(file,secret);await expect(restarted.verifyIntegrity()).rejects.toThrow("unreadable, corrupt, or unauthenticated")});
  it("requires a report to refer to the current manifest when it is first recorded",async()=>{const {value}=await store(),manifest=makeQualifiedToolManifest(base()),other=makeQualifiedToolManifest({...base(),toolId:"http.commit"}),report=adapterQualificationReport(other,[{id:"all",result:"PASS",evidenceRefs:[],reason:"qualified"}]);await value.putManifest(manifest);await expect(value.putReport(report)).rejects.toThrow("adapter_qualification_report_manifest_missing")})
});
