# CIEAV Architecture

## Consequence Intelligence Framework and Autonomous Computing Substrate

> **Models think. Agents plan. CIEAV commits.**
>
> **CIEAV turns intelligence into provable, governable, and learnable state transitions in the real world.**

This is the canonical target architecture for CIEAV.

Research/provider snapshot: **2026-08-27**. Model catalogs, model IDs, preview status, pricing, regions, SDKs and managed-training features change faster than this architecture. CIEAV must discover, pin, qualify and record exact provider/model/framework versions at deployment time. Names in this document are routing recommendations, not permanent protocol constants.

A component appearing here is **not automatically implemented or production-qualified**. Production claims require the executable and external qualification evidence described below.

---

## 1. Product thesis

CIEAV is not a chatbot, a single foundation model, a browser wrapper, an agent framework, a model router, a workflow scheduler, an AI Foundry clone, or an ML platform.

CIEAV is the **Commit Layer for autonomous computing**: a model- and agent-independent consequence-native runtime that converts probabilistic machine intention into governed, observable, durable and learnable changes in reality.

The fundamental transaction is not a token, prompt, tool call, workflow step or agent handoff. It is a **real-world state transition**:

```text
WORLD BEFORE
    +
objective / intent
    +
principal / user identity
    +
agent + model identity
    +
delegated authority
    +
exact proposed operation
    +
current reality
    +
policy
    ↓
CONSEQUENCE ALGEBRA
    ↓
REALITY-BOUND COMMIT
    ↓
ONE-USE EXECUTION AUTHORITY
    ↓
REAL EXECUTION
    ↓
INDEPENDENT PERCEPTION / PROOF
    ↓
WORLD AFTER
    ↓
SUCCESS / FAILURE / UNKNOWN
```

Frontier APIs, open-weight models, local models, coding models, multimodal models, enterprise agents and CIEAV-trained checkpoints are replaceable cognitive engines inside this larger transaction boundary.

---

## 2. Constitutional invariants

These are architectural invariants, not preferences.

1. **No model can mint authority.**
2. **No agent can mint authority.**
3. **No MCP server/client can mint authority.**
4. **No model provider SDK can mint authority.**
5. **No reward model, learned policy, router, planner, critic or scheduler can mint authority.**
6. **No Python, C#, C++ or C intelligence/native component gains authority merely because it runs locally.**
7. **No learned checkpoint can promote itself.**
8. **Learning may improve proposals; learning never becomes execution authority.**
9. **`COMMITTED` is not success.** Dispatch and settlement are different facts.
10. **Unknown remains `UNKNOWN`.** Missing proof is never silently converted into success.
11. **Exact authority is bound to exact execution.** Broad intent is not a capability.
12. **Execution authority is scoped, short-lived and preferably one-use.**
13. **Reality is checked before and after consequential execution when semantics require it.**
14. **Recovery, compensation and undo are new governed consequences, not privileged bypasses.**
15. **Training data is provenance-bearing and authority-free.**
16. **Production promotion is deterministic and external to model/training code.**
17. **Human approval never implies hidden auto-approval.**
18. **Native acceleration never bypasses policy, Algebra, proof or settlement.**
19. **Provider compatibility does not imply semantic or security equivalence.**
20. **Only the Authority / Commit Plane may issue execution authority.**

Critical dependency direction:

```text
cieav.intelligence / cieav.learning / native providers
                  │
                  │ proposals / observations / evidence
                  ▼
          cieav.consequence-algebra
                  │
                  │ admission constraint
                  ▼
             cieav.authority
                  │
                  │ scoped capability
                  ▼
             cieav.execution
                  │
                  ▼
               reality
                  │
                  ▼
              cieav.proof
```

Never:

```text
model / agent / RL policy / native worker
        ──► signer / permit minting / credential issuance / promotion authority
```

---

## 3. User experience: installed, not opened

The normal product is ambient infrastructure.

```text
install CIEAV once
      ↓
starts with the operating system
      ↓
runs as a background substrate
      ↓
AI / agents / automations work normally
      ↓
CIEAV appears only when authority,
uncertainty, failure, recovery or policy requires attention
```

Developer and forensic surfaces may exist as authenticated commands, receipts, logs and diagnostics. They are not authority.

---

## 4. Top-level planes

