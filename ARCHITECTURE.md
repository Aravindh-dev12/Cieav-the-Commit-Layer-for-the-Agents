# CIEAV Architecture

## Consequence Intelligence Framework and Autonomous Computing Substrate

> **Models think. Agents plan. CIEAV commits.**
>
> **CIEAV turns intelligence into provable, governable, and learnable state transitions in the real world.**

This is the canonical target architecture for CIEAV.

Research/provider snapshot: **2026-08-27**. Model catalogs, model IDs, preview status, pricing, regions, SDKs, managed-training features and cloud availability change faster than this architecture. CIEAV must discover, pin, qualify and record exact provider/model/framework versions at deployment time. Names in this document are routing recommendations, not permanent protocol constants.

A component appearing here is **not automatically implemented or production-qualified**. Production claims require executable and external qualification evidence.

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

Frontier APIs, open-weight models, local models, coding models, multimodal models, enterprise agents, proprietary training services and CIEAV-trained checkpoints are replaceable cognitive engines inside this larger transaction boundary.

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
19. **Provider/API compatibility does not imply semantic or security equivalence.**
20. **Only the Authority / Commit Plane may issue execution authority.**
21. **Hosted AI, managed RL and fine-tuning services are Learning/Intelligence Providers, never Authority Providers.**
22. **An open-weight model is not trusted merely because its weights are inspectable or local.**
23. **A proprietary model is not trusted merely because the provider operates the infrastructure.**
24. **Latest aliases are allowed for discovery/evaluation; production consequential paths must pin qualified model identity or record the resolved exact version.**

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
model / agent / RL policy / native worker / hosted trainer
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

### 5.1 TypeScript stays canonical for trusted online logic

The repository already places contracts, core deterministic logic, API, Agent Kernel, MCP/A2A and Consequence Algebra in TypeScript/Node. Rewriting qualified authority/consequence logic merely for language symmetry would increase attack surface and semantic drift.

### 5.2 Python owns training and ML research

Modern ML/RL research and production tooling remains Python-first. CIEAV's local training entrypoint already uses Python for SFT, DPO, KTO, GRPO and RLVR while a zero-authority Node verifier owns canonical scoring semantics.

### 5.3 .NET exists for Windows and enterprise integration

.NET is a first-class enterprise/Windows integration runtime, not a second Authority implementation. Use it for Windows services, Microsoft identity/cloud integrations, enterprise agents, MCP and portable inference.

### 5.4 C++ exists for native performance and physical systems

Use C++ only where native performance/hardware matters: inference, GPU runtimes, robotics, vision/audio and high-rate devices. Complex C++ workers should normally be isolated behind authenticated local IPC.

### 5.5 C is the ABI waist

C is the narrow cross-runtime native ABI. Export C++ functionality through a versioned `extern "C"` interface instead of coupling Node, Python and .NET directly to a C++ ABI.

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

