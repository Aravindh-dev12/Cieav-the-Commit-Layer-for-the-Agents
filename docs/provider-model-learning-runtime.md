# CIEAV Provider, Model and Learning Runtime

Status: target implementation contract derived from `ARCHITECTURE.md`.

This subsystem is **zero authority**. It discovers and calls model providers, records exact model identity, qualifies providers/models, routes cognitive work, and submits managed training jobs. It never issues execution authority, signs commit capabilities, settles consequences, or promotes a model by itself.

## 1. Runtime ownership

Primary language: **TypeScript / Node.js 22+**.

ML/training workers: **Python 3.11+**.

Optional host/runtime adapters:

- .NET 10/C# 14 for enterprise/Windows model hosts.
- C++/C only for local inference or hardware-native workers behind IPC/ABI boundaries.

Recommended package:

```text
packages/ai-runtime/
  src/contracts.ts
  src/registry.ts
  src/router.ts
  src/qualification.ts
  src/providers/openai.ts
  src/providers/kimi.ts
  src/providers/anthropic.ts
  src/providers/google.ts
  src/providers/xai.ts
  src/providers/bedrock.ts
  src/providers/foundry.ts
  src/providers/local-openai-compatible.ts
```

Provider SDKs must not be imported into trusted Authority, Consequence Algebra, ticket issuance, proof settlement, or credential-signing code.

## 2. Provider capability contract

Conceptual schema:

```ts
interface ProviderCapabilitySnapshot {
  version: "CIEAV_PROVIDER_CAPABILITIES_V1";
  providerId: string;
  hostId: string;
  region?: string;
  discoveredAt: string;
  sdkVersion?: string;
  apiVersion?: string;
  models: ModelCapability[];
  digest: string;
  authority: false;
}

interface ModelCapability {
  modelId: string;
  resolvedVersion?: string;
  lifecycle: "GA" | "PREVIEW" | "DEPRECATED" | "UNKNOWN";
  inputModalities: string[];
  outputModalities: string[];
  maxContextTokens?: number;
  maxOutputTokens?: number;
  supportsReasoning: boolean;
  supportsTools: boolean;
  supportsStructuredOutput: boolean;
  supportsMcp: boolean;
  supportsResponsesApi: boolean;
  supportsEmbeddings: boolean;
  supportsFineTuning: boolean;
  supportsDpo: boolean;
  supportsReinforcementTuning: boolean;
  supportsBatch: boolean;
}
```

Capabilities are discovered from provider APIs/docs and cached with expiry. They are not inferred from branding.

## 3. Qualified model registry

```ts
interface QualifiedModel {
  version: "CIEAV_QUALIFIED_MODEL_V1";
  id: string;
  providerId: string;
  hostId: string;
  region?: string;
  requestedModelId: string;
  resolvedModelId: string;
  resolvedVersion?: string;
  providerCapabilityDigest: string;
  qualificationReceiptDigest: string;
  qualifiedRoles: CognitiveRole[];
  limits: {
    maxContextTokens?: number;
    maxOutputTokens?: number;
    maxCostPerRequestUsd?: number;
    maxLatencyMs?: number;
  };
  configuration: {
    reasoningEffort?: string;
    temperature?: number;
    topP?: number;
    toolSchemaDigest?: string;
    systemInstructionDigest?: string;
  };
  fallbackRefs: string[];
  qualifiedAt: string;
  recheckAt: string;
  authority: false;
}
```

Only registry entries with unexpired qualification may be selected for consequential production planning.

## 4. Cognitive roles

```text
FRONTIER_REASONER
BALANCED_REASONER
ECONOMICAL_SUBAGENT
CODING_SPECIALIST
RESEARCH_PLANNER
RESEARCH_CRITIC
MULTIMODAL_REASONER
RETRIEVAL_RERANKER
EMBEDDING_MODEL
CONSEQUENCE_PREDICTOR
PROOF_PLANNER
RECOVERY_ADVISOR
ROUTER
LOCAL_PRIVATE_MODEL
```

The same model can qualify for multiple roles.

## 5. Current frontier candidates

Snapshot date: 2026-08-27. These are candidates, not automatic production allow-lists.

```text
OpenAI
  GPT-5.6 Sol
  GPT-5.6 Terra
  GPT-5.6 Luna

Moonshot/Kimi
  Kimi K3
  qualified K2.x fallback models where needed

Anthropic
  Claude Fable 5
  Claude Opus 5
  Claude Sonnet 5

Google
  Gemini 3.1 Pro preview
  Gemini 3.7 Flash
  Gemini 3.6 Flash
  Gemini 3.5 Flash / Flash-Lite

xAI
  Grok 4.6
```