```text
╔══════════════════════════════════════════════════════════════════════╗
║                              CIEAV                                  ║
║                    Autonomous Commit Substrate                      ║
╠══════════════════════════════════════════════════════════════════════╣
║ INTELLIGENCE PLANE                                                   ║
║ provider APIs · local/open models · CIEAV models · research         ║
║ Intelligence State · Epistemic State · Cognitive Scheduler          ║
╠══════════════════════════════════════════════════════════════════════╣
║ AGENT / INTEROP PLANE                                                ║
║ CIEAV Agent Kernel · MCP · A2A · provider agents · enterprise agents║
╠══════════════════════════════════════════════════════════════════════╣
║ CONSEQUENCE COMPILER                                                 ║
║ objective → typed consequence program · exact proposal              ║
╠══════════════════════════════════════════════════════════════════════╣
║ CONSEQUENCE ALGEBRA                                                  ║
║ semantic identity · relations · invariants · reservations            ║
║ proofability · causal fences · anti-fragmentation · UNKNOWN barrier ║
╠══════════════════════════════════════════════════════════════════════╣
║ AUTHORITY / COMMIT PLANE                                             ║
║ identity · delegation · policy · credential lease · reality witness ║
║ Reality-Bound Commit · one-use execution ticket                     ║
╠══════════════════════════════════════════════════════════════════════╣
║ EXECUTION PLANE                                                      ║
║ browser · HTTP · MCP · A2A · cloud · DB · filesystem · Git · native ║
║ Windows/.NET · ROS2/C++ · embedded/C                                ║
╠══════════════════════════════════════════════════════════════════════╣
║ PERCEPTION / PROOF PLANE                                             ║
║ API · browser · DB · filesystem · cloud · sensor · hardware evidence║
║ SUCCESS · FAILURE · UNKNOWN                                          ║
╠══════════════════════════════════════════════════════════════════════╣
║ LEARNING PLANE                                                       ║
║ SFT · DPO · KTO · GRPO/RLVR · offline RL · critics · distillation  ║
╠══════════════════════════════════════════════════════════════════════╣
║ QUALIFICATION / PROMOTION PLANE                                      ║
║ held-out eval · adversarial tests · deterministic hard gates         ║
╚══════════════════════════════════════════════════════════════════════╝
```

Authority is not transitive across planes.

---

## 5. Five-language architecture

CIEAV deliberately uses five languages with **non-overlapping primary ownership**. This is not permission to reimplement the trust kernel five times.

| Language/runtime | Primary ownership | Target baseline |
| --- | --- | --- |
| **TypeScript / Node.js** | canonical online contracts, Agent Kernel, MCP/A2A, API, Consequence Algebra integration, Authority/Execution orchestration, deep research and provider adapters | Node.js 22+, TypeScript 5.x |
| **Python** | datasets, PyTorch ML, SFT/DPO/KTO/GRPO/RLVR, offline/general RL, evals, learned retrieval/reranking, experiment orchestration and model-serving processes | Python 3.11+ |
| **C# / .NET** | Windows-native services/hosts, Microsoft/Azure/enterprise adapters, .NET MCP/agent integrations, portable .NET inference | .NET 10 LTS, C# 14 |
| **C++** | native/GPU inference, robotics/ROS2, vision/audio, high-rate sensor/device adapters, performance-critical kernels | C++20 baseline |
| **C** | stable ABI, FFI, embedded/MCU/driver boundary and minimal native portability layer | C17 baseline |

### 5.1 Why TypeScript stays canonical for trusted online logic

The repository already places contracts, core deterministic logic, API, Agent Kernel, MCP/A2A and Consequence Algebra in TypeScript/Node. Rewriting qualified authority/consequence logic merely for language symmetry would increase attack surface and semantic drift.

### 5.2 Why Python owns training

Modern ML/RL research and production tooling remains Python-first. CIEAV's local training entrypoint already uses Python for SFT, DPO, KTO, GRPO and RLVR while a zero-authority Node verifier owns canonical scoring semantics.

### 5.3 Why .NET exists

.NET is a first-class enterprise/Windows integration runtime, not a second Authority implementation. Use it for Windows services, Microsoft identity/cloud integrations, enterprise agents, MCP and portable inference.

### 5.4 Why C++ exists

Use C++ only where native performance/hardware matters: inference, GPU runtimes, robotics, vision/audio and high-rate devices. Complex C++ workers should normally be isolated behind authenticated local IPC.

### 5.5 Why C is the ABI waist

C is the narrow cross-runtime native ABI. Export C++ functionality through a versioned `extern "C"` interface instead of coupling Node, Python and .NET to a C++ ABI.

Target:

```text
TypeScript/Node ── Node-API / IPC ──┐
Python          ── C ABI / IPC ─────┼── CIEAV Native ABI ── C++ implementation
.NET            ── LibraryImport ───┤                       └─ C/embedded
                                     └──────────────────────── hardware
```

No C ABI call creates CIEAV authority.

---

## 6. Intelligence State and Epistemic State