Routing inputs include capability, risk, privacy, latency, cost, modality, proofability, historical calibration, provider availability and known consequence semantics.

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
provider_account/project identity
model_id requested
model_id/version resolved
model snapshot when available
endpoint class
region / residency class when relevant
request digest
response digest
usage/cost metadata
latency
reasoning/tool capability flags
provider request/correlation ID
SDK/API version
provider safety/fallback metadata where exposed
```

### 8.1 Latest aliases versus production pins

`latest` aliases may be used in research and model discovery. Consequential production use should either pin an exact model snapshot/version or record the exact resolved model identity returned by the provider and prove that it is in the currently qualified set.

### 8.2 Provider capability is not authority

A provider may expose tool calling, computer use, web search, MCP, agents, code execution or long-running workflows. Those features remain zero-authority proposal mechanisms until converted into CIEAV-owned consequence semantics.

---

## 9. Current frontier/API model routing snapshot

These are **2026-08-27 routing candidates**, not permanent allow-lists.

### 9.1 OpenAI / GPT API

Current frontier API family:

```text
GPT-5.6 Sol   → gpt-5.6-sol / gpt-5.6
GPT-5.6 Terra → gpt-5.6-terra
GPT-5.6 Luna  → gpt-5.6-luna
```

Current documented characteristics include a 1.05M-token context class, up to 128K output, text/image input, configurable reasoning effort, tool calling and Responses API support.

Recommended CIEAV roles:

```text
Sol   → hardest reasoning, coding, consequence planning, deep-research synthesis
Terra → balanced production reasoning / cost / agent workloads
Luna  → high-volume extraction, routing, classification and economical subagents
```

Prefer the **OpenAI Responses API** for new reasoning/tool workflows. OpenAI Agents SDK may be used only in the zero-authority intelligence plane.

For enterprise deployments, CIEAV may route supported GPT models through:

```text
OpenAI first-party API     → fastest access to OpenAI-native capabilities
Microsoft Foundry          → Azure enterprise governance/residency where available
Amazon Bedrock             → AWS-governed OpenAI model access where available
```

Provider-hosting changes do not make model outputs equivalent. Each host/model combination is separately qualified.

GPT-5.6 inference availability does not imply GPT-5.6 fine-tuning/RFT availability. Fine-tuning support is discovered separately from inference support.

### 9.2 Moonshot AI / Kimi K3

Kimi K3 is a current CIEAV frontier candidate:

```text
Kimi K3
2.8T total parameters
104B activated parameters
Mixture-of-Experts
native vision / multimodal capability
1M-token context window
Kimi Delta Attention + Attention Residuals
open-weight release
long-horizon coding / knowledge work / reasoning / agentic research
```

Moonshot announced Kimi K3 in July 2026 and makes it available through Kimi products and the Kimi API. Full/open weights are also part of the K3 release.

Kimi's API is OpenAI-compatible at the transport level. CIEAV may use an OpenAI-compatible client against the Moonshot/Kimi endpoint, but it must normalize Kimi-specific reasoning/tool semantics before producing CIEAV proposals.

Important production rule: documentation pages and model-list pages can lag launches. Do not blindly hard-code a model slug from marketing material. At startup or qualification time:

```text
provider model discovery
      ↓
resolve available Kimi model identity
      ↓
compare with CIEAV qualified model registry
      ↓
