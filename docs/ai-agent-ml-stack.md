# CIEAV AI, Agent, MCP, ML, RL and Native Runtime Stack

Status: **ADOPTED target architecture for new work on `tmp-consequence-algebra-build`**

Research snapshot: **2026-08-27**. Provider model catalogs, preview status, pricing, regional availability and managed-training products change rapidly. CIEAV must discover and pin exact provider/model versions at deployment and record those versions in evidence; names in this document are routing recommendations, not permanent protocol constants.

This document is an implementation companion to `ARCHITECTURE.md`. It does **not** grant authority to any model, agent framework, ML model, reward model, MCP server, provider SDK, native library, training process, hosted agent, or research service.

## 1. Five-language policy

CIEAV uses five implementation languages, each with a narrow ownership domain rather than five competing implementations of the same trust logic.

| Language/runtime | Primary ownership | Baseline |
| --- | --- | --- |
| **TypeScript / Node.js** | trusted online contracts and control plane, Agent Kernel, MCP/A2A, API integration, Consequence Algebra interposition, provider adapters, deep-research orchestration | Node.js 22+, TypeScript 5.x |
| **Python** | datasets, scientific/ML evaluation, PyTorch training, SFT/DPO/KTO/GRPO/RLVR, offline/general RL, learned retrieval/reranking, experiment orchestration, model-serving processes | Python 3.11+ |
| **C# / .NET** | Windows-native services/hosts, enterprise integration, Microsoft/Azure agent and MCP adapters, managed desktop/service components, portable .NET inference | .NET 10 LTS, C# 14 |
| **C++** | high-performance inference, GPU/native compute, robotics/ROS2, vision/audio, high-rate sensor/device adapters and narrowly scoped native kernels | C++20 baseline; newer profiles only after qualification |
| **C** | stable cross-runtime ABI, embedded/MCU and driver boundary, FFI surface and minimal portability layer | C17 baseline |

`Node.js` is the runtime; `TypeScript` is the application language. New JavaScript-only runtime logic should be avoided when TypeScript can express the same component.

A sixth language is introduced only after an architecture decision demonstrates a capability that these five cannot reasonably provide and defines its qualification and authority boundary.

## 2. Constitutional trust boundary

The intelligence and native-provider planes have zero execution authority.

All model SDKs, hosted model APIs, agent frameworks, MCP clients/servers, planners, routers, reward models, learned policies, RL policies, research agents, local inference servers, native libraries and GPU workers are proposal-, observation-, or evidence-producing components only. They MUST NOT:

- authorize a real-world consequence;
- mint CIEAV execution capabilities or tickets;
- bypass the Consequence Algebra;
- directly settle a consequential action as successful;
- directly mutate trusted authority state;
- convert model confidence, reward or benchmark score into authority;
- self-promote a learned checkpoint or native implementation into production.

The mandatory consequence path remains:

```text
model / agent / research / native proposal
        ↓
canonical CIEAV ExecutionProposal
        ↓
Consequence Algebra admission
        ↓
Authority / Commit Plane
        ↓
one-use execution ticket
        ↓
Execution Fabric
        ↓
reality observation + proof
        ↓
SUCCESS / FAILURE / UNKNOWN settlement
```

## 3. TypeScript / Node.js online stack

### Runtime

- Node.js 22+
- TypeScript
- ESM
- Zod 4 for new AI/MCP/agent adapter workspaces
- Vitest for TypeScript tests

### MCP

Primary CIEAV MCP implementation:

- official Model Context Protocol TypeScript SDK v2;
- Streamable HTTP for remote production transports;
- stdio for qualified local child-process integrations;
- strict input/output validation before an MCP result becomes a CIEAV proposal or evidence object.

TypeScript, Python, C# and Go are Tier-1 MCP SDK languages in the 2026-07-28 MCP generation. CIEAV should use TypeScript as its primary MCP surface, C# for .NET/enterprise integration and Python where an ML process needs MCP. Do not build a bespoke C/C++ MCP implementation unless a non-substitutable requirement appears.

### Agent frameworks

CIEAV's own Agent Kernel remains the canonical CIEAV orchestration and state boundary. Third-party frameworks are optional **zero-authority adapters**:

