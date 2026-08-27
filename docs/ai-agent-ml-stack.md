# CIEAV AI, Agent, MCP, ML and RL Stack

Status: **ADOPTED for new work on `tmp-consequence-algebra-build`**

This document defines the language and framework policy for CIEAV's intelligence-facing subsystems. It does **not** grant authority to any model, agent framework, ML model, reward model, MCP server, provider SDK, or training process.

## 1. Language policy

CIEAV uses exactly two implementation languages for the AI/agent/ML surface:

- **TypeScript on Node.js** for online orchestration, model-provider adapters, MCP/A2A integration, agent runtime integration, schemas, API-facing logic, evaluation harnesses, and trusted interposition with the existing CIEAV execution path.
- **Python** for ML datasets, offline evaluation, classical ML, deep-learning training, LLM post-training, reinforcement learning, model optimization, experiment orchestration, and local/high-throughput model-serving processes.

`Node.js` is the runtime; `TypeScript` is the language. New JavaScript-only AI runtime code should be avoided when TypeScript can express the same component.

No third language is introduced into the AI/agent/ML plane unless a future architecture decision documents a non-substitutable requirement.

## 2. Trust boundary

The intelligence plane has zero execution authority.

All model SDKs, agent frameworks, MCP clients/servers, planners, routers, reward models, learned policies, RL policies, and local inference servers are proposal-producing components only. They MUST NOT:

- authorize real-world execution;
- mint CIEAV execution capabilities or tickets;
- bypass the Consequence Algebra;
- directly settle a consequential action as successful;
- directly mutate trusted authority state;
- convert model confidence into authority.

A consequential action must continue through the CIEAV trusted path:

`model/agent/tool proposal -> canonical ExecutionProposal -> Consequence Algebra admission -> Authority -> execution ticket -> Execution Fabric -> reality observation/proof -> settlement`

## 3. Online TypeScript/Node stack

### Runtime

- Node.js 22+
- TypeScript
- ESM
- Zod 4 for new AI/MCP/agent adapter packages
- Vitest for TypeScript tests

### MCP

Primary implementation:

- `@modelcontextprotocol/server` v2
- `@modelcontextprotocol/client` v2
- Streamable HTTP for remote production transports
- stdio for local child-process integrations

The official MCP TypeScript SDK is Tier 1 and v2 is the current stable release line implementing the 2026-07-28 protocol generation. CIEAV should keep the protocol boundary typed and must validate tool inputs/outputs before they become CIEAV proposals.

### Agent frameworks

CIEAV's own Agent Kernel remains the authoritative orchestration boundary for CIEAV state. External agent frameworks are optional adapters in the zero-authority intelligence plane.

Preferred adapters, when a product integration needs them:

1. **OpenAI Agents SDK for TypeScript** (`@openai/agents`) for OpenAI-native agent loops, tools, handoffs, tracing, realtime/sandbox agents and MCP integration.
2. **Google Agent Development Kit** (`@google/adk`) when a Google/Vertex/ADK-native deployment or graph/multi-agent workflow is required.
3. **LangGraph TypeScript/Python** only for workflows that specifically need its long-running graph runtime/checkpoint model. It must remain outside CIEAV authority.
4. Provider-managed agent products may be integrated behind the same CIEAV proposal adapter contract, never as authority.

CIEAV MUST NOT make any third-party agent framework the source of truth for authorization, consequence settlement, proof, or execution state.

### Proprietary model-provider SDKs

Use direct provider SDKs behind a CIEAV-owned `ModelProvider`/`AgentProvider` adapter contract so vendor-specific semantics do not leak into trusted code.

Recommended provider SDKs:

- OpenAI: official TypeScript SDK and/or `@openai/agents` where agent primitives are needed.
- Anthropic: `@anthropic-ai/sdk`.
- Google: `@google/genai` (current GA Google GenAI SDK).
- Local/self-hosted providers: OpenAI-compatible HTTP adapters where the server is explicitly qualified.

A hosted model may be proprietary even when its SDK or agent framework is open source. CIEAV treats model outputs as untrusted proposals regardless of vendor.

### Provider abstraction rule

Do not import proprietary provider SDKs directly into the Consequence Algebra, Authority, Execution Fabric, proof settlement, or trusted state stores.

Provider packages should normalize outputs into CIEAV-owned contracts first.

## 4. Python ML/RL stack

Python remains the primary ML language because the production/research ecosystem for training, post-training, RL and scientific evaluation is Python-first.

### Deep learning foundation

Primary:

- **PyTorch**

Use PyTorch as the default tensor/autograd/training framework for CIEAV ML work.

Optional research backend:

- **JAX** only when XLA/TPU-oriented experiments or a specific research implementation requires it. JAX is not a required production dependency for CIEAV.

### Classical ML

- **scikit-learn** for baselines, calibration, classification/regression, clustering, feature pipelines, model selection and conventional statistical ML.

### LLM/foundation-model training and post-training

Primary stack:

- Hugging Face `transformers`
- Hugging Face `datasets`
- Hugging Face `trl`
- `accelerate`
- `peft` where parameter-efficient tuning is appropriate
- PyTorch