pin/record exact model
```

Current Kimi material documents `kimi-k3` as the API flagship and Kimi Code also exposes K3 model variants. Qualified K2.x models may remain fallbacks where appropriate.

For self-hosting, K3's extreme size means local deployment is a specialized multi-accelerator concern. Do not assume a workstation can host it merely because weights are open. Exact inference engine, quantization, tensor-parallel layout, hardware and weight digest must be qualified.

### 9.3 Anthropic / Claude

Current 2026 candidate classes include:

```text
Claude Fable 5   → highest-end general knowledge/coding/research tier
Claude Opus 5    → long-running agents, coding and professional work
Claude Sonnet 5  → balanced agent/coding/professional workloads
```

Recommended CIEAV roles:

```text
Fable 5  → hardest independent reasoning / research / difficult synthesis
Opus 5   → long-horizon agent and software engineering workloads
Sonnet 5 → balanced production agents and cross-checking
```

Claude output remains a proposal. Availability/safety routing can change independently of model identity, so CIEAV records provider-side fallback/safety metadata when exposed.

### 9.4 Google Gemini

Current candidates include:

```text
Gemini 3.1 Pro preview   → high-end reasoning / multimodal work
Gemini 3.7 Flash         → current capable Flash model for coding/agent workflows
Gemini 3.6 Flash         → previous stable Flash generation
Gemini 3.5 Flash         → stable general/high-throughput tier
Gemini 3.5 Flash-Lite    → low-cost high-throughput tier
```

Use Gemini API directly for developer use and Vertex AI / Google Cloud for enterprise deployment, residency, IAM, managed tuning and platform integration.

Preview models/services require explicit fallback, deprecation monitoring and exact-version qualification.

### 9.5 xAI / Grok

Current xAI documentation recommends **Grok 4.6** for general, coding, agentic and knowledge-work workloads. It supports text/image input, reasoning, tool use and Responses/Chat Completions APIs with a 500K context window.

Candidate routing:

```text
Grok 4.6 → coding, agentic work, independent reasoning/cross-checking
```

CIEAV must pin exact model identity rather than relying on mutable latest aliases for consequential production.

### 9.6 Cloud model aggregators / enterprise hosts

CIEAV supports host adapters independently from model adapters:

```text
Microsoft Foundry / Azure-hosted models
Amazon Bedrock
Google Vertex AI / Model Garden
Databricks Mosaic AI / Model Serving
Hugging Face Inference Endpoints
Together AI
Fireworks AI
Groq
Cerebras
other qualified OpenAI-compatible services
```

Examples from the current snapshot:

- Microsoft Foundry documentation lists GPT-5.6 Sol/Terra/Luna support where regionally available.
- Amazon Bedrock exposes GPT-5.6 Sol/Terra/Luna and supports Responses, Chat Completions and Converse on its Bedrock endpoints.
- Amazon Bedrock also supports a broad multi-provider catalog; model availability must be queried rather than assumed.
- Grok 4.6 is available through Microsoft Foundry as of August 26, 2026.

### 9.7 Other useful provider/model families

Adapters may be added where evaluation justifies them:

```text
Mistral
Qwen
DeepSeek
MiniMax
Cohere
NVIDIA Nemotron
Meta Llama family
OpenAI open-weight models when applicable
specialist embedding/reranking/vision/audio models
```

Provider/model inclusion means **available for evaluation**, not automatically approved for consequential production.

### 9.8 Recommended frontier service portfolio for CIEAV

For broad capability and vendor independence, a strong default portfolio is:

```text
PRIMARY FRONTIER REASONER     OpenAI GPT-5.6 Sol
PRIMARY BALANCED REASONER     GPT-5.6 Terra
PRIMARY ECONOMICAL SUBAGENT   GPT-5.6 Luna
OPEN-WEIGHT FRONTIER PEER     Kimi K3
INDEPENDENT REASONING PEER    Claude Fable 5 / Opus 5
GOOGLE MULTIMODAL PEER        Gemini 3.1 Pro / 3.7 Flash
ADDITIONAL DIVERSE PEER       Grok 4.6
LOCAL SPECIALISTS             qualified open-weight models
```

The Cognitive Scheduler should choose from measured competence profiles rather than brand preference.

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

### 10.1 Research provider portfolio

CIEAV may use:

```text
GPT-5.6 Sol / Terra reasoning + hosted tools
Kimi K3 long-context/open-weight frontier reasoning
Claude Fable 5 / Opus 5 research and critique
Gemini 3.1 Pro / 3.7 Flash multimodal research
Grok 4.6 as an additional independent reasoning/search path
local/open-weight research workers
specialist search/retrieval services
```

Managed research output is an **evidence candidate**, not authoritative truth. Preserve source URLs/IDs, dates, extracted claims, contradictions and provider provenance.

### 10.2 Deep Research roles

```text
ResearchPlanner
QueryDecomposer
SourceRetriever
SourceExtractor
ClaimBuilder
ContradictionDetector
FreshnessEvaluator
CitationVerifier
CrossModelCritic
SynthesisAgent
ResearchAuditor
```

Every role has zero authority.

### 10.3 Language ownership

TypeScript orchestrates research state, provider routing, MCP, citations and evidence graphs. Python supplies learned retrieval, embeddings, rerankers, classifiers, scientific tooling and experimental multimodal processing where useful. C++ may accelerate local inference/indexing only when profiling justifies it.

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
LangGraph / LangChain
Semantic Kernel
AutoGen where integration requirements justify it
provider-managed agent runtimes
custom enterprise agents
```

A third-party agent framework may schedule, reason and propose. It may not settle, authorize or mint tickets.

### 11.3 Framework containment rule

Do not stack multiple agent frameworks in the same path without a concrete capability requirement. Every framework adds its own memory, retry, tool, state and error semantics. CIEAV must remain the durable source of consequence and authority state.

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
NVIDIA TensorRT / TensorRT-LLM inference
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

CIEAV does not require every framework below. This is the approved evaluation universe. Add a dependency only when it supplies a capability absent from the current stack.