A reasoning episode operates over explicit state, not merely chat history.

```text
IntelligenceState {
    objective
    epistemic_state
    current_reality
    available_models
    model_competence_profiles
    available_agents
    available_tools
    available_skills
    available_proof_providers
    authority_envelope
    credential_constraints
    active_hypotheses
    uncertainty
    consequence_graph_context
    candidate_plans
    proof_obligations
    recovery_requirements
    privacy_constraints
    compute_budget
    latency_budget
    cost_budget
    risk_budget
}
```

Claims carry provenance, freshness and contradiction state:

```text
EpistemicClaim {
    claim
    scope
    supporting_evidence[]
    contradicting_evidence[]
    observed_at
    reality_version
    confidence
    freshness
    invalidation_conditions[]
    status: SUPPORTED | CONTRADICTED | STALE | UNKNOWN
}
```

A model call mutates cognitive state. Observation mutates epistemic state. Only authorized execution may mutate reality.

---

## 7. Cognitive Scheduler

The scheduler chooses a computation strategy, not just a model brand.

It may select:

```text
one model
parallel independent models
sequential critique
local/private model
frontier reasoning model
specialist coding/vision/audio model
retrieval
simulation
proof provider
Verified Skill
managed deep-research agent
human escalation
stop because evidence is insufficient
```

Routing inputs include capability, risk, privacy, latency, cost, modality, proofability, historical calibration and known consequence semantics.

The scheduler has `authority = false`.

---

## 8. Provider and model adapter architecture

All provider-specific code lives behind CIEAV-owned contracts.

```text
provider SDK / API
       ↓
CIEAV ModelProvider / AgentProvider adapter
       ↓
normalized model response / agent proposal
       ↓
CIEAV-owned schemas
       ↓
Consequence Compiler
```

Provider SDKs must not be imported into Consequence Algebra, Authority, ticket issuance, proof settlement or trusted stores.

A provider adapter records at least:

```text
provider
model_id
model_version/snapshot when available
endpoint class
region when relevant
request digest
response digest
usage/cost metadata
latency
capability flags
provider request/correlation ID
SDK/API version
```

---

## 9. Current frontier/API model routing snapshot

These are **2026-08-27 routing candidates**, not permanent allow-lists.

### 9.1 OpenAI

Current API tiers include:

```text
GPT-5.6 Sol   → gpt-5.6-sol / gpt-5.6
GPT-5.6 Terra → gpt-5.6-terra
GPT-5.6 Luna  → gpt-5.6-luna
```

Recommended CIEAV roles:

```text
Sol   → hardest reasoning, coding, agentic/deep-research synthesis
Terra → balanced production reasoning/cost
Luna  → high-volume extraction, routing and lower-cost tasks
```

Prefer the OpenAI **Responses API** for tool/reasoning/agent workflows. OpenAI Agents SDK may be used only in the zero-authority intelligence plane.

### 9.2 Moonshot AI / Kimi

**Kimi K3** is a strong CIEAV candidate both as hosted API and open-weight/local deployment:

```text
model: kimi-k3
native multimodal
open weights
1M context
MoE: 2.8T total / 104B active
long-horizon coding / knowledge work / agentic research
```

Kimi exposes OpenAI/Anthropic-compatible API interfaces. Compatibility is only transport convenience. CIEAV must normalize Kimi-specific reasoning/tool-history semantics and qualify it independently.

For local K3 deployment, vLLM/SGLang are candidate serving paths when the exact model release and hardware are qualified.

### 9.3 Anthropic

Support the current Claude family through the official Anthropic API/SDK. Model aliases and snapshots must be discovered and pinned at deployment because Anthropic's catalog evolves quickly.

Recommended use:

```text
highest Claude tier → difficult reasoning / long-running agents / research
balanced Claude tier → coding / agentic production workloads
fast Claude tier    → extraction / classification / lower-latency work
```

Claude output remains a proposal.

### 9.4 Google Gemini

Current candidates include:

```text
Gemini 3.7 Flash
Gemini 3.1 Pro preview
Gemini Deep Research / Deep Research Max preview
Gemini Robotics ER 2 preview
```

GA models may be production candidates after CIEAV qualification. Preview models/services require explicit fallback, deprecation monitoring and exact-version qualification.

### 9.5 Additional provider adapters

CIEAV should support replaceable adapters where product needs justify them, including:

```text
Microsoft Foundry / Azure-hosted models
AWS Bedrock model providers
Mistral API
xAI API
Cohere
Together AI
Fireworks AI
Groq
Cerebras
Hugging Face hosted endpoints
qualified local OpenAI-compatible servers
```