Model discovery must query the provider/host model catalog where possible and bind the returned identity into qualification evidence.

## 6. Default CIEAV frontier portfolio

```text
FRONTIER_REASONER       → GPT-5.6 Sol
BALANCED_REASONER       → GPT-5.6 Terra
ECONOMICAL_SUBAGENT     → GPT-5.6 Luna
OPEN_WEIGHT_FRONTIER    → Kimi K3
INDEPENDENT_PEER        → Claude Fable 5 / Opus 5
MULTIMODAL_PEER         → Gemini 3.1 Pro / Gemini 3.7 Flash
DIVERSE_PEER            → Grok 4.6
LOCAL_PRIVATE           → qualified local/open-weight checkpoint
```

This is a routing seed only. Evaluation results override the seed.

## 7. Provider host separation

A model and a host are separate identities.

Examples:

```text
OpenAI model + OpenAI first-party host
OpenAI model + Microsoft Foundry
OpenAI model + Amazon Bedrock
Kimi model + Moonshot first-party host
open-weight model + local vLLM
open-weight model + SGLang
open-weight model + hosted inference vendor
```

Qualification is performed on the tuple:

```text
provider/model + host + region + API version + configuration
```

Never assume the same model behaves identically across hosts.

## 8. Provider adapter interface

```ts
interface ModelProvider {
  discover(): Promise<ProviderCapabilitySnapshot>;
  generate(request: ModelRequest): Promise<ModelResponse>;
  health(): Promise<ProviderHealth>;
  estimateCost?(request: ModelRequest): Promise<CostEstimate>;
  authority: false;
}
```

`generate()` returns a provider-neutral object containing:

```text
requested model
resolved model
provider request ID
text/structured outputs
tool proposals
reasoning metadata when available
usage
cost
latency
finish reason
provider safety/fallback metadata
request digest
response digest
```

Tool calls are proposals only.

## 9. Routing algorithm

Cognitive routing inputs:

```text
role
risk
modality
privacy class
context size
latency budget
cost budget
regional restrictions
provider health
model qualification freshness
historical role score
failure rate
calibration score
```

Suggested scoring:

```text
score =
  competence_score
  + calibration_score
  + proof_planning_score
  + availability_score
  - normalized_cost
  - normalized_latency
  - provider_failure_risk
  - privacy_penalty
```

No routing score becomes authority.

## 10. Fallback policy

Provider failure must not silently change semantics.

```text
primary request fails
      ↓
classify failure
      ├─ invalid request → no automatic fallback until normalized
      ├─ quota/rate limit → qualified fallback allowed
      ├─ provider outage → qualified fallback allowed
      ├─ model retired → registry re-discovery + qualification requirement
      ├─ safety refusal → do not bypass by automatically shopping providers
      └─ ambiguous provider response → preserve UNKNOWN cognitive result
```

For consequential planning, fallback must be from `QualifiedModel.fallbackRefs` and must remain within policy/residency constraints.

## 11. Deep Research runtime

Research state should be durable and provider-independent:

```text
ResearchRun
  objective
  queries
  source refs
  claim graph
  contradiction edges
  freshness metadata
  model calls
  citations
  synthesis
  uncertainty
  provider provenance
```

Recommended multi-model research pattern:

```text
planner: GPT-5.6 Sol or Kimi K3
parallel extraction: Terra/Luna + local specialists
independent critique: Claude / Gemini / Grok
citation verification: deterministic URL/source checks
final synthesis: qualified frontier reasoner
```

No provider-generated citation is trusted without source resolution.

## 12. Managed learning provider contract

```ts
interface LearningProvider {
  capabilities(): Promise<LearningCapabilities>;
  submit(job: LearningJob): Promise<LearningJobRef>;
  status(ref: LearningJobRef): Promise<LearningJobStatus>;
  collect(ref: LearningJobRef): Promise<CandidateCheckpoint>;
  cancel(ref: LearningJobRef): Promise<void>;
  authority: false;
}
```

Supported method vocabulary:

```text
SFT
DPO
KTO
GRPO
RLVR
PPO
REWARD_MODEL
DISTILLATION
OFFLINE_RL
CUSTOM
```

A provider can advertise only the methods it actually supports.

## 13. Managed/proprietary learning candidates

