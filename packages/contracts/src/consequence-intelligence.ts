import {z} from "zod";

const ConsequenceRiskLevelSchema=z.enum(["LOW","MEDIUM","HIGH","CRITICAL"]);
const ConsequenceReversibilitySchema=z.enum(["REVERSIBLE","DELAYABLE","COMPENSABLE","IRREVERSIBLE","UNKNOWN"]);

export const ConsequenceOutcomeSchema=z.enum(["SUCCESS","FAILURE","UNKNOWN"]);
export type ConsequenceOutcome=z.infer<typeof ConsequenceOutcomeSchema>;

export const EpistemicStatusSchema=z.enum(["SUPPORTED","CONTRADICTED","STALE","UNKNOWN"]);
export type EpistemicStatus=z.infer<typeof EpistemicStatusSchema>;

export const EpistemicEvidenceSchema=z.object({kind:z.string().min(1).max(80),source:z.string().min(1).max(300),observedAt:z.string().datetime(),summary:z.string().min(1).max(1000),digest:z.string().min(16).max(256).optional()});
export type EpistemicEvidence=z.infer<typeof EpistemicEvidenceSchema>;

export const EpistemicClaimSchema=z.object({claimId:z.string().min(8).max(160),claim:z.string().min(1).max(2000),scope:z.string().min(1).max(500),status:EpistemicStatusSchema,confidence:z.number().min(0).max(1),realityVersion:z.string().max(200).optional(),observedAt:z.string().datetime(),supportingEvidence:z.array(EpistemicEvidenceSchema).max(50).default([]),contradictingEvidence:z.array(EpistemicEvidenceSchema).max(50).default([]),invalidationConditions:z.array(z.string().max(500)).max(30).default([])});
export type EpistemicClaim=z.infer<typeof EpistemicClaimSchema>;

export const IntelligenceBudgetSchema=z.object({maxLatencyMs:z.number().int().positive().max(3_600_000).optional(),maxCostUsd:z.number().nonnegative().max(1_000_000).optional(),maxModelCalls:z.number().int().positive().max(1000).optional(),privacy:z.enum(["LOCAL_ONLY","REDACTED_REMOTE_ALLOWED","REMOTE_ALLOWED"]).default("REDACTED_REMOTE_ALLOWED")});
export type IntelligenceBudget=z.infer<typeof IntelligenceBudgetSchema>;

/**
 * AGENT is a cognitive engine: an external agent may reason/delegate inside a
 * Cognitive Program. TOOL/DEVICE/ROBOT remain outside this engine union so
 * cognition never implies permission to execute real-world effects.
 */
export const CognitiveEngineSchema=z.object({id:z.string().min(1).max(200),kind:z.enum(["MODEL","AGENT","SKILL","RETRIEVER","SIMULATOR","PROOF_PROVIDER","HUMAN"]),provider:z.string().max(200).optional(),local:z.boolean().default(false),modalities:z.array(z.string().max(50)).max(20).default([]),competenceTags:z.array(z.string().max(100)).max(100).default([]),authority:z.literal(false).default(false)});
export type CognitiveEngine=z.infer<typeof CognitiveEngineSchema>;

export const IntelligenceStateSchema=z.object({version:z.literal("CIEAV_INTELLIGENCE_STATE_V1"),objective:z.string().min(1).max(5000),epistemicState:z.array(EpistemicClaimSchema).max(1000).default([]),currentRealityDigest:z.string().min(16).max(256).optional(),availableEngines:z.array(CognitiveEngineSchema).max(500).default([]),availableTools:z.array(z.string().max(200)).max(500).default([]),availableSkills:z.array(z.string().max(200)).max(500).default([]),authorityEnvelopeRef:z.string().max(300).optional(),activeHypotheses:z.array(z.string().max(2000)).max(100).default([]),uncertainty:z.number().min(0).max(1).default(1),proofObligations:z.array(z.string().max(1000)).max(100).default([]),recoveryRequirements:z.array(z.string().max(1000)).max(100).default([]),budget:IntelligenceBudgetSchema.default({privacy:"REDACTED_REMOTE_ALLOWED"}),authority:z.literal(false).default(false),mayMintExecutionAuthority:z.literal(false).default(false)});
export type IntelligenceState=z.infer<typeof IntelligenceStateSchema>;

export const ConsequencePathSchema=z.object({pathId:z.string().min(1).max(160),executionProvider:z.string().min(1).max(200),operation:z.string().min(1).max(300),expectedSuccessProbability:z.number().min(0).max(1),expectedUnknownProbability:z.number().min(0).max(1),authorityCost:z.number().min(0).max(1),blastRadius:z.number().min(0).max(1),proofability:z.number().min(0).max(1),reversibility:ConsequenceReversibilitySchema,estimatedLatencyMs:z.number().int().nonnegative().max(86_400_000).optional(),estimatedCostUsd:z.number().nonnegative().max(1_000_000).optional(),preconditions:z.array(z.string().max(1000)).max(100).default([]),proofObligations:z.array(z.string().max(1000)).max(100).default([]),recoverySemantics:z.array(z.string().max(1000)).max(100).default([])});
export type ConsequencePath=z.infer<typeof ConsequencePathSchema>;