These names identify integration classes, not automatic trust or endorsement. Exact models are selected by evaluation and availability at deployment time.

---

## 10. Deep Research subsystem

Deep Research is a CIEAV cognitive program, not a direct execution mode.

```text
research objective
      ↓
query/task decomposition
      ↓
parallel web / MCP / retrieval / repository workers
      ↓
source ingestion
      ↓
claim-evidence graph
      ↓
freshness + contradiction analysis
      ↓
source-quality scoring
      ↓
cross-model critique when useful
      ↓
citation construction
      ↓
synthesis
      ↓
research result
      ↓
optional consequential proposal
      ↓
Consequence Compiler / Algebra / Authority
```

### 10.1 Research providers

CIEAV may use:

```text
OpenAI reasoning/tool workflows
Kimi K3 and Kimi research capabilities
Gemini Deep Research / Deep Research Max
Claude research/tool workflows
local/open-weight research workers
specialist search/retrieval services
```

Managed research output is an **evidence candidate**, not authoritative truth. Preserve source URLs/IDs, dates, extracted claims, contradictions and provider provenance.

### 10.2 Language ownership

TypeScript orchestrates research state, provider routing, MCP, citations and evidence graphs. Python supplies learned retrieval, embeddings, rerankers, classifiers and experimental multimodal processing where useful.

---

## 11. MCP and agent architecture

### 11.1 MCP

Primary implementation is the official MCP TypeScript SDK v2. Use:

```text
Streamable HTTP → remote production integrations
stdio           → qualified local child processes
```

C# and Python MCP SDKs may be used for .NET and ML integrations. C/C++ should normally expose native/process interfaces rather than creating an additional MCP implementation.

Every MCP tool call capable of a consequence becomes a typed CIEAV proposal before authority.

### 11.2 Agent frameworks

CIEAV Agent Kernel is the canonical orchestration/state boundary. Optional zero-authority adapters include:

```text
OpenAI Agents SDK
Google Agent Development Kit
Microsoft Agent Framework
LangGraph
provider-managed agent runtimes
custom enterprise agents
```

A third-party agent framework may schedule, reason and propose. It may not settle, authorize or mint tickets.

---

## 12. CIEAV model family

CIEAV builds logical roles rather than one monolithic model:

- **Router** — selects computation strategy and providers.
- **Core Reasoner** — objective decomposition and consequence-aware planning.
- **Consequence Model** — predicts possible world transitions and uncertainty.
- **Proof Planner** — proposes witness strategies.
- **Authority Advisor** — proposes minimum likely permissions only.
- **Recovery Model** — proposes reconciliation/compensation/recovery.
- **Critic / Reward Models** — score trajectories for training.
- **Skill Compiler** — proposes deterministic skill candidates.

None has authority.

---

## 13. Consequence Program and Compiler

A Consequence Program expresses the intended real transition, not just tool syntax.

```text
ConsequenceProgram {
    objective
    expected_world_change
    preconditions
    authority_requirements
    candidate_execution_paths
    proof_obligations
    recovery_semantics
    uncertainty_policy
    duplicate/idempotency_policy
}
```

The compiler transforms probabilistic planning into deterministic typed material suitable for Algebra and Authority:

```text
objective
   ↓
agent/model plan
   ↓
Consequence Compiler
   ↓
canonical resource identity
exact operation + normalized arguments
expected semantic effect
preconditions
proof obligations
recovery semantics
risk / reversibility
   ↓
Consequence Algebra
```

---

## 14. Consequence Algebra

The Consequence Algebra answers:

> When multiple agents, models, tools, protocols or devices may act on the same reality, are their proposed consequences equivalent, composable, conflicting, causally dependent, invalidating, compensating, superseding or cumulatively dangerous before authority is issued?

Primary primitives:

```text
Canonical Reality Address
Consequence Footprint
Semantic Effect Identity
Relation Algebra
Invariant Compatibility Witness
Active Consequence Graph
Consequence Reservation
Proof Plan Reservation
Causal Reality Fence
Semantic idempotency / reconciliation
Cumulative anti-fragmentation policy
UNKNOWN quarantine
```

Relation vocabulary:

```text
EQUIVALENT
INDEPENDENT
COMMUTES
CONFLICTS
REQUIRES
INVALIDATES
SUPERSEDES
COMPENSATES
AGGREGATES_WITH
UNKNOWN_RELATION
```

Algebra decisions constrain authority but never create it:

```text
ADMIT       → may continue to Authority
BLOCK       → do not continue
COORDINATE  → resolve relation/invariant first
RECONCILE   → do not redispatch equivalent unsettled consequence
```