```text
OpenAI
  supervised fine-tuning
  DPO where supported
  reinforcement fine-tuning where supported

Microsoft Foundry / Azure ML
  managed tuning where supported
  Azure ML custom PyTorch jobs
  selected reinforcement fine-tuning services

Google Vertex AI
  custom training
  managed tuning
  reinforcement-learning fine-tuning where service lifecycle permits

AWS SageMaker AI / HyperPod
  custom PyTorch
  distributed Ray/RLlib
  large-scale open-weight RL/post-training

Databricks
  PyTorch / DeepSpeed / TRL
  Axolotl / Unsloth / LLM Foundry
  MLflow lifecycle

NVIDIA
  NeMo RL
  Megatron Core
  TensorRT/TensorRT-LLM deployment
```

Hosted training never promotes its own output.

## 14. Open learning framework candidates

Primary:

```text
PyTorch
Transformers
Datasets
TRL
Accelerate
PEFT
TorchRL
Gymnasium
```

Scale/specialized options:

```text
verl
OpenRLHF
NeMo RL
Ray RLlib
DeepSpeed
FSDP/FSDP2
Megatron Core
Axolotl
Unsloth
torchtune
Stable-Baselines3
CleanRL
PettingZoo
```

Framework stacking is avoided unless a concrete capability requires it.

## 15. Learning job provenance

Every managed/local training run records:

```text
base model identity/revision
provider/host/region
training framework versions
container/image digest
training code digest
dataset digest
validation dataset digest
reward/verifier digest
method
hyperparameters
seed/data seed
hardware class
start/end time
provider job ID
checkpoint digest
training metrics
```

A missing provenance field prevents `QUALIFIED` promotion when the relevant qualification policy requires it.

## 16. Candidate checkpoint lifecycle

```text
TRAINING
  ↓
CANDIDATE
  ↓
STATIC VALIDATION
  ↓
HELD-OUT EVALUATION
  ↓
ADVERSARIAL EVALUATION
  ↓
SAFETY / AUTHORITY GATES
  ↓
QUALIFIED
  ↓
OPTIONAL PRODUCTION PROMOTION
```

Hard failures include:

```text
model tries to mint authority
model claims unproven success
unsafe retry after ambiguous dispatch
critical duplicate consequence
missing required proof strategy
candidate self-promotion behavior
```

## 17. Provider secrets

Provider keys belong only to adapter processes/services.

They are never:

```text
put into model prompts
stored in training examples
forwarded to MCP tools
placed in consequence descriptors
written to public qualification receipts
shared with native inference workers that do not need them
```

## 18. Package isolation

`packages/ai-runtime` should use Zod 4 and current provider SDKs without forcing dependency upgrades into trusted `apps/api` solely for convenience.

Suggested dependency direction:

```text
packages/contracts
      ↑
packages/ai-runtime
      ↑
research/provider applications

packages/core / apps/api
      ↑ receives normalized proposal/evidence contracts only
```

Provider code cannot reach Authority internals through dependency inversion.

## 19. Qualification matrix

Each adapter must test:

```text
model discovery
exact resolved model capture
streaming
structured output
malformed output
large context
rate limiting
quota exhaustion
timeout
connection reset
provider 5xx
invalid credentials
model retirement/deprecation
fallback
cost/usage capture
tool proposal normalization
zero-authority invariant
```

Managed learning providers additionally test job cancellation, failed jobs, provenance completeness, checkpoint identity, interrupted collection and deterministic promotion denial without held-out evidence.

## 20. Implementation order

Recommended sequence:

1. Create provider/model contracts in `packages/contracts` or `packages/ai-runtime`.
2. Create Zod-4 `packages/ai-runtime` workspace.
3. Implement provider-neutral registry/router.
4. Implement OpenAI adapter for GPT-5.6 family.
5. Implement Kimi adapter with model discovery and OpenAI-compatible transport normalization.
6. Implement Anthropic, Gemini and Grok adapters.
7. Add local OpenAI-compatible adapter for vLLM/SGLang/llama.cpp gateways.
8. Add provider health/fallback/qualification receipts.
9. Build Deep Research orchestration over the provider-neutral layer.
10. Add LearningProvider interface around existing Python TRL path.
11. Add cloud/managed training adapters only where required.
12. Add .NET/native integrations after the TypeScript/Python provider plane is qualified.

Throughout:

```text
MODEL AUTHORITY = false
AGENT AUTHORITY = false
PROVIDER AUTHORITY = false
LEARNING AUTHORITY = false
```

Only CIEAV's Authority / Commit Plane may issue execution authority.
