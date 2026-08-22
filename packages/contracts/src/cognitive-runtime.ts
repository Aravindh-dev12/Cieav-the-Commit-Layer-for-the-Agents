import {z} from "zod";

export const CognitiveCellTypeSchema=z.enum(["MODEL","AGENT","TOOL","SKILL","RETRIEVER","SIMULATOR","SENSOR","DEVICE","ROBOT","PROOF_PROVIDER","HUMAN"]);
export type CognitiveCellType=z.infer<typeof CognitiveCellTypeSchema>;
export const CognitiveCellHealthSchema=z.enum(["HEALTHY","DEGRADED","UNHEALTHY","UNKNOWN","REVOKED"]);
export type CognitiveCellHealth=z.infer<typeof CognitiveCellHealthSchema>;
export const CognitiveCellPrivacySchema=z.enum(["LOCAL_ONLY","REDACTED_REMOTE_ALLOWED","REMOTE_ALLOWED"]);
export type CognitiveCellPrivacy=z.infer<typeof CognitiveCellPrivacySchema>;

export const CognitiveCellDescriptorSchema=z.object({version:z.literal("CIEAV_COGNITIVE_CELL_V1"),id:z.string().min(1).max(200),type:CognitiveCellTypeSchema,provider:z.string().min(1).max(200),identityRef:z.string().max(300).optional(),capabilities:z.array(z.string().min(1).max(160)).max(500).default([]),inputModalities:z.array(z.string().min(1).max(80)).max(50).default([]),outputModalities:z.array(z.string().min(1).max(80)).max(50).default([]),local:z.boolean().default(false),privacyBoundary:CognitiveCellPrivacySchema.default("REDACTED_REMOTE_ALLOWED"),health:CognitiveCellHealthSchema.default("UNKNOWN"),lastHeartbeatAt:z.string().datetime(),latencyMsP50:z.number().nonnegative().max(86_400_000).optional(),costPerInvocationUsd:z.number().nonnegative().max(1_000_000).optional(),competence:z.record(z.string().max(160),z.number().min(0).max(1)).default({}),proofCapabilities:z.array(z.string().max(160)).max(100).default([]),authority:z.literal(false).default(false),mayMintExecutionAuthority:z.literal(false).default(false)});
export type CognitiveCellDescriptor=z.infer<typeof CognitiveCellDescriptorSchema>;

export const SelfModelSchema=z.object({version:z.literal("CIEAV_SELF_MODEL_V1"),generatedAt:z.string().datetime(),cells:z.array(CognitiveCellDescriptorSchema).max(5000),healthyCellIds:z.array(z.string().max(200)).max(5000),availableCapabilities:z.array(z.string().max(160)).max(5000),activeObjectives:z.array(z.string().max(500)).max(1000).default([]),activeCommitmentRefs:z.array(z.string().max(300)).max(1000).default([]),privacy:CognitiveCellPrivacySchema,uncertainty:z.number().min(0).max(1),authority:z.literal(false).default(false),mayMintExecutionAuthority:z.literal(false).default(false)});
export type SelfModel=z.infer<typeof SelfModelSchema>;

export const WorkspaceContributionKindSchema=z.enum(["EVIDENCE","HYPOTHESIS","PLAN","MEMORY","CONSTRAINT","QUESTION","RESULT"]);
export type WorkspaceContributionKind=z.infer<typeof WorkspaceContributionKindSchema>;
export const WorkspaceScopeSchema=z.object({ownerKind:z.enum(["USER","AGENT","SERVICE","DEVICE","ORGANIZATION"]),ownerId:z.string().min(1).max(300),sessionId:z.string().min(1).max(300).optional(),deviceId:z.string().min(1).max(300).optional()}).strict();
export type WorkspaceScope=z.infer<typeof WorkspaceScopeSchema>;

export const WorkspaceContributionSchema=z.object({id:z.string().min(8).max(200),workspaceId:z.string().min(8).max(200),cellId:z.string().min(1).max(200),kind:WorkspaceContributionKindSchema,summary:z.string().min(1).max(5000),evidenceRefs:z.array(z.string().max(300)).max(200).default([]),confidence:z.number().min(0).max(1).optional(),privacy:CognitiveCellPrivacySchema,createdAt:z.string().datetime(),authority:z.literal(false).default(false)});
export type WorkspaceContribution=z.infer<typeof WorkspaceContributionSchema>;

export const GlobalWorkspaceSchema=z.object({version:z.literal("CIEAV_GLOBAL_WORKSPACE_V1"),workspaceId:z.string().min(8).max(200),objective:z.string().min(1).max(5000),scope:WorkspaceScopeSchema.optional(),createdAt:z.string().datetime(),updatedAt:z.string().datetime(),privacy:CognitiveCellPrivacySchema,contributionIds:z.array(z.string().max(200)).max(10000),authority:z.literal(false).default(false),mayMintExecutionAuthority:z.literal(false).default(false)});
export type GlobalWorkspace=z.infer<typeof GlobalWorkspaceSchema>;
