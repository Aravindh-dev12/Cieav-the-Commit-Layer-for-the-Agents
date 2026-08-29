import {z} from "zod";

const DigestSchema=z.string().regex(/^[0-9a-f]{64}$/);
const RefSchema=z.string().min(1).max(2000);

export const ConnectivityStateSchema=z.enum(["OFFLINE","LAN_ONLY","ONLINE_DEGRADED","ONLINE"]);
export type ConnectivityState=z.infer<typeof ConnectivityStateSchema>;

export const CognitiveRouteKindSchema=z.enum(["NO_MODEL","LOCAL_MODEL","LAN_MODEL","CLOUD_MODEL"]);
export type CognitiveRouteKind=z.infer<typeof CognitiveRouteKindSchema>;

export const NetworkRequirementSchema=z.enum(["NONE","LAN","INTERNET"]);
export type NetworkRequirement=z.infer<typeof NetworkRequirementSchema>;

export const OfflineRuntimeSnapshotSchema=z.object({
  version:z.literal("CIEAV_OFFLINE_RUNTIME_SNAPSHOT_V1"),
  nodeId:RefSchema,
  connectivity:ConnectivityStateSchema,
  localAuthorityReady:z.boolean(),
  localStateReady:z.boolean(),
  localPolicyReady:z.boolean(),
  localJournalReady:z.boolean(),
  localConsequenceGraphReady:z.boolean(),
  localInferenceReady:z.boolean(),
  lanInferenceReady:z.boolean(),
  cloudInferenceReady:z.boolean(),
  localProofProviderRefs:z.array(RefSchema).max(500).default([]),
  remoteProofProviderRefs:z.array(RefSchema).max(500).default([]),
  localAdapterRefs:z.array(RefSchema).max(1000).default([]),
  syncBacklogCount:z.number().int().nonnegative(),
  lastOnlineAt:z.string().datetime().optional(),
  observedAt:z.string().datetime(),
  snapshotDigest:DigestSchema,
  authority:z.literal(false),
  mayMintExecutionAuthority:z.literal(false)
}).strict();
export type OfflineRuntimeSnapshot=z.infer<typeof OfflineRuntimeSnapshotSchema>;

export const CognitiveRouteRequirementSchema=z.object({
  version:z.literal("CIEAV_COGNITIVE_ROUTE_REQUIREMENT_V1"),
  taskRef:RefSchema,
  modelRequired:z.boolean(),
  networkRequirement:NetworkRequirementSchema.default("NONE"),
  localOnly:z.boolean().default(false),
  allowLan:z.boolean().default(true),
  allowCloud:z.boolean().default(true),
  dataClassRefs:z.array(RefSchema).max(100).default([]),
  requirementDigest:DigestSchema,
  authority:z.literal(false)
}).strict();
export type CognitiveRouteRequirement=z.infer<typeof CognitiveRouteRequirementSchema>;

export const CognitiveRouteDecisionSchema=z.object({
  version:z.literal("CIEAV_COGNITIVE_ROUTE_DECISION_V1"),
  taskRef:RefSchema,
  route:CognitiveRouteKindSchema,
  decision:z.enum(["AVAILABLE","UNAVAILABLE","WAIT_FOR_NETWORK"]),
  reasonCodes:z.array(z.string().min(1).max(240)).min(1).max(100),
  runtimeSnapshotDigest:DigestSchema,
  requirementDigest:DigestSchema,
  createdAt:z.string().datetime(),
  decisionDigest:DigestSchema,
  authority:z.literal(false),
  mayMintExecutionAuthority:z.literal(false)
}).strict();
export type CognitiveRouteDecision=z.infer<typeof CognitiveRouteDecisionSchema>;

export const OfflineActionRequirementSchema=z.object({
  version:z.literal("CIEAV_OFFLINE_ACTION_REQUIREMENT_V1"),
  proposalRef:RefSchema,
  effectClass:z.string().min(1).max(240),
  adapterRef:RefSchema,
  networkRequirement:NetworkRequirementSchema,
  requiredProofProviderRefs:z.array(RefSchema).max(500).default([]),
  proofMayBeDeferred:z.boolean().default(false),
  durableLocalProofReservationReady:z.boolean().default(false),
  requiresFreshRemoteReality:z.boolean().default(false),
  requiresRemoteCredentialLease:z.boolean().default(false),
  requirementDigest:DigestSchema,
  authority:z.literal(false)
}).strict().superRefine((value,ctx)=>{
  if(value.proofMayBeDeferred&&!value.durableLocalProofReservationReady){
    ctx.addIssue({code:z.ZodIssueCode.custom,path:["durableLocalProofReservationReady"],message:"Deferred proof requires a durable local proof reservation"});
  }
});
export type OfflineActionRequirement=z.infer<typeof OfflineActionRequirementSchema>;

export const OfflineActionAdmissionSchema=z.object({
  version:z.literal("CIEAV_OFFLINE_ACTION_ADMISSION_V1"),
  proposalRef:RefSchema,
  mode:z.enum(["OFFLINE_LOCAL","LAN_LOCAL","ONLINE_LOCAL_AUTHORITY"]),
  decision:z.enum(["ALLOW_FOR_AUTHORIZATION","BLOCK","WAIT_NETWORK","RECONCILE"]),
  reasonCodes:z.array(z.string().min(1).max(240)).min(1).max(100),
  runtimeSnapshotDigest:DigestSchema,
  requirementDigest:DigestSchema,
  createdAt:z.string().datetime(),
  admissionDigest:DigestSchema,
  executionAuthorityIssued:z.literal(false),
  authority:z.literal(false),
  mayMintExecutionAuthority:z.literal(false)
}).strict();
export type OfflineActionAdmission=z.infer<typeof OfflineActionAdmissionSchema>;

export const OfflineSyncEnvelopeSchema=z.object({
  version:z.literal("CIEAV_OFFLINE_SYNC_ENVELOPE_V1"),
  nodeId:RefSchema,
  sequence:z.number().int().nonnegative(),
  previousEnvelopeDigest:DigestSchema.optional(),
  eventRefs:z.array(RefSchema).min(1).max(10000),
  eventSetDigest:DigestSchema,
  authorityStateIncluded:z.literal(false),
  executableCredentialIncluded:z.literal(false),
  createdAt:z.string().datetime(),
  envelopeDigest:DigestSchema,
  authority:z.literal(false),
  mayMintExecutionAuthority:z.literal(false)
}).strict();
export type OfflineSyncEnvelope=z.infer<typeof OfflineSyncEnvelopeSchema>;

export const OnlineControlUpdateSchema=z.object({
  version:z.literal("CIEAV_ONLINE_CONTROL_UPDATE_V1"),
  updateId:RefSchema,
  issuerRef:RefSchema,
  policyBundleDigest:DigestSchema.optional(),
  modelCatalogDigest:DigestSchema.optional(),
  toolCatalogDigest:DigestSchema.optional(),
  revocationSetDigest:DigestSchema.optional(),
  signatureRef:RefSchema,
  createdAt:z.string().datetime(),
  expiresAt:z.string().datetime().optional(),
  updateDigest:DigestSchema,
  authority:z.literal(false),
  mayMintExecutionAuthority:z.literal(false)
}).strict();
export type OnlineControlUpdate=z.infer<typeof OnlineControlUpdateSchema>;
