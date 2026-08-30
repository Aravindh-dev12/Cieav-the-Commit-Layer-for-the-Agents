import crypto from "node:crypto";
import {
  AdapterQualificationReportSchema,
  QualifiedToolManifestSchema,
  type AdapterQualificationReport,
  type QualifiedToolManifest
} from "@cieav/contracts";

const canonical=(value:unknown):string=>Array.isArray(value)
  ?`[${value.map(canonical).join(",")}]`
  :value&&typeof value==="object"
    ?`{${Object.keys(value as Record<string,unknown>).sort().map(key=>`${JSON.stringify(key)}:${canonical((value as Record<string,unknown>)[key])}`).join(",")}}`
    :JSON.stringify(value)??"undefined";

export const adapterQualificationDigest=(value:unknown)=>crypto.createHash("sha256").update(canonical(value)).digest("hex");

export function qualifiedToolManifestDigestBase(manifest:Omit<QualifiedToolManifest,"manifestDigest">){return manifest}

export function makeQualifiedToolManifest(input:Omit<QualifiedToolManifest,"manifestDigest">):QualifiedToolManifest{
  const base=QualifiedToolManifestSchema.omit({manifestDigest:true}).parse(input);
  return QualifiedToolManifestSchema.parse({...base,manifestDigest:adapterQualificationDigest(base)});
}

export function assertQualifiedToolManifestIntegrity(raw:QualifiedToolManifest):QualifiedToolManifest{
  const manifest=QualifiedToolManifestSchema.parse(raw),{manifestDigest,...base}=manifest;
  if(adapterQualificationDigest(base)!==manifestDigest)throw new Error("qualified_tool_manifest_integrity_mismatch");
  if(manifest.authority!==false||manifest.mayMintExecutionAuthority!==false)throw new Error("qualified_tool_manifest_must_be_zero_authority");
  return manifest;
}

export type QualifiedToolCurrentState={
  trustedToolContractDigest:string;
  semanticCompilerDigest:string;
  canonicalResolverManifestDigest:string;
  adapterArtifactDigest:string;
  runtimeDigest?:string;
  proofContractDigest:string;
  recoveryContractDigest:string;
};

export function assertQualifiedToolManifestCurrent(raw:QualifiedToolManifest,current:QualifiedToolCurrentState){
  const manifest=assertQualifiedToolManifestIntegrity(raw);
  if(!manifest.productionQualified||manifest.qualificationState!=="QUALIFIED")throw new Error("qualified_tool_manifest_not_production_qualified");
  if(manifest.trustedToolContractDigest!==current.trustedToolContractDigest)throw new Error("qualified_tool_contract_drift");
  if(manifest.semanticCompiler.digest!==current.semanticCompilerDigest)throw new Error("qualified_tool_semantic_compiler_drift");
  if(manifest.canonicalResolver.manifestDigest!==current.canonicalResolverManifestDigest)throw new Error("qualified_tool_resolver_drift");
  if(manifest.adapterArtifact.digest!==current.adapterArtifactDigest)throw new Error("qualified_tool_adapter_artifact_drift");
  if(manifest.runtimeIdentity.runtimeDigest&&manifest.runtimeIdentity.runtimeDigest!==current.runtimeDigest)throw new Error("qualified_tool_runtime_identity_drift");
  if(manifest.proof.proofContractDigest!==current.proofContractDigest)throw new Error("qualified_tool_proof_contract_drift");
  if(manifest.recovery.recoveryContractDigest!==current.recoveryContractDigest)throw new Error("qualified_tool_recovery_contract_drift");
  return manifest;
}

export function adapterQualificationReport(manifest:QualifiedToolManifest,checks:AdapterQualificationReport["checks"],at=new Date()):AdapterQualificationReport{
  const verified=assertQualifiedToolManifestIntegrity(manifest),qualified=verified.productionQualified&&checks.length>0&&checks.every(check=>check.result==="PASS"),base={
    version:"CIEAV_ADAPTER_QUALIFICATION_REPORT_V1" as const,
    manifestDigest:verified.manifestDigest,
    qualified,
    checkedAt:at.toISOString(),
    checks,
    authority:false as const,
    mayMintExecutionAuthority:false as const
  };
  return AdapterQualificationReportSchema.parse({...base,reportDigest:adapterQualificationDigest(base)});
}

export function assertAdapterQualificationReportIntegrity(raw:AdapterQualificationReport){
  const report=AdapterQualificationReportSchema.parse(raw),{reportDigest,...base}=report;
  if(adapterQualificationDigest(base)!==reportDigest)throw new Error("adapter_qualification_report_integrity_mismatch");
  return report;
}

export const ADAPTER_QUALIFICATION_AUTHORITY=false as const;
export const ADAPTER_QUALIFICATION_MAY_MINT_EXECUTION_AUTHORITY=false as const;