The Algebra must fail closed where configured, persist active/unsettled state, preserve UNKNOWN, enforce proofability for protected consequences and recover integrity on startup.

---

## 15. Authority / Commit Plane

Target inputs:

```text
principal identity
agent identity
model/checkpoint identity
delegated authority
credential lease
permission graph
exact operation
exact arguments/resource scope
fresh reality witness
Algebra admission/reservation
policy
risk
reversibility
proof obligation
```

Output:

```text
Reality-Bound Commit
        ↓
short-lived / one-use Execution Ticket
```

The ticket authorizes only its exact bound consequence.

---

## 16. Durable consequence lifecycle

```text
PROPOSED
   ↓
ANALYZED / ALGEBRA-ADMITTED
   ↓
AUTHORIZED
   ↓
COMMITTED
   ↓
DISPATCHED
   ↓
OBSERVING
   ↓
┌───────────────┬───────────────┬───────────────┐
SETTLED_SUCCESS SETTLED_FAILURE SETTLED_UNKNOWN
                                  │
                                  ▼
                         QUARANTINE / RECONCILE
```

Retry semantics are consequence-specific. Ambiguous non-idempotent operations reconcile before retry.

---

## 17. Execution Fabric

Execution providers may include:

```text
browser / CDP
HTTP / REST / gRPC
MCP / A2A
filesystem
Git / code
cloud / infrastructure
SaaS / enterprise systems
database
Windows/.NET native services
C++ robotics / ROS2
C / embedded devices
```

Execution adapters should implement, where possible:

```text
operation identity
argument canonicalization
credential scope
idempotency semantics
precondition check
ticket consumption
execution correlation ID
post-state witness hooks
recovery hooks
```

No adapter bypasses ticket consumption because it is “native” or “local.”

---

## 18. Native / .NET / physical execution

### 18.1 .NET 10 LTS / C# 14

Use .NET for:

```text
Windows service/host
native notification/approval surfaces
Microsoft identity/Azure enterprise integration
C# MCP adapters
Microsoft Agent Framework / Microsoft.Extensions.AI adapters
ONNX Runtime .NET inference
ML.NET conventional local models when appropriate
```

Do not create a parallel .NET Authority/Algebra implementation without a dedicated equivalence/qualification project.

### 18.2 C++

Use C++ for:

```text
ONNX Runtime native inference
NVIDIA TensorRT inference
llama.cpp/ggml local inference
ROS2 rclcpp robotics
computer vision/audio
high-rate sensor processing
native hardware SDKs
```

Complex C++ components should normally run as isolated workers. Crashing an inference worker must not corrupt Authority, reservation, ticket or proof state.

### 18.3 C / embedded

Target versioned native ABI:

```text
native/include/cieav_native.h
```

Use C for stable ABI, constrained embedded devices, driver-facing shims and small portability surfaces. Define explicit struct versions, sizes, ownership and error contracts.

Embedded physical executors receive attenuated capabilities and emit evidence; they do not contain AI-derived authority.

---

## 19. Perception and Proof Plane

Evidence sources include:

```text
browser/runtime
DOM/app state
network/API
database
filesystem
Git
cloud control plane
metrics/logs
Windows/native state
ROS2/sensor observations
hardware attestation
external proof providers
```

Settlement is deterministic where the proof contract allows it:

```text
SUCCESS
FAILURE
UNKNOWN
```

UNKNOWN is epistemic debt, not an error to hide.

---

## 20. Authorized Outcome Trajectory

The strategic learning object binds authority and reality:

```text
WHO requested
WHICH agent/model participated
WHAT authority existed
WHAT exact consequence was proposed
WHAT reality existed before
WHICH Algebra/Policy decisions applied
WHICH commit/ticket was consumed
WHAT actually executed
WHAT evidence was observed
WHAT world existed afterward
SUCCESS / FAILURE / UNKNOWN
WHAT recovery/reconciliation occurred
```

A receipt proving outcome is useful evidence but does not automatically imply the full authority-grade trajectory. Missing bindings must never be inferred.

---

## 21. Learning Plane

Learning is offline from production authority:

```text
FINALIZED VERIFIED EVIDENCE
        ↓
provenance / consent / redaction
        ↓
Authorized Outcome Trajectories
        ↓
SFT / DPO / KTO / reward models / GRPO-RLVR / offline RL / distillation
        ↓
CANDIDATE CHECKPOINT
        ↓
held-out deterministic qualification
        ↓
QUALIFIED CHECKPOINT

MODEL AUTHORITY = 0
```

Production is not an online RL exploration environment.

---

## 22. Open ML / RL framework stack

### 22.1 Core ML