CIEAV's existing `ml/train_trl.py` remains the primary post-training entrypoint for SFT, DPO, KTO, GRPO and RLVR.

### Reinforcement learning

Use the RL framework by problem class instead of forcing one library onto every RL workload:

- **TRL** for LLM/foundation-model post-training such as GRPO, DPO, reward modeling and related alignment/RLVR workflows.
- **TorchRL** for PyTorch-native general RL environments, collectors, replay buffers, PPO/DQN/DDPG-style algorithm research and multi-agent RL research.
- **Ray RLlib** only when distributed rollout/training scale, multi-node execution, or its multi-agent/distributed runtime materially helps. It is not a baseline dependency.
- **NVIDIA NeMo RL** is an optional scale-up path for very large multimodal/LLM post-training on NVIDIA infrastructure; it is not required for local development.

### Inference/model serving

- **vLLM** for high-throughput GPU LLM serving when hardware and deployment conditions support it.
- **ONNX Runtime** for portable cross-platform inference where exporting a model to ONNX is appropriate.
- Existing local/provider adapters remain valid when they satisfy CIEAV qualification and proof requirements.

A model server is never trusted merely because it exposes an OpenAI-compatible API.

## 5. Existing repository alignment

The repository already follows most of this policy:

- root runtime requires Node 22+;
- CIEAV contracts/core/API/MCP/A2A are TypeScript/Node workspaces;
- `apps/mcp` already uses the official MCP v2 server package and Zod 4;
- the Python package requires Python 3.11+;
- `ml/train_trl.py` is Python-first and implements SFT/DPO/KTO/GRPO/RLVR;
- RLVR scoring delegates to a local Node verifier that explicitly requires `authority=false`;
- the Consequence Algebra and Execution Fabric remain in the trusted TypeScript path.

## 6. Zod/package boundary

`apps/api` currently carries Zod 3 at runtime while the MCP package uses Zod 4 and current OpenAI Agents SDK TypeScript expects Zod 4.

Therefore:

- do not install agent/provider SDKs directly into the trusted `apps/api` package solely for convenience;
- create a separate TypeScript workspace for intelligence/provider adapters using Zod 4;
- exchange only CIEAV-owned contracts across the boundary;
- migrate existing trusted packages to Zod 4 only as a deliberate, separately qualified change.

## 7. Recommended package layout

Future implementation should converge on a structure similar to:

```text
packages/
  contracts/             # CIEAV-owned trusted wire/domain contracts
  core/                  # deterministic consequence/authority logic
  ai-runtime/            # TS zero-authority model + agent provider adapters
  ai-mcp/                # TS MCP client/server integration helpers if separation is useful
apps/
  api/                   # trusted API / Agent Kernel / Execution Fabric
  mcp/                   # external MCP surface
ml/
  ...                    # Python dataset/eval/training/RL code
python/
  cieav_platform/        # Python platform/local model/process integrations
```

`ai-runtime` may depend on provider/agent SDKs. Trusted authority/execution packages must not depend on `ai-runtime` in a way that lets it issue authority; communication must remain proposal-only.

## 8. Dependency policy

Pin production dependencies with lockfiles and qualify exact dependency graphs.

Before adding a new agent or ML framework, require:

1. a concrete capability absent from the current stack;
2. an adapter boundary to CIEAV contracts;
3. no authority escalation path;
4. deterministic validation at the trusted boundary;
5. provenance/version capture in evidence;
6. local tests and exact-head qualification.

Avoid framework stacking. Do not combine OpenAI Agents SDK + ADK + LangGraph in one path unless a concrete integration requires it.

## 9. Final selection

For CIEAV development now:

- **Online control/orchestration/MCP/agent integration:** TypeScript + Node.js 22+
- **MCP:** official MCP TypeScript SDK v2
- **Agent runtime:** CIEAV Agent Kernel first; OpenAI Agents SDK / Google ADK / LangGraph only as zero-authority adapters when specifically required
- **Provider access:** official OpenAI, Anthropic and Google SDKs behind CIEAV provider adapters
- **Deep learning:** Python + PyTorch
- **LLM post-training:** Transformers + Datasets + TRL (+ Accelerate/PEFT as needed)
- **General RL:** TorchRL; RLlib only for distributed scale
- **Classical ML:** scikit-learn
- **Large NVIDIA RL scale:** optional NeMo RL
- **GPU LLM serving:** vLLM when appropriate
- **Portable inference:** ONNX Runtime when appropriate

This gives CIEAV two languages, one trusted authority/execution architecture, and multiple replaceable intelligence providers without allowing any AI/ML framework to become authority.

## 10. Research basis

Official/current documentation consulted for this decision includes:

- Model Context Protocol SDK tiering and TypeScript/Python SDK v2 documentation
- OpenAI Agents SDK TypeScript/Python documentation and MCP integration
- Anthropic TypeScript/Python SDK documentation
- Google GenAI SDK and Agent Development Kit documentation
- LangGraph documentation
- PyTorch and TorchRL documentation
- JAX documentation
- Hugging Face TRL documentation
- Ray RLlib documentation
- NVIDIA NeMo RL documentation
- scikit-learn documentation
- vLLM documentation
- ONNX Runtime documentation

The framework names above describe implementation choices, not authority or trust endorsements.