### 22.1 Core deep-learning frameworks

```text
PyTorch           → default CIEAV training/tensor/autograd framework
JAX               → optional XLA/TPU/research path when specifically justified
TensorFlow/Keras  → compatibility path for existing TF/Keras models, not default new work
```

### 22.2 Foundation-model / transformer ecosystem

```text
Hugging Face Transformers
Hugging Face Datasets
Accelerate
PEFT / LoRA / QLoRA
bitsandbytes
safetensors
Tokenizers
Sentence Transformers where appropriate
```

### 22.3 Training and distributed optimization

```text
PyTorch DDP
FSDP / FSDP2
DeepSpeed
Megatron Core
Liger Kernel
FlashAttention-compatible paths when qualified
NCCL / accelerator collective layer indirectly through frameworks
```

### 22.4 LLM post-training and preference optimization

```text
TRL              → CIEAV baseline SFT/DPO/KTO/GRPO/RLVR path
Axolotl          → configuration-driven fine-tuning where useful
Unsloth          → memory/throughput-efficient fine-tuning when qualified
torchtune        → PyTorch-native tuning option
OpenRLHF         → distributed RLHF/post-training candidate
verl             → scalable LLM RL/post-training candidate
NVIDIA NeMo RL   → large NVIDIA-oriented LLM/VLM RL candidate
```

CIEAV's existing Python trainer remains the local baseline for SFT/DPO/KTO/GRPO/RLVR.

### 22.5 General reinforcement learning

```text
TorchRL                → default PyTorch-native general RL
Gymnasium              → environment API/ecosystem
PettingZoo             → multi-agent environment interface
Stable-Baselines3      → mature baseline implementations and experiments
CleanRL                → compact reference implementations / research validation
Ray RLlib              → distributed/general/multi-agent RL at scale
Tianshou               → optional PyTorch RL research library
Acme                   → optional research environment when a specific algorithm requires it
```

### 22.6 Agentic / verifiable RL

For CIEAV, the highest-value RL class is environment/verifier-driven agentic training:

```text
fresh model rollout
      ↓
sandboxed CIEAV environment
      ↓
mechanically verifiable task result
      ↓
zero-authority verifier
      ↓
reward / trajectory labels
      ↓
TRL / verl / OpenRLHF / NeMo RL / RLlib as appropriate
```

Prefer mechanically verified rewards to LLM-as-judge whenever the environment can prove the outcome.

### 22.7 Classical ML and structured models

```text
scikit-learn
XGBoost
LightGBM
CatBoost
statsmodels where statistical inference is required
ML.NET for .NET-local conventional inference when appropriate
```

Use these for calibration, anomaly detection, routing, outcome prediction, risk estimation, ranking and conventional supervised problems where deep learning is unnecessary.

### 22.8 Graph learning

```text
PyTorch Geometric
DGL where specifically justified
```

Use graph learning only when deterministic Consequence Graph semantics and verified data quality justify learned graph models. The learned model never replaces the canonical Consequence Algebra.

### 22.9 Experiment tracking and evaluation

Possible integrations:

```text
Weights & Biases
MLflow
Databricks MLflow
OpenTelemetry for runtime traces
provider-native evaluation systems
CIEAV deterministic eval/qualification receipts
```

External tracking systems never receive CIEAV signing keys or unrestricted secrets.

---

## 23. Managed / proprietary ML and RL providers

Managed platforms are **Learning Providers**, never Authority Providers.

CIEAV owns:

```text
dataset eligibility
provenance / consent / redaction
reward semantics
verifier semantics
candidate status
held-out qualification
promotion decision
checkpoint identity
production allow-list
```

The vendor supplies model access, compute, managed training or training mechanics.

### 23.1 OpenAI managed fine-tuning / reinforcement fine-tuning

OpenAI's fine-tuning API exposes supervised, DPO and reinforcement methods where supported by the selected model/account.

RFT is a useful CIEAV candidate when a hosted OpenAI reasoning model is materially better than a locally trainable model and the reward can be expressed through a qualified grader.