```text
PyTorch
Hugging Face Transformers
Hugging Face Datasets
Accelerate
PEFT / LoRA / QLoRA
scikit-learn
JAX when specifically justified
```

### 22.2 LLM post-training

```text
TRL
SFT
DPO
KTO / preference objectives
GRPO
RLVR
reward / critic models
process rewards
distillation
```

CIEAV's existing Python trainer remains the local baseline for SFT/DPO/KTO/GRPO/RLVR.

### 22.3 General/distributed RL

```text
TorchRL             → PyTorch-native general RL
Ray RLlib           → distributed/general/multi-agent RL
verl                → scalable LLM RL/post-training
NVIDIA NeMo RL      → large NVIDIA-oriented LLM/VLM RL
FSDP / FSDP2        → PyTorch distributed sharding
DeepSpeed           → optional distributed optimization
Megatron Core       → very large model parallelism when justified
```

### 22.4 Graph learning

Use PyTorch Geometric or equivalent only when deterministic Consequence Graph semantics and verified data quality justify learned graph models.

---

## 23. Managed / proprietary ML and RL providers

Managed platforms are **Learning Providers**, never Authority Providers.

CIEAV owns:

```text
dataset eligibility
provenance/consent/redaction
reward semantics
verifier semantics
candidate status
held-out qualification
promotion decision
```

The vendor supplies compute/training mechanics.

### 23.1 Microsoft Foundry / Azure ML

Candidate uses:

```text
managed model/agent endpoints
Microsoft Agent Framework integration
supported fine-tuning / reinforcement-tuning products
Azure ML custom PyTorch jobs
enterprise identity/networking/accelerators
```

Exact model/region/account support is qualified at deployment.

### 23.2 Google Vertex AI

Candidate uses:

```text
Gemini tuning where supported
custom PyTorch training
managed accelerators
agent/research services
managed evaluation/deployment
```

Preview tuning/research features require explicit qualification/fallback.

### 23.3 AWS Bedrock / SageMaker AI

Candidate uses:

```text
Bedrock model customization on supported models
reward-function / reinforcement tuning where supported
model distillation where supported
Bedrock AgentCore / managed agent infrastructure
SageMaker custom PyTorch/distributed training
```

### 23.4 Databricks AI Runtime

Use where lakehouse/data governance and managed GPU training fit the deployment. CIEAV still owns qualification, reward semantics and promotion.

### 23.5 NVIDIA commercial stack

```text
NeMo RL
Megatron Core
TensorRT
NIM / DGX / AI Enterprise deployment options
```

These accelerate training/serving; they do not alter CIEAV's authority model.

### 23.6 Other hosted training/serving vendors

Adapters may be added for providers such as Together AI, Fireworks AI, Hugging Face, cloud GPU platforms and future RL/fine-tuning services if they satisfy CIEAV data-governance, versioning, verifier and qualification requirements.

No hosted provider receives CIEAV signing keys, raw long-lived credentials or promotion authority.

---

## 24. Learning Provider interface

Conceptually:

```text
CIEAV Learning Provider
    ├── cieav-local-trl
    ├── cieav-torchrl
    ├── cieav-verl
    ├── cieav-nemo-rl
    ├── cieav-rllib
    ├── cieav-azure
    ├── cieav-vertex
    ├── cieav-bedrock-sagemaker
    ├── cieav-databricks
    └── custom GPU cluster
```

Every provider output remains `CANDIDATE` until deterministic promotion.

---

## 25. Reward semantics

Do not optimize only task success.

```text
R = {
  outcome_correctness,
  proof_completeness,
  uncertainty_calibration,
  authority_minimization,
  privilege_minimization,
  duplicate_consequence_avoidance,
  reversibility,
  recovery_quality,
  policy_compliance,
  cost,
  latency
}
```

Hard penalties include false success, unsafe duplicate consequence, stale-world action, unnecessary irreversible action, missing proof and blind retry after ambiguous dispatch.

Whenever reality is mechanically verifiable, prefer deterministic environment/verifier reward over an LLM judge.

---

## 26. Agentic training environments

Maintain isolated environments such as:

```text
CieavGitEnv
CieavBrowserEnv
CieavCloudEnv
CieavDatabaseEnv
CieavFilesystemEnv
CieavSaaSEnv
CieavPermissionEnv
CieavCredentialEnv
CieavFailureEnv
CieavRecoveryEnv
CieavUnknownOutcomeEnv
CieavStaleRealityEnv
CieavDuplicateExecutionEnv
CieavConsequenceAlgebraEnv
CieavRoboticsSimEnv
```

A production consequence is evidence for offline learning, not an invitation for online exploration.

---

## 27. Inference and serving matrix