1. **OpenAI Agents SDK for TypeScript** for OpenAI-native agents, tools, handoffs, tracing and MCP integrations.
2. **Google Agent Development Kit** for Google/Vertex/ADK-native graph and multi-agent workflows.
3. **Microsoft Agent Framework** for .NET/Microsoft enterprise deployments.
4. **LangGraph** only when its long-running graph/checkpoint semantics materially help a workflow.
5. Provider-managed agents may be exposed through the same CIEAV proposal contract.

No external agent framework is the source of truth for authorization, consequence settlement, proof state or execution state.

### Provider abstraction

Provider SDKs belong behind a CIEAV-owned `ModelProvider` / `AgentProvider` boundary. They MUST NOT be imported directly into Consequence Algebra, Authority, Execution Fabric, proof settlement or trusted state stores.

Conceptually:

```ts
interface ModelProvider {
  generate(request: CieavModelRequest): Promise<CieavModelResponse>;
}

interface AgentProvider {
  run(request: CieavAgentRun): Promise<CieavAgentProposal>;
}
```

Provider output is normalized into CIEAV-owned contracts before it can approach the trusted path.

## 4. Current frontier/API provider catalog

This is a routing snapshot, not a permanent allow-list.

### OpenAI

Recommended current API tiers:

- **GPT-5.6 Sol** (`gpt-5.6-sol`, alias `gpt-5.6`) — highest-quality default for difficult professional reasoning, coding and agentic work.
- **GPT-5.6 Terra** (`gpt-5.6-terra`) — balanced capability/cost tier.
- **GPT-5.6 Luna** (`gpt-5.6-luna`) — lower-cost/high-volume tier.

Prefer the **Responses API** for reasoning, tool use and multi-turn agent workflows. Use the official OpenAI SDK or `@openai/agents` inside `packages/ai-runtime`, not inside trusted authority packages.

OpenAI hosted fine-tuning/RFT must **not** be a baseline CIEAV training dependency: OpenAI announced in May 2026 that its fine-tuning platform is being wound down for new users. Existing supported deployments may remain as an availability-dependent Learning Provider while migration paths are preserved.

### Moonshot AI / Kimi

- **Kimi K3** (`kimi-k3`) — frontier open-weight/native multimodal agentic model; 2.8T total parameters, 104B activated, 1M-token context; suited to long-horizon coding, knowledge work and deep-research-style workflows.
- Kimi's API provides OpenAI/Anthropic-compatible interfaces. Compatibility is a transport convenience only; CIEAV must still normalize semantics, preserve the full provider response required for K3 reasoning/tool history, and independently qualify behavior.
- Kimi K3 can also be a local/open-weight deployment candidate. Current K3 guidance lists vLLM and SGLang among supported serving engines.

Treat any Kimi product mode such as swarm/research UX as a product capability unless a stable documented API endpoint exists; do not infer an API from the UI.

### Anthropic

Current recommended model classes include:

- **Claude Fable 5** (`claude-fable-5`) — highest-capability general Claude tier for the hardest reasoning, scientific/knowledge and long-context tasks.
- **Claude Opus 5** (`claude-opus-5`) — strong long-running agent/coding/professional tier with lower cost than Fable.
- **Claude Sonnet 5** — cost/performance agentic and coding tier.

Use the official Anthropic SDK behind the CIEAV provider adapter. Anthropic model output remains a proposal, never authority.

### Google Gemini

Recommended current API choices:

- **Gemini 3.7 Flash** (`gemini-3.7-flash`) — GA production workhorse for coding, agents and reliable multi-step execution.
- **Gemini 3.1 Pro** (`gemini-3.1-pro-preview`) — preview advanced reasoning/coding/agentic model; preview status means it must not be a sole production dependency without explicit CIEAV qualification/fallback.
- **Gemini Deep Research** (`deep-research-preview-04-2026`) — managed research agent.
- **Gemini Deep Research Max** (`deep-research-max-preview-04-2026`) — maximum-comprehensiveness managed research agent.
- **Gemini Robotics ER 2** (`gemini-robotics-er-2-preview`) — preview embodied/robotics reasoning candidate; physical execution still crosses CIEAV Authority and Execution Fabric.