export const ConsequenceProgramSchema=z.object({version:z.literal("CIEAV_CONSEQUENCE_PROGRAM_V1"),programId:z.string().min(8).max(160),objective:z.string().min(1).max(5000),worldBeforeDigest:z.string().min(16).max(256).optional(),desiredState:z.array(z.string().min(1).max(2000)).min(1).max(100),preconditions:z.array(z.string().max(1000)).max(100).default([]),candidatePaths:z.array(ConsequencePathSchema).min(1).max(50),requiredAuthority:z.array(z.string().max(500)).max(100).default([]),proofObligations:z.array(z.string().max(1000)).max(100).default([]),recoverySemantics:z.array(z.string().max(1000)).max(100).default([]),unknownPolicy:z.enum(["ALLOW_UNKNOWN","STOP_AND_RECONCILE","ESCALATE"]),duplicatePolicy:z.enum(["RETRY_SAFE","IDEMPOTENCY_REQUIRED","RECONCILE_BEFORE_RETRY","NEVER_RETRY_AUTOMATICALLY"]),risk:ConsequenceRiskLevelSchema,authority:z.literal(false).default(false)});
export type ConsequenceProgram=z.infer<typeof ConsequenceProgramSchema>;

/** AGENT denotes delegated cognition only; it is never an execution step. */
export const CognitiveStepSchema=z.object({stepId:z.string().min(1).max(160),kind:z.enum(["MODEL","AGENT","SKILL","RETRIEVE","SIMULATE","PROVE","HUMAN","STOP"]),engineId:z.string().max(200).optional(),purpose:z.string().min(1).max(1000),parallelGroup:z.string().max(120).optional()});
export const CognitiveProgramSchema=z.object({version:z.literal("CIEAV_COGNITIVE_PROGRAM_V1"),strategy:z.string().min(1).max(200),steps:z.array(CognitiveStepSchema).min(1).max(100),authority:z.literal(false).default(false)});
export type CognitiveProgram=z.infer<typeof CognitiveProgramSchema>;

export const ProofProviderDescriptorSchema=z.object({id:z.string().min(1).max(200),version:z.string().min(1).max(100),evidenceKinds:z.array(z.string().max(100)).min(1).max(100),canObservePreState:z.boolean(),canObservePostState:z.boolean(),canSettleOutcome:z.boolean().default(false),authority:z.literal(false).default(false)});
export type ProofProviderDescriptor=z.infer<typeof ProofProviderDescriptorSchema>;

export const LearningProviderDescriptorSchema=z.object({id:z.string().min(1).max(200),version:z.string().min(1).max(100),methods:z.array(z.enum(["SFT","DPO","KTO","GRPO","RLVR","OFFLINE_RL","DISTILLATION","REWARD_MODEL","PROCESS_REWARD"])).min(1),local:z.boolean().default(false),authority:z.literal(false).default(false),productionAuthority:z.literal(false).default(false)});
export type LearningProviderDescriptor=z.infer<typeof LearningProviderDescriptorSchema>;

export const AuthorizedOutcomeTrajectorySchema=z.object({version:z.literal("CIEAV_AUTHORIZED_OUTCOME_TRAJECTORY_V2"),trajectoryId:z.string().min(8).max(200),objective:z.string().min(1).max(5000),principalIdentityRef:z.string().max(300).optional(),agentIdentityRef:z.string().max(300).optional(),modelIdentityRef:z.string().max(300).optional(),worldBeforeDigest:z.string().min(16).max(256).optional(),worldAfterDigest:z.string().min(16).max(256).optional(),authorityEnvelopeRef:z.string().max(300).optional(),credentialLeaseRef:z.string().max(300).optional(),operation:z.string().min(1).max(300),exactArgumentsDigest:z.string().min(16).max(256),policyDecisionRef:z.string().max(300).optional(),realityBoundCommitRef:z.string().max(300).optional(),executionTicketRef:z.string().max(300).optional(),executionEvents:z.array(z.string().max(1500)).max(500).default([]),evidence:z.array(EpistemicEvidenceSchema).max(500).default([]),outcome:ConsequenceOutcomeSchema,recovery:z.array(z.string().max(1500)).max(100).default([]),cryptographicallyVerified:z.boolean(),authorityGrade:z.boolean(),realityBound:z.boolean(),eligibleAgenticRl:z.boolean(),consentScope:z.string().max(300).optional(),redactionProfile:z.string().max(300),authority:z.literal(false).default(false),productionAuthority:z.literal(false).default(false)});
export type AuthorizedOutcomeTrajectory=z.infer<typeof AuthorizedOutcomeTrajectorySchema>;
