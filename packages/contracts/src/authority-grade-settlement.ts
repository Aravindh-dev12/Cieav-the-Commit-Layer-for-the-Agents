import {z} from "zod";
import {AgentTaskSchema,AgentTaskEventSchema} from "./agent-task.js";
import {RealityBoundCommitSchema} from "./intent-reality.js";
import {AgentIdentityAttestationSchema,ExecutionAuditEventSchema,ExecutionProposalSchema,ExecutionTicketSchema,FormalAuthorizationDecisionSchema,FormalPermissionGraphSchema,ScopedCredentialLeaseSchema} from "./execution-fabric.js";
import {ProofCaseSchema} from "./proof.js";

export const AuthorityGradeSettlementBundleSchema=z.object({
  version:z.literal("CIEAV_AUTHORITY_GRADE_SETTLEMENT_BUNDLE_V1"),
  task:AgentTaskSchema,
  taskEvents:z.array(AgentTaskEventSchema).max(5000),
  proposal:ExecutionProposalSchema,
  authorization:FormalAuthorizationDecisionSchema,
  permissionGraph:FormalPermissionGraphSchema,
  identityAttestation:AgentIdentityAttestationSchema,
  credentialLease:ScopedCredentialLeaseSchema,
  realityBoundCommit:RealityBoundCommitSchema,
  executionTicket:ExecutionTicketSchema,
  executionAudit:z.array(ExecutionAuditEventSchema).max(10000),
  proofCase:ProofCaseSchema,
  redactionProfile:z.string().min(1).max(300),
  consentScope:z.string().min(1).max(300).optional(),
  sourceIntegrity:z.object({
    agentKernelAuthenticated:z.literal(true),
    intentRealityAuthenticated:z.literal(true),
    executionFabricAuthenticated:z.literal(true),
    proofStoreAuthenticated:z.literal(true),
    executionAuditChainVerified:z.literal(true),
    identityAttestationVerified:z.literal(true)
  }).strict(),
  authority:z.literal(false).default(false),
  productionAuthority:z.literal(false).default(false)
}).strict();
export type AuthorityGradeSettlementBundle=z.infer<typeof AuthorityGradeSettlementBundleSchema>;

export const AuthorityGradeSettlementAssessmentSchema=z.object({
  version:z.literal("CIEAV_AUTHORITY_GRADE_SETTLEMENT_ASSESSMENT_V1"),
  eligible:z.boolean(),
  authorityGrade:z.boolean(),
  realityBound:z.boolean(),
  cryptographicallyVerified:z.boolean(),
  outcome:z.enum(["SUCCESS","FAILURE","UNKNOWN"]),
  hardFailures:z.array(z.string().min(1).max(300)).max(100),
  warnings:z.array(z.string().min(1).max(500)).max(100),
  evidenceRefs:z.array(z.string().min(1).max(500)).max(500),
  authority:z.literal(false),
  productionAuthority:z.literal(false)
}).strict();
export type AuthorityGradeSettlementAssessment=z.infer<typeof AuthorityGradeSettlementAssessmentSchema>;