Rules:

```text
OpenAI RFT grader != CIEAV authority
fine-tuned model   = CANDIDATE
provider job PASS  != production qualification
GPT-5.6 inference support != GPT-5.6 fine-tuning support
```

CIEAV must dynamically discover supported fine-tuning/RFT models and keep training-provider capability separate from inference-provider capability.

### 23.2 Microsoft Foundry / Azure OpenAI / Azure Machine Learning

Candidate services:

```text
GPT / multi-provider inference through Microsoft Foundry
supervised fine-tuning where supported
DPO where supported
reinforcement fine-tuning where supported
Azure Machine Learning custom PyTorch/DeepSpeed/FSDP jobs
managed endpoints / registries / MLOps
enterprise identity / private networking / data residency
```

Microsoft currently documents reinforcement fine-tuning for selected models including `o4-mini` and gated `gpt-5`. Do not extrapolate that support to GPT-5.6 without the service reporting it.

Use Azure ML when CIEAV must own the training container/code while using Azure-managed compute. Use Foundry-managed tuning only when its method/model/region/data terms satisfy CIEAV governance.

### 23.3 Google Vertex AI / Gemini Enterprise Agent Platform

Candidate services:

```text
Gemini inference
Vertex AI custom training
managed accelerators / TPU/GPU
supervised/preference tuning where supported
reinforcement learning fine-tuning where supported
managed evaluation / model registry / deployment
Gemini enterprise/agent services
```

Google documents a reinforcement-learning fine-tuning path for Gemini with reward functions including string matching, Gemini-based autoraters, code execution, custom Cloud Run reward services and composite rewards. The current documented offering is **Pre-GA**, so CIEAV treats it as evaluation-only unless its service lifecycle/status changes and explicit production qualification is completed.

A custom reward service is a useful place to expose a CIEAV zero-authority verifier, but it must not receive Authority credentials.

### 23.4 Amazon Bedrock / SageMaker AI / HyperPod

Candidate services:

```text
Bedrock managed foundation-model inference
Bedrock model customization/distillation features where supported
SageMaker AI custom training
SageMaker HyperPod large-scale PyTorch training
Ray on HyperPod for distributed Python/RL workloads
managed model registry/deployment/observability
```

HyperPod can run standard Ray and PyTorch workloads rather than forcing CIEAV to rewrite training semantics into an AWS-specific framework. This is the preferred AWS strategy for CIEAV-owned RL loops.

Do not assume every Bedrock inference model is customizable or supports RL. Inference, fine-tuning, distillation and reinforcement capability are separate provider capabilities.

### 23.5 Databricks / Mosaic AI

Use where lakehouse governance, data lineage, MLflow and managed GPU training fit the deployment.

Current useful classes include:

```text
Databricks Serverless GPU / AI Runtime
PyTorch distributed training
DeepSpeed + TRL
Axolotl
Unsloth
LLM Foundry
MLflow experiment/model lifecycle
Mosaic AI Model Serving / Gateway where qualified
```

CIEAV still owns reward semantics, candidate state and deterministic promotion.

### 23.6 NVIDIA commercial / enterprise stack

```text
NVIDIA NeMo RL
Megatron Core
TensorRT / TensorRT-LLM
NIM
DGX / cluster deployment options
CUDA ecosystem
```

NeMo RL currently supports scalable post-training algorithms including GRPO, PPO, SFT, DPO, reward modeling and on-policy distillation, with PyTorch DTensor and Megatron Core training backends. NVIDIA components accelerate training and serving; they do not alter CIEAV's authority model.

### 23.7 Hugging Face managed services

Candidate uses:

```text
Inference Endpoints
AutoTrain where method/control is sufficient
Hub model/dataset registry
Spaces for non-authority research tooling
managed accelerator partners
```

CIEAV must independently verify license, model digest/revision, remote-code requirements and provider data handling.

### 23.8 Specialized hosted inference / fine-tuning providers

Possible adapters include:

```text
Together AI
Fireworks AI
Groq
Cerebras
Baseten
Replicate
Modal
RunPod
Lambda cloud
CoreWeave
other qualified GPU clouds
```