Use the runtime that fits deployment:

```text
vLLM        → high-throughput GPU LLM serving
SGLang      → high-performance alternative serving/runtime
ONNX Runtime→ portable CPU/GPU inference across Python/C++/.NET and other bindings
TensorRT    → NVIDIA-specific optimized inference
llama.cpp   → portable/local quantized LLM/VLM inference
provider API→ managed frontier inference
```

A loopback/local model server is still an untrusted intelligence provider.

---

## 28. Consequence Graph and Verified Skills

Verified transitions populate an empirical Consequence Graph with:

```text
preconditions
required authority
success/failure/UNKNOWN frequencies
proof reliability
latency
reversibility
failure modes
recovery behavior
semantic relation patterns
```

Planning ranks paths by success probability, minimum authority, proofability, reversibility, blast radius, cost, latency and uncertainty.

Repeated sufficiently understood behavior can be compiled into candidate deterministic Verified Skills. The Skill Compiler proposes; deterministic qualification installs/promotes.

---

## 29. Qualification and promotion

Every model, skill, provider adapter, native binary and consequential execution path crosses qualification appropriate to its class.

### 29.1 Model metrics

```text
outcome prediction accuracy
false-success rate
UNKNOWN calibration
authority efficiency
privilege minimization
proof quality
recovery correctness
duplicate-consequence risk
reversibility preference
policy violations
tool/operation accuracy
latency / cost
```

Hard gate examples:

```text
model tries to mint authority      → FAIL
candidate self-promotes            → FAIL
critical duplicate action unsafe   → FAIL
critical false-success claim       → FAIL
```

### 29.2 Native/provider qualification

Require exact OS/arch/hardware/provider/model versions, failure injection, timeout/retry behavior, process crash behavior, ABI compatibility, network failure behavior and supply-chain provenance as appropriate.

---

## 30. Security isolation

Recommended dependency direction:

```text
cieav.intelligence
cieav.providers
cieav.research
cieav.learning
native workers
       │
       │ proposal/evidence only
       ▼
cieav.consequence-algebra
       ▼
cieav.authority / cieav.credentials / cieav.commit
       ▼
cieav.execution
       ▼
cieav.proof
```

Training/inference providers must not receive:

```text
commit/permit signing keys
raw reusable credential leases
Gateway admin bearer tokens
promotion signing authority
unrestricted browser/device-control capabilities
```

Complex native inference code should not share memory with Authority unless a measured latency requirement and dedicated audit justify it.

---

## 31. Target package/process layout

```text
packages/
  contracts/               # canonical trusted domain/wire contracts
  core/                    # deterministic core + Consequence Algebra
  ai-runtime/              # TS model/agent/provider adapters, zero authority
  ai-mcp/                  # optional reusable MCP integration helpers
apps/
  api/                     # Agent Kernel / trusted API / Execution Fabric
  mcp/                     # external MCP surface
ml/
  ...                      # Python datasets/evals/training/RL
python/
  cieav_platform/          # Python platform/model/process integrations
dotnet/
  Cieav.Platform/          # target .NET enterprise/Windows host
native/
  include/cieav_native.h   # target versioned C ABI
  cpp/                     # target C++ inference/robotics workers
  c/                       # target C/embedded shims
```

`dotnet/` and `native/` are target architecture until corresponding code and qualification evidence exist.

---

## 32. Current implementation and qualification state

The repository already contains substantial implementation in TypeScript/Node and Python, including:

```text
Agent Kernel
Execution Fabric
MCP/A2A workspaces
Consequence Algebra contracts/core/store/tool integration
proof/settlement machinery
learning dataset/training scaffolding
Python SFT/DPO/KTO/GRPO/RLVR entrypoint
local qualification/release tooling
```

The Consequence Algebra executable subsystem was locally qualified on Windows at commit:

```text
64e9b26f560f7ace2e7abfa5f822e5b29b992643
```

That exact run passed the static gate, API build, contracts/core/API typechecks, 8 core Algebra tests and 17 API/Fabric Algebra tests.

Subsequent architecture/documentation commits do not create a new executable qualification receipt. C#/.NET, C++ and C sections in this document are target architecture until implemented and independently qualified.

---

## 33. Production-readiness definition

A feature is not production-ready because it appears in this document or compiles.

### Deterministic local features

Require unit/integration tests, fail-closed tests, crash/recovery tests, corruption tests and secret-handling checks.

### OS/runtime features

Require real supported OS runners, install/package tests and exact runtime versions.

### Hardware/native features

Require claimed hardware/driver/accelerator paths to be exercised on physical hardware, including ABI/process crash/fault behavior.

### ML/model features