Prefer Google's current Interactions API for agent/research workflows where supported. Preview endpoints must be pinned and monitored for deprecation.

### Local/open-weight providers

CIEAV should support qualified OpenAI-compatible/local transports for:

- Kimi K3 and other open-weight reasoning/multimodal models;
- smaller local router/extractor/reranker models;
- specialist coding, vision, speech and embedding models.

An OpenAI-compatible HTTP shape does **not** imply model equivalence, security equivalence, idempotency equivalence or authority.

## 5. Deep Research architecture

Deep research is a CIEAV cognitive program, not an authority shortcut.

Primary orchestration should be TypeScript:

```text
research objective
   ↓
query/task decomposition
   ↓
parallel search + MCP + retrieval workers
   ↓
source ingestion
   ↓
claim/evidence graph
   ↓
contradiction + freshness analysis
   ↓
citation construction
   ↓
cross-model critique when useful
   ↓
research synthesis
   ↓
CIEAV proposal (if a real consequence is requested)
```

Python may provide learned retrieval, embeddings, rerankers, classifiers, multimodal preprocessing and research experiments.

Provider-managed research services such as Gemini Deep Research/Max, Kimi research capabilities, OpenAI model/tool workflows and other provider agents may be used as replaceable research workers. Their reports are **evidence candidates**: source provenance, freshness and claims must be retained and cross-checked. A research agent cannot directly turn a recommendation into execution authority.

## 6. Python ML / deep-learning stack

Python remains the primary training language.

### Foundation

- **PyTorch** — default tensor/autograd/training framework.
- Hugging Face **Transformers** — foundation-model loading/training.
- Hugging Face **Datasets** — dataset pipeline.
- **Accelerate** — device/distributed orchestration where appropriate.
- **PEFT** — LoRA/adapter/parameter-efficient tuning.
- **scikit-learn** — calibration, conventional classification/regression, clustering, feature pipelines and baselines.
- **JAX** — optional research backend only for XLA/TPU or research implementations that materially require it.

### LLM post-training

Primary:

- Hugging Face **TRL** for SFT, DPO, KTO/related preference objectives, GRPO, reward models and RLVR-style workflows.
- CIEAV's existing `ml/train_trl.py` remains the primary local entrypoint for SFT/DPO/KTO/GRPO/RLVR.

### RL by workload

Do not force one RL framework onto every workload:

- **TRL** — LLM/foundation-model post-training and RLVR.
- **TorchRL** — PyTorch-native general RL, collectors, replay, environments and algorithm research.
- **verl** — scalable LLM RL/post-training when its rollout/training architecture is justified.
- **NVIDIA NeMo RL** — optional large-scale NVIDIA-oriented LLM/VLM post-training; current stack includes GRPO and distributed Ray/FSDP2/Megatron paths.
- **Ray RLlib** — general distributed RL/multi-agent RL when horizontal scale is required.
- **FSDP/FSDP2**, **DeepSpeed**, **Megatron Core** — distributed training primitives chosen by model/hardware scale, not as authority components.

### Graph/structured learning

- **PyTorch Geometric** or equivalent only after deterministic Consequence Graph semantics and evidence quality justify learned graph models.

## 7. Managed / proprietary ML and RL providers

Managed platforms are optional **Learning Providers**. CIEAV owns dataset eligibility, provenance, reward semantics, qualification and promotion; the managed platform owns compute/training mechanics.

### Microsoft Azure / Microsoft Foundry

Use when enterprise Azure integration is valuable:

- Microsoft Foundry Agent Service for managed agents behind CIEAV proposal boundaries;
- Azure/Foundry reinforcement fine-tuning where the selected model, region and account are currently supported;
- Azure ML/custom compute for Python/PyTorch training when appropriate.

Do not place CIEAV signing keys, credential leases or production authority inside managed training jobs.

### Google Cloud / Vertex AI

Potential managed provider for:

- supervised fine-tuning;
- preference tuning where currently supported;
- reinforcement-learning fine-tuning / reward-function-driven training on supported Gemini/agent platform offerings;
- custom PyTorch training and managed accelerators.

Preview training capabilities require exact version/region qualification before production use.

### AWS Bedrock / SageMaker AI

Potential managed provider for:

- Bedrock supervised fine-tuning/model customization;
- Bedrock reinforcement fine-tuning with reward functions; current Bedrock documentation describes GRPO-based RFT for supported models;
- model distillation where supported;
- Bedrock AgentCore for new managed agent workloads rather than deprecated/closed-to-new-customer legacy agent surfaces;
- SageMaker AI for custom PyTorch/distributed training when Bedrock's managed customization is insufficient.

### Databricks

Use **Databricks AI Runtime** for new managed GPU/deep-learning work where its platform fit is useful. Current AI Runtime supports serverless GPU training/fine-tuning and examples across TRL, LoRA, FSDP, Ray and vLLM.

Do **not** architect new CIEAV training around Databricks' deprecated Foundation Model Fine-tuning product; Databricks directs users to AI Runtime.

### NVIDIA commercial stack

Optional infrastructure/provider ecosystem:

- NeMo RL / Megatron Core for scaled training;
- TensorRT for optimized NVIDIA inference;
- NIM / DGX / AI Enterprise deployment products where operationally justified.

NVIDIA infrastructure does not alter the CIEAV authority boundary.

### OpenAI hosted training

Treat OpenAI hosted fine-tuning/RFT as a migration/availability-dependent provider, **not** as a strategic baseline, because new-user access to the fine-tuning platform is being wound down. CIEAV's owned Python training path must remain independent.

## 8. C# / .NET stack

Baseline:

- **.NET 10 LTS**
- **C# 14**
- ASP.NET Core / Worker Service where appropriate
- NativeAOT only for components that pass its compatibility constraints and benefit from native deployment

Primary uses:

- Windows-native CIEAV host/service;
- enterprise connectors and Microsoft identity/cloud integration;
- official C# MCP SDK for .NET-facing integrations;
- Microsoft Agent Framework and Microsoft.Extensions.AI as optional zero-authority adapters;
- ONNX Runtime .NET for portable qualified model inference;
- ML.NET only for conventional .NET-local ML scenarios where Python would add unnecessary process complexity.

Do not create a second .NET implementation of Consequence Algebra/Authority merely to gain language symmetry. The TypeScript implementation remains canonical unless a future formally verified portability project changes that decision.

## 9. C++ native stack

C++ is for native/performance workloads, not the general control plane.

Preferred uses:

- ONNX Runtime C++ for portable native inference;
- NVIDIA TensorRT C++ for optimized NVIDIA inference;
- llama.cpp/ggml-family local inference where appropriate;
- ROS 2 `rclcpp` for robotics/device execution adapters;
- computer vision/audio/sensor processing and high-throughput native kernels.

Complex C++ inference/robotics workers should normally be **process isolated** behind authenticated local IPC. A memory-safety defect in a model/inference worker must not corrupt Authority, reservation, ticket or proof state.

Only very small, latency-critical and heavily audited native functions should be linked directly into a trusted process.

## 10. C ABI and embedded stack

C is the stable native interoperability waist.

Design the native boundary around a versioned C header/ABI such as:

```text
native/include/cieav_native.h
```

Rules:

- expose C++ functionality through `extern "C"` exports rather than relying on a C++ ABI;
- Node consumes stable native functions through Node-API or a process boundary;
- .NET consumes C exports through source-generated `LibraryImport`/PInvoke;
- Python uses an appropriate C ABI binding or process IPC;
- structs crossing the ABI are explicitly versioned, sized and ownership-defined;
- no C ABI function mints CIEAV execution authority;
- secrets and execution tickets are not handed to inference libraries unless the exact native execution component is the qualified ticket consumer.

C is also the preferred language for constrained embedded/MCU/device shims where a higher-level runtime is unavailable. Physical actions still require attenuated CIEAV authority and evidence/reconciliation semantics.

## 11. Inference and serving matrix

Use deployment format by workload:

- **vLLM** — high-throughput GPU LLM serving.
- **SGLang** — alternative high-performance LLM serving/runtime where justified.
- **Kimi K3-supported engines** — vLLM/SGLang according to exact model deployment requirements.
- **ONNX Runtime** — portable CPU/GPU inference across Python, C++, C#, Node-compatible integrations and other environments.
- **TensorRT** — NVIDIA-specific optimized inference.
- **llama.cpp/ggml** — portable/local quantized LLM/VLM deployment where model compatibility and performance fit.

Model-serving APIs are untrusted provider surfaces, even when loopback-only.

## 12. Package/process layout

Target layout:

```text
packages/
  contracts/               # canonical CIEAV trusted wire/domain contracts
  core/                    # deterministic consequence/authority logic
  ai-runtime/              # TS zero-authority model/agent/provider adapters, Zod 4
  ai-mcp/                  # optional TS MCP integration helpers
apps/
  api/                     # trusted Agent Kernel / Execution Fabric
  mcp/                     # external MCP surface
ml/
  ...                      # Python datasets/evals/training/RL
python/
  cieav_platform/          # Python platform/model/process integrations
dotnet/
  Cieav.Platform/          # .NET 10 enterprise/Windows/provider host
native/
  include/cieav_native.h   # versioned C ABI
  cpp/                     # C++ inference/robotics/native implementation
  c/                       # C portability/embedded/native shims
```

Native/.NET directories are target architecture until implemented and qualified; their presence in this document is not a production claim.

## 13. Zod and trusted-package boundary

`apps/api` currently carries Zod 3 at runtime while the MCP package uses Zod 4 and current OpenAI Agents SDK TypeScript expects Zod 4.

Therefore:

- do not install agent/provider SDKs directly into trusted `apps/api` solely for convenience;
- put new provider/agent dependencies in a Zod-4 `packages/ai-runtime` workspace;
- exchange CIEAV-owned contracts across the boundary;
- migrate trusted packages to Zod 4 only as a deliberate, separately qualified change.

## 14. Dependency and provider qualification policy

Before adding a framework/provider/model/native library, require:

1. a concrete capability absent from the current stack;
2. a CIEAV-owned adapter/ABI boundary;
3. zero authority escalation path;
4. deterministic input/output validation at the trusted boundary;
5. exact provider/model/framework/native version capture in evidence;
6. data residency/privacy/terms review for hosted providers;
7. local integration tests and failure-mode tests;
8. exact-head qualification on each claimed OS/hardware/provider path.

Avoid framework stacking. Do not combine OpenAI Agents SDK + ADK + Microsoft Agent Framework + LangGraph in one execution path unless a concrete product integration requires it.

## 15. Current repository alignment and qualification status

The repository already implements most of the TypeScript/Python foundation:

- Node.js 22+ root runtime;
- TypeScript contracts/core/API/MCP/A2A workspaces;
- official MCP v2 packages in TypeScript;
- Python 3.11+ platform package;
- Python `ml/train_trl.py` implementing SFT/DPO/KTO/GRPO/RLVR;
- RLVR scoring through a local Node verifier that requires `authority=false`;
- trusted TypeScript Consequence Algebra interposed in Execution Fabric.

The executable Consequence Algebra implementation was locally qualified on Windows at commit:

```text
64e9b26f560f7ace2e7abfa5f822e5b29b992643
```

with static gate, API build, contracts/core/API typechecks, 8 core Algebra tests and 17 API/Fabric Algebra tests passing. Later documentation-only commits do not constitute a new executable qualification receipt.

## 16. Final selection

CIEAV's strategic stack is:

```text
Trusted online control / Algebra / MCP:  TypeScript + Node.js
ML / post-training / RL / research ML:   Python + PyTorch ecosystem
Windows / enterprise host:               C# + .NET 10 LTS
Native inference / robotics / GPU:       C++
Stable ABI / embedded boundary:          C
```

Provider choice is replaceable. Framework choice is replaceable. Model choice is replaceable.

The non-replaceable architectural rule is:

> **Intelligence proposes. Consequence Algebra constrains. Authority permits. Execution changes reality. Proof settles reality. Learning improves future proposals.**
