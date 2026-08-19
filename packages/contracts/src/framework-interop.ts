import {z} from "zod";
import {SemanticEffectSchema} from "./intent-reality.js";

const DigestSchema=z.string().regex(/^[0-9a-f]{64}$/);

export const AgentFrameworkSchema=z.enum([
  "MCP","A2A","LANGCHAIN","LANGGRAPH","AGNO","OPENAI_AGENTS","AUTOGEN","CREWAI","SEMANTIC_KERNEL","LLAMAINDEX","PYDANTIC_AI","GOOGLE_ADK","CLAUDE_AGENT_SDK","DSPY","LANGFUSE","TEMPORAL","N8N","CUSTOM"
]);
export type AgentFramework=z.infer<typeof AgentFrameworkSchema>;

export const FrameworkHookSurfaceSchema=z.enum([
  "MCP_PROXY","A2A_GATEWAY","BEFORE_TOOL","AFTER_TOOL","WRAP_TOOL","WORKBENCH_CALL","DEFERRED_TOOL","PRE_TOOL_USE","FUNCTION_FILTER","TOOLSET_PROXY","MANUAL_DISPATCH","OTEL_TRACE","TASK_STATE","INTERRUPT_RESUME","CALLBACK","CUSTOM"
]);
export const FrameworkExecutionModeSchema=z.enum(["OBSERVE","GOVERNED_PROXY","MANDATORY_PROXY"]);
export const ConsequenceCoverageSchema=z.enum(["NONE","PARTIAL","COMPLETE"]);

export const FrameworkAdapterManifestSchema=z.object({
  id:z.string().min(1).max(240),
  version:z.literal(1),
  framework:AgentFrameworkSchema,
  adapterVersion:z.string().min(1).max(100),
  runtimeVersion:z.string().min(1).max(100).optional(),
  mode:FrameworkExecutionModeSchema,
  hookSurfaces:z.array(FrameworkHookSurfaceSchema).max(40),
  consequenceCoverage:ConsequenceCoverageSchema,
  directExecutionPossible:z.boolean(),
  agentCanSeeCredentials:z.boolean(),
  hostedToolsCanBypass:z.boolean(),
  canReplaceToolExecution:z.boolean(),
  supportsParallelCalls:z.boolean(),
  supportsResumeReplay:z.boolean(),
  supportsDelegation:z.boolean(),
  externalCompletionIsProof:z.boolean().default(false),
  telemetryOnly:z.boolean().default(false),
  failClosedOnAdapterError:z.boolean(),
  evidenceRefs:z.array(z.string().min(1).max(500)).max(100).default([]),
  notes:z.array(z.string().min(1).max(1000)).max(100).default([])
}).strict();
export type FrameworkAdapterManifest=z.infer<typeof FrameworkAdapterManifestSchema>;

export const FrameworkInteropAssessmentSchema=z.object({
  version:z.literal(1),
  manifestId:z.string().min(1).max(240),
  framework:AgentFrameworkSchema,
  requestedMode:FrameworkExecutionModeSchema,
  mandatoryEligible:z.boolean(),
  reasons:z.array(z.string().min(1).max(1200)).max(100),
  requirements:z.array(z.string().min(1).max(1200)).max(100),
  assessedAt:z.string().datetime(),
  digest:DigestSchema
}).strict();
export type FrameworkInteropAssessment=z.infer<typeof FrameworkInteropAssessmentSchema>;

export const FrameworkToolCallSchema=z.object({
  id:z.string().min(1).max(300),
  version:z.literal(1),
  framework:AgentFrameworkSchema,
  frameworkRunId:z.string().min(1).max(500),
  frameworkTaskId:z.string().max(500).optional(),
  conversationId:z.string().max(500).optional(),
  parentCallId:z.string().max(300).optional(),
  agentId:z.string().min(1).max(240),
  toolName:z.string().min(1).max(300),
  operation:z.string().min(1).max(300),
  target:z.string().max(1500).optional(),
  normalizedArgumentsDigest:DigestSchema,
  semanticEffect:SemanticEffectSchema,
  retryOrdinal:z.number().int().min(0).max(1000).default(0),
  concurrencyGroup:z.string().max(300).optional(),
  occurredAt:z.string().datetime(),
  metadataDigest:DigestSchema.optional()
}).strict();
export type FrameworkToolCall=z.infer<typeof FrameworkToolCallSchema>;

export const FrameworkBindingSchema=z.object({
  id:z.string().uuid(),
  version:z.literal(1),
  frameworkCallId:z.string().min(1).max(300),
  frameworkCallDigest:DigestSchema,
  framework:AgentFrameworkSchema,
  agentTaskId:z.string().uuid(),
  intentId:z.string().uuid(),
  effectKey:DigestSchema,
  adapterManifestId:z.string().min(1).max(240),
  mode:FrameworkExecutionModeSchema,
  boundAt:z.string().datetime(),
  status:z.enum(["BOUND","ROUTED","SETTLED","INVALIDATED"]),
  executionTicketId:z.string().uuid().optional(),
  operationMandateId:z.string().uuid().optional(),
  settlement:z.enum(["PROVEN","DISPROVEN","UNKNOWN"]).optional(),
  bindingDigest:DigestSchema
}).strict();
export type FrameworkBinding=z.infer<typeof FrameworkBindingSchema>;

export const FrameworkTelemetryEnvelopeSchema=z.object({
  version:z.literal(1),
  framework:AgentFrameworkSchema,
  frameworkRunId:z.string().min(1).max(500),
  frameworkCallId:z.string().max(300).optional(),
  cieavTaskId:z.string().uuid().optional(),
  cieavIntentId:z.string().uuid().optional(),
  traceId:z.string().max(300).optional(),
  spanId:z.string().max(300).optional(),
  phase:z.enum(["PROPOSE","AUTHORIZE","COMMIT","ROUTE","EXECUTE","OBSERVE","SETTLE","RECOVER"]),
  outcome:z.enum(["PASS","ASK","BLOCK","ERROR","PROVEN","DISPROVEN","UNKNOWN"]),
  summary:z.string().min(1).max(1200),
  detailsDigest:DigestSchema,
  redactionApplied:z.literal(true),
  createdAt:z.string().datetime()
}).strict();
export type FrameworkTelemetryEnvelope=z.infer<typeof FrameworkTelemetryEnvelopeSchema>;