Require dataset provenance, held-out qualification, calibration, adversarial evaluation, regression gates and candidate-until-promoted semantics.

### External-provider features

Require real provider integration, pinned model/API versions, network failure tests, retry/idempotency behavior, quotas/rate-limit handling, privacy/residency review and operational monitoring.

### Release security

Require signing/notarization where applicable, software supply-chain verification and published release metadata.

---

## 34. Privacy and learning governance

Training/research/provider eligibility requires explicit controls for:

```text
provenance
consent / organizational policy
purpose limitation
redaction
secret exclusion
credential removal
retention
jurisdiction/residency
provider data-use terms
human data handling
```

Prefer typed semantic evidence and digests/references over unnecessary raw content or reusable secrets.

---

## 35. Provider philosophy

CIEAV integrates mature specialist systems instead of cloning every model server, GPU scheduler, ML framework, research engine or agent ecosystem.

CIEAV owns the hard boundary:

```text
intention
→ consequence semantics
→ trusted current reality
→ governed authority
→ exact execution
→ independently proven consequence
→ qualified learning
```

Providers own replaceable mechanisms behind explicit contracts.

---

## 36. Complete closed loop

```text
                         OBJECTIVE
                            │
                            ▼
                    INTELLIGENCE STATE
                            │
                            ▼
                   COGNITIVE SCHEDULER
                            │
       ┌────────────────────┼────────────────────┐
       ▼                    ▼                    ▼
 frontier APIs         CIEAV models       Verified Skills
 OpenAI/Kimi/...       local/open ML       deterministic
       │                    │                    │
       └────────────────────┼────────────────────┘
                            ▼
                     CONSEQUENCE PLAN
                            │
                            ▼
                   CONSEQUENCE COMPILER
                            │
                            ▼
                  ╔════════════════════╗
                  ║ CONSEQUENCE ALGEBRA║
                  ╚═════════╤══════════╝
                            │ admission only
                            ▼
                  ╔════════════════════╗
                  ║ AUTHORITY / COMMIT ║
                  ║ identity · policy  ║
                  ║ exact reality-bound║
                  ║ one-use capability ║
                  ╚═════════╤══════════╝
                            │
                            ▼
                     EXECUTION FABRIC
                  ┌─────────┼─────────┐
                  ▼         ▼         ▼
                Node       .NET      C++/C
                  │         │         │
                  └─────────┼─────────┘
                            ▼
                           REALITY
                            │
                            ▼
                      PERCEPTION/PROOF
                            │
                 SUCCESS / FAILURE / UNKNOWN
                            │
       ┌────────────────────┼────────────────────┐
       ▼                    ▼                    ▼
   CIEAV MODELS       CONSEQUENCE GRAPH     VERIFIED SKILLS
       │                    │                    │
       └────────────────────┼────────────────────┘
                            ▼
                    BETTER INTELLIGENCE
                            │
                            ▼
                    CANDIDATE VERSIONS
                            │
                            ▼
                DETERMINISTIC QUALIFICATION
                            │
                            └────────────────────↺
```

At every iteration:

```text
MODEL AUTHORITY    = 0
AGENT AUTHORITY    = 0
MCP AUTHORITY      = 0
LEARNING AUTHORITY = 0
NATIVE AI AUTHORITY= 0

ONLY THE AUTHORITY / COMMIT PLANE ISSUES EXECUTION AUTHORITY.
```

---

## 37. Engineering rule for all future work

Every new feature/provider/model/framework/native component must answer:

1. What exact state transition can it enable or observe?
2. Which principal/identity is responsible?
3. Is it intelligence, evidence, policy, authority or execution?
4. What prevents it from minting authority?
5. What exact model/provider/framework/runtime version is pinned?
6. What minimum credential scope exists?
7. What current reality must be fresh?
8. What exact arguments/resource identity are bound?
9. Which Consequence Algebra relations/invariants apply?
10. What prevents duplicate or fragmented execution?
11. What proof plan exists before dispatch?
12. What proves success?
13. What proves failure?
14. When must the result remain UNKNOWN?
15. What recovery/reconciliation path exists?
16. What evidence may safely become learning data?
17. What provider/privacy/residency constraints apply?
18. What process/ABI/native failure boundary exists?
19. What deterministic qualification proves readiness?
20. What external OS/hardware/provider evidence is still required?

If those questions do not have explicit answers, the feature is not complete.

---

## 38. Canonical architecture principle

> **Intelligence proposes. Consequence Algebra constrains. Authority permits. Execution changes reality. Proof settles reality. Learning improves future proposals.**

> **No language, framework, model, provider, agent, reward function or native accelerator is allowed to collapse those boundaries.**
