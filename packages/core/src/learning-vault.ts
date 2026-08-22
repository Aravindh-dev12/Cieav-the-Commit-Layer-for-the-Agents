import crypto from "node:crypto";
import {AuthorizedOutcomeTrajectorySchema,IntelligenceMetabolismDecisionSchema,LearningDatasetManifestSchema,LearningEvidenceLedgerEntrySchema,type AuthorizedOutcomeTrajectory,type IntelligenceMetabolismDecision,type LearningDatasetEntry,type LearningDatasetManifest,type LearningEvidenceLedgerEntry} from "@cieav/contracts";
import {intelligenceMetabolismDigest} from "./intelligence-metabolism.js";

const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value as Record<string,unknown>).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(",")}}`:JSON.stringify(value)??"undefined";
export const learningVaultDigest=(value:unknown)=>crypto.createHash("sha256").update(canonical(value)).digest("hex");
const sourceSinks=["MODEL_DATASET","RECOVERY_DATASET","CALIBRATION_DATASET"] as const;

export function learningEvidenceFromMetabolism(rawTrajectory:AuthorizedOutcomeTrajectory,rawDecision:IntelligenceMetabolismDecision,admittedAt=new Date().toISOString()):LearningEvidenceLedgerEntry[]{
  const trajectory=AuthorizedOutcomeTrajectorySchema.parse(rawTrajectory),decision=IntelligenceMetabolismDecisionSchema.parse(rawDecision);
  const trajectoryDigest=intelligenceMetabolismDigest(trajectory);if(decision.trajectoryId!==trajectory.trajectoryId||decision.trajectoryDigest!==trajectoryDigest)throw new Error("learning_evidence_metabolism_trajectory_mismatch");
  if(!decision.trustedEpisode)return[];
  const admitted=sourceSinks.filter(sink=>decision.sinks.includes(sink));
  return admitted.map(sourceSink=>LearningEvidenceLedgerEntrySchema.parse({entry:{trajectoryId:trajectory.trajectoryId,trajectoryDigest,operation:trajectory.operation,exactArgumentsDigest:trajectory.exactArgumentsDigest,outcome:trajectory.outcome,authorityGrade:trajectory.authorityGrade,realityBound:trajectory.realityBound,eligibleAgenticRl:trajectory.eligibleAgenticRl,evidenceDigest:learningVaultDigest(trajectory.evidence),redactionProfile:trajectory.redactionProfile,...(trajectory.consentScope?{consentScope:trajectory.consentScope}:{}),sourceSink},admittedAt,metabolismDecisionDigest:learningVaultDigest(decision),authority:false,productionAuthority:false,mayMintExecutionAuthority:false}));
}

const purposeSink={OUTCOME_POLICY:"MODEL_DATASET",RECOVERY:"RECOVERY_DATASET",CALIBRATION:"CALIBRATION_DATASET"} as const;
export function buildLearningDatasetManifest(rawEntries:LearningEvidenceLedgerEntry[],purpose:keyof typeof purposeSink,createdAt=new Date().toISOString()):LearningDatasetManifest{
  const expected=purposeSink[purpose],entries=rawEntries.map(item=>LearningEvidenceLedgerEntrySchema.parse(item)).filter(item=>item.entry.sourceSink===expected).map(item=>item.entry);
  if(!entries.length)throw new Error(`learning_dataset_requires_${expected.toLowerCase()}_evidence`);
  const deduped=new Map<string,LearningDatasetEntry>();for(const entry of entries){const key=`${entry.trajectoryId}\0${entry.sourceSink}`,prior=deduped.get(key);if(prior&&learningVaultDigest(prior)!==learningVaultDigest(entry))throw new Error("learning_dataset_trajectory_content_mismatch");deduped.set(key,entry)}
  const sorted=[...deduped.values()].sort((a,b)=>a.trajectoryId.localeCompare(b.trajectoryId)),subject={purpose,entries:sorted},datasetDigest=learningVaultDigest(subject),datasetId=`dataset:${datasetDigest.slice(0,40)}`;
  return LearningDatasetManifestSchema.parse({version:"CIEAV_LEARNING_DATASET_MANIFEST_V1",datasetId,datasetDigest,purpose,entries:sorted,createdAt,authority:false,productionAuthority:false,mayMintExecutionAuthority:false,mayPromoteModel:false});
}

export function verifyLearningDatasetManifest(raw:LearningDatasetManifest):LearningDatasetManifest{
  const manifest=LearningDatasetManifestSchema.parse(raw),expected=learningVaultDigest({purpose:manifest.purpose,entries:manifest.entries});
  if(manifest.datasetDigest!==expected||manifest.datasetId!==`dataset:${expected.slice(0,40)}`)throw new Error("learning_dataset_manifest_digest_mismatch");
  return manifest;
}

export const LEARNING_VAULT_AUTHORITY=false as const;
export const LEARNING_VAULT_MAY_MINT_EXECUTION_AUTHORITY=false as const;