These are infrastructure/inference/training options, not trust endorsements. A provider is added only if its API, security posture, model identity, data handling, failure behavior and reproducibility can be qualified.

### 23.9 Proprietary model providers without general weight access

CIEAV should support hosted inference adapters for:

```text
OpenAI
Anthropic
Google
xAI
other proprietary frontier providers
```

If the provider does not expose weight-level training, use its documented customization surface only. Do not build CIEAV architecture around private undocumented capabilities.

### 23.10 Managed RL selection rule

Select the managed RL service by control needs:

```text
Need full control of algorithm/reward/runtime   → own Python RL on qualified GPU cloud
Need OpenAI reasoning-model RFT               → OpenAI RFT or qualified Foundry equivalent
Need Gemini managed reinforcement tuning      → Google RL fine-tuning only when lifecycle status permits
Need NVIDIA-scale open-weight post-training   → NeMo RL / Megatron on qualified NVIDIA infrastructure
Need distributed generic RL                  → Ray RLlib on qualified cluster/HyperPod/etc.
Need CIEAV current local baseline             → Python TRL + Node verifier
```

Do not choose a proprietary platform merely because it offers an “agent” or “RL” label.

---

## 24. Learning Provider interface

Conceptually:

```text
CIEAV Learning Provider
    ├── cieav-local-trl
    ├── cieav-torchrl
    ├── cieav-verl
    ├── cieav-openrlhf
    ├── cieav-nemo-rl
    ├── cieav-rllib
    ├── cieav-openai-rft
    ├── cieav-azure-foundry
    ├── cieav-azure-ml
    ├── cieav-vertex
    ├── cieav-bedrock-sagemaker
    ├── cieav-databricks
    └── custom GPU cluster
```

Every provider output remains `CANDIDATE` until deterministic promotion.

A Learning Provider contract records at least:

```text
provider + region
training code/container digest
base model identity/revision
training method
training dataset digest
validation dataset digest
reward/verifier identity
hyperparameters
seed(s)
hardware/runtime metadata
framework versions
checkpoint digest
provider job ID
training metrics
qualification state
```

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

LLM judges may be used for subjective dimensions but should be calibrated against human/mechanical references and never control promotion alone for safety-critical behavior.

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

Environment versions, seeds, simulator versions and verifier versions are part of training provenance.

---

## 27. Inference and serving matrix

Use the runtime that fits deployment:

```text
provider API       → managed frontier inference
vLLM               → high-throughput GPU LLM serving
SGLang             → high-performance alternative serving/runtime
TensorRT-LLM       → optimized NVIDIA LLM inference
ONNX Runtime       → portable CPU/GPU inference across Python/C++/.NET
TensorRT           → NVIDIA-specific optimized general inference
llama.cpp / ggml   → portable/local quantized LLM/VLM inference
KTransformers      → specialist large-MoE local inference candidate
Triton Inference   → multi-model NVIDIA serving where justified
```

A loopback/local model server is still an untrusted intelligence provider.

### 27.1 Serving qualification

Pin and record:

```text
weight/checkpoint digest
quantization format
inference engine version
CUDA/driver/runtime versions
GPU/CPU architecture
parallelism layout
context limits
sampling/reasoning defaults
tool-call output contract
OOM/restart behavior
```

OpenAI-compatible wire format is not proof of semantic equivalence.

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

### 29.2 Provider-model qualification tuple

Do not qualify only a model name. Qualify a tuple:

```text
provider
endpoint/region
model ID + snapshot/resolved version
SDK/API version
system prompt/tool schema version
reasoning/sampling configuration
safety/fallback configuration when observable
```

### 29.3 Native/provider qualification

Require exact OS/arch/hardware/provider/model versions, failure injection, timeout/retry behavior, process crash behavior, ABI compatibility, network failure behavior and supply-chain provenance as appropriate.

### 29.4 Cross-provider comparison

Before promoting a frontier model for a role, compare it against at least one materially independent provider on representative CIEAV tasks. This reduces single-provider blind spots and identifies regressions hidden by generic benchmarks.

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

Provider API keys are scoped to the provider adapter process/service and are not included in model prompts or training examples.

---

## 31. Target package/process layout

```text
packages/
  contracts/               # canonical trusted domain/wire contracts
  core/                    # deterministic core + Consequence Algebra
  ai-runtime/              # TS model/agent/provider adapters, zero authority
  ai-mcp/                  # optional reusable MCP integration helpers
  research/                # TS research state/claim/evidence orchestration
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

### 31.1 Dependency rule

Trusted authority/execution packages must not depend on provider adapters in a way that allows provider code to issue authority. Provider and ML packages depend inward only through CIEAV-owned proposal/evidence contracts.

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

Provider/model names in this document are researched targets; an adapter is not implemented merely because the provider is listed.

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

Require real provider integration, pinned/resolved model/API versions, network failure tests, retry/idempotency behavior, quotas/rate-limit handling, privacy/residency review and operational monitoring.

### Managed-training features

Require exact training service, region, base model, method, container/framework version, dataset/reward/verifier digests, checkpoint digest and export/deployment path.

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
model-license restrictions
export/import restrictions where applicable
```

Prefer typed semantic evidence and digests/references over unnecessary raw content or reusable secrets.

For frontier providers, record whether requests are first-party, cloud-marketplace hosted or routed through an intermediary because data handling and contractual terms may differ.

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

A good provider adapter can be removed without changing the meaning of CIEAV authority, proof or settlement.

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
 GPT/Kimi/Claude/...    local/open ML       deterministic
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
MODEL AUTHORITY       = 0
AGENT AUTHORITY       = 0
MCP AUTHORITY         = 0
LEARNING AUTHORITY    = 0
HOSTED-RL AUTHORITY   = 0
NATIVE AI AUTHORITY   = 0

ONLY THE AUTHORITY / COMMIT PLANE ISSUES EXECUTION AUTHORITY.
```

---

## 37. Engineering rule for all future work

Every new feature/provider/model/framework/native component must answer:

1. What exact state transition can it enable or observe?
2. Which principal/identity is responsible?
3. Is it intelligence, evidence, policy, authority or execution?
4. What prevents it from minting authority?
5. What exact model/provider/framework/runtime version is pinned or resolved?
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
17. What provider/privacy/residency/license constraints apply?
18. What process/ABI/native failure boundary exists?
19. What deterministic qualification proves readiness?
20. What external OS/hardware/provider evidence is still required?
21. How is model/provider deprecation detected?
22. What fallback is safe if a provider model disappears or changes?
23. If managed training is used, what proves the exact checkpoint lineage?
24. If a provider uses an alias, how is the resolved model identity recorded?

If those questions do not have explicit answers, the feature is not complete.

---

## 38. Research-backed provider freshness policy

The current snapshot was cross-checked against official/current provider documentation and current release material for:

```text
OpenAI model catalog / GPT-5.6 guidance
Kimi/Moonshot K3 release and Kimi API platform
Anthropic current Claude releases
Google Gemini API model/deprecation catalog
xAI/Grok model catalog
Microsoft Foundry model/tuning documentation
Google managed reinforcement-tuning documentation
Amazon Bedrock/SageMaker/HyperPod documentation
Databricks GPU/LLM training documentation
NVIDIA NeMo RL documentation
```

For automated production use, architecture text is not the source of truth for availability. Provider discovery must query the provider API/catalog and compare the result with CIEAV's qualified provider registry.

Recommended registry shape:

```text
QualifiedModel {
    provider
    host
    region
    model_id
    model_version_or_snapshot
    capabilities
    context_limit
    modality_set
    tool_protocols
    qualification_receipt_digest
    qualified_at
    expires_or_recheck_at
    fallback_model_refs[]
    authority: false
}
```

---

## 39. Canonical architecture principle

> **Intelligence proposes. Consequence Algebra constrains. Authority permits. Execution changes reality. Proof settles reality. Learning improves future proposals.**

> **No language, framework, model, provider, agent, reward function, managed trainer or native accelerator is allowed to collapse those boundaries.**
