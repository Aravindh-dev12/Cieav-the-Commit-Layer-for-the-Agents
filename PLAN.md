# CIEAV Production Execution Plan

## Universal Intelligence Substrate

This plan is the canonical engineering roadmap for taking CIEAV from its current production-oriented foundations to a complete, testable universal intelligence substrate.

It is intentionally implementation-oriented. Every phase below has concrete deliverables, runtime contracts, failure semantics, tests, and production exit criteria.

CIEAV must not be reduced to only one of these categories:

- model router
- agent framework
- MCP server
- approval gateway
- consequence verifier
- browser guardrail
- workflow engine
- robot safety layer
- memory system
- AI operating system
- application-agent wrapper
- tool-calling proxy

The target is broader:

> **CIEAV is a persistent, model-independent intelligence substrate that can absorb models, agents, tools, software, sensors, devices and robots as capabilities of one adaptive system while keeping real-world authority outside learned intelligence.**

The product experience remains:

> **Installed, not opened. Visible only when reality requires attention.**

---

# 1. Non-negotiable invariants

These are release blockers, not design preferences.

```text
NO MODEL CAN MINT AUTHORITY.
NO AGENT CAN MINT AUTHORITY.
NO ROUTER CAN MINT AUTHORITY.
NO APPLICATION AGENT CAN MINT AUTHORITY.
NO MODEL PROVIDER CAN MINT AUTHORITY.
NO TOOL PROPOSAL CAN MINT AUTHORITY.
NO MEMORY SYSTEM CAN MINT AUTHORITY.
NO TRAINING JOB CAN MINT AUTHORITY.
NO CANDIDATE MODEL CAN PROMOTE ITSELF.
NO SKILL COMPILER CAN QUALIFY ITS OWN OUTPUT.
MODEL OUTPUT IS NEVER OBSERVED REALITY.
A TOOL DESCRIPTION IS NOT EXECUTION AUTHORITY.
REMOTE MODEL ACCESS MUST RESPECT THE DATA PRIVACY BOUNDARY.
EFFECTFUL TOOL CALLS MUST CROSS THE CONSEQUENCE / AUTHORITY BOUNDARY.
UNKNOWN MUST NEVER BE SILENTLY MAPPED TO SUCCESS.
COMMITTED MUST NEVER MEAN VERIFIED SUCCESS.
```

Every execution-capable integration must cross the deterministic Authority / Commit boundary.

Every learning path must remain authority-free.

Every model-facing tool surface must be a controlled capability description. Model output may request or propose a tool operation, but it must never contain a hidden authority path to the underlying database, cloud account, shell, browser, device or actuator.

Provider credentials and vendor-specific transports must remain outside the trust kernel. `@cieav/core` must not depend on OpenAI, Anthropic, cloud-provider or other vendor credential implementations.

---

# 2. Target system anatomy

CIEAV is designed like a distributed intelligence organism.

## 2.1 Universal intelligence anatomy

```text
SELF MODEL
  ↓
GLOBAL INTELLIGENCE WORKSPACE
  ↓
CORTEX / COGNITIVE SCHEDULER
  ↓
COGNITIVE CELLS
  ├─ frontier models
  ├─ local models
  ├─ CIEAV models
  ├─ agents
  ├─ deterministic skills
  ├─ retrievers
  ├─ simulators
  └─ proof providers
  ↓
INTELLIGENCE MESH
  ↓
APPLICATION / DOMAIN AGENT ORCHESTRATION
  ↓
CONSEQUENCE / AUTHORITY / EXECUTION
  ↓
SOFTWARE + CLOUD + DEVICES + ROBOTS
  ↓
PERCEPTION MESH
  ↓
EPISTEMIC STATE
  ↓
INTELLIGENCE METABOLISM
  ├─ memory
  ├─ Consequence Graph
  ├─ model learning
  └─ Verified Skills
  ↓
BETTER CIEAV
```

The consequence subsystem is one critical organ of CIEAV, not the entire identity of CIEAV.

## 2.2 Application / domain-agent anatomy

CIEAV must also support the application architecture used by serious AI-native products: deterministic domain systems remain the source of truth, while models perform interpretation, routing, reasoning, drafting and tool selection above them.

```text
USER / AGENT OBJECTIVE
        ↓
APPLICATION / DOMAIN SERVICE
        ↓
SOURCE-OF-TRUTH DATA + BUSINESS RULES
        ↓
CONTEXT BUILDER
  ├─ permissions
  ├─ privacy reduction
  ├─ source references
  ├─ evidence / reality digests
  └─ domain constraints
        ↓
APPLICATION AGENT
  ├─ intent / workflow routing
  ├─ context orchestration
  ├─ agent selection
  ├─ tool selection
  └─ model selection
        ↓
MODEL GATEWAY
  ├─ external provider adapters
  ├─ local inference adapters
  └─ CIEAV-qualified models
        ↓
ANSWER / STRUCTURED PROPOSAL / TOOL PROPOSAL
        ↓
TOOL REGISTRY + CONSEQUENCE NORMALIZATION
        ↓
POLICY + PERMISSIONS + AUTHORITY + APPROVAL
        ↓
TRUSTED EXECUTION ADAPTER
        ↓
REALITY
        ↓
PROOF / SETTLEMENT / AUDIT / LEARNING
```

This is the CIEAV form of a Rillet-style architecture: the model is a reasoning component inside a larger deterministic product and control system. The valuable layer is not merely an API call to a frontier model; it is the combination of live verified context, domain logic, controlled tools, permissions, approval, proof, audit and learning.

### Source-of-truth rule

```text
MODEL = reasoning / language / planning / proposal
DOMAIN SERVICE = deterministic business logic
DATA SYSTEM = source of truth
CIEAV = consequence, authority, execution, proof and audit boundary
```

The model must not become the database, ledger, permission system, policy engine or execution authority.

---

# 3. Current status

## 3.1 Implemented or partially implemented foundations

The repository currently contains working or partially working foundations for:

- always-on local Gateway lifecycle
- Windows startup integration
- private Chromium CDP transport
- protected browser execution path
- deterministic browser action classification
- Action Receipts
- Ed25519 signed receipt verification
- SUCCESS / FAILURE / UNKNOWN handling
- SQLite and XAMPP/MariaDB receipt storage
- deterministic commitment and execution-fabric contracts
- scoped execution tickets
- credential authority contracts
- hardware signer and TPM-related implementation/test coverage
- MCP and A2A interoperability foundations
- model-provider routing foundations
- consequence-learning dataset generation
- SFT/DPO/KTO/GRPO data preparation
- candidate-model `authority=false` / unqualified invariants
- consequence-intelligence contracts
- deterministic Cognitive Scheduler baseline
- Epistemic State v1
- Consequence Graph v1
- Proof/Learning Provider runtime boundaries
- Universal Intelligence runtime foundations
- Cognitive Cell contracts and registration foundations
- Global Intelligence Workspace foundations
- qualified-model cognitive overlays
- background notification-only mode
- fail-closed hidden-browser approval behavior
- local production-readiness/static qualification tooling
- application-agent / tool-orchestration contracts and runtime work in active implementation

No item in this list should be interpreted as final external production qualification.

## 3.2 Known production gaps

Current known gaps include:

- secure actionable native OS approval flow
- full authority-grade Authorized Outcome Trajectory export
- production-grade persistent Epistemic State indexing
- production-grade persistent Consequence Graph indexing
- live Intelligence Mesh orchestration across heterogeneous providers
- full model competence profiling
- production Application Agent API
- production Model Gateway adapters
- Domain Agent Registry
- Context Builder Registry
- Tool Registry with typed arguments and consequence metadata
- provider credential isolation and secret-store integration
- effectful tool-proposal to Consequence ABI bridge
- application-agent audit/model-call telemetry
- domain-service integration examples beyond infrastructure primitives
- CIEAV Core/Proof/Recovery owned adapters
- isolated RL environments
- Verified Skill compiler and qualification pipeline
- robot/ROS adapter
- edge/wearable runtime
- device trust/onboarding integration
- continuing-authority / live-revocation semantics
- production installer/signing/notarization
- physical TPM/Secure Enclave/Linux TPM2 qualification
- independent security assessment
- DR / backup / incident exercise

---

# 4. Production implementation phases

## Phase A — Stabilize the Trust Kernel

### Deliverables

1. Complete Authority / Commit invariants.
2. Bind identity, principal, agent, exact operation, exact argument digest, policy, pre-state witness and delegated authority.
3. Ensure execution tickets are scoped, short-lived and one-use.
4. Add duplicate-execution/idempotency semantics to every execution adapter.
5. Ensure recovery/undo is itself a governed consequence.
6. Add static dependency rules preventing intelligence/training/application-agent packages from importing signer/credential/ticket minting internals.

### Required tests

- permit/ticket replay rejection
- expired authority rejection
- wrong-principal rejection
- wrong-agent rejection
- wrong-arguments rejection
- stale-reality rejection
- credential-scope rejection
- ticket double-consumption rejection
- recovery authority tests
- process-crash / restart persistence tests

### Exit criteria

`AuthorityKernelQualification = PASS` on all deterministic local tests.

External hardware/signing claims remain blocked until physical qualification.

---

## Phase B — Native Background Interaction

The normal user must not need to open CIEAV.

### Deliverables

1. Windows actionable notification using an authenticated activation channel.
2. macOS actionable native notification.
3. Linux desktop notification/action path where supported.
4. Request-bound approval challenge:

```text
approvalChallengeId
requestId
manifestDigest
principal
origin/resource
risk
expiry
nonce
```

5. `Allow` / `Block` response consumed once.
6. Approval timeout = fail closed.
7. Approval action may only authorize the exact bound consequence.

### Required tests

- forged activation callback
- expired challenge
- reused challenge
- wrong manifest digest
- wrong process/user session
- notification dismissed/no response
- reboot during challenge
- duplicate activation

### Exit criteria

No hidden browser modal is required for production use.

---

## Phase C — Universal Cognitive Cell Contract

Every model, agent, tool, sensor or device must be normalized as a CIEAV capability.

### Deliverable contract

```text
CognitiveCell {
    id
    type
    provider
    identity
    capabilities
    inputModalities
    outputModalities
    locality
    latencyProfile
    costProfile
    privacyBoundary
    trustProfile
    health
    competenceProfile
    proofCapabilities
    authority: false
}
```

### Supported initial cell types

```text
MODEL
AGENT
TOOL
SKILL
RETRIEVER
SIMULATOR
SENSOR
DEVICE
ROBOT
PROOF_PROVIDER
HUMAN
```

### Required runtime features

- registration
- health check
- capability discovery
- revocation/removal
- versioning
- provider isolation
- local/remote classification
- privacy compatibility check
- competence telemetry

### Exit criteria

CIEAV can dynamically register and use multiple heterogeneous cells without hard-coding a single provider.

---

## Phase D — Self Model

CIEAV needs a machine-readable model of its own current capabilities and limitations.

### Runtime state

```text
SelfModel {
    connectedCells
    availableModels
    availableAgents
    availableTools
    availableSensors
    availableDevices
    availableRobots
    verifiedSkills
    currentCompute
    health
    activeObjectives
    activeCommitments
    authorityEnvelopeRefs
    privacyConstraints
    costBudget
    energyBudget
    uncertainty
}
```

### Requirements

- persistent versioned state
- no execution authority
- stale capability invalidation
- deterministic merge rules
- health-aware routing
- device disconnect handling

### Exit criteria

The scheduler can answer `what can CIEAV currently do?` from live evidence rather than static configuration.

---

## Phase E — Global Intelligence Workspace

The workspace is the shared temporary cognitive state used by multiple cells.

### Data model

```text
objective
relevant reality
active beliefs
contradictions
important memories
active hypotheses
candidate plans
uncertainty
proof obligations
available capabilities
constraints
```

### Requirements

- bounded context projection per cell
- privacy-aware projection
- evidence references rather than uncontrolled raw copying
- contradiction preservation
- provenance on every contribution
- stale-state invalidation
- model output never treated as observed reality

### Exit criteria

Two or more independent models/tools can collaborate through one workspace without sharing unrestricted global context.

---

## Phase F — CIEAV Cortex

The Cortex decides what computation should exist for an objective.

### Responsibilities

- model routing
- multi-model decomposition
- parallel hypotheses
- critique/verifier selection
- retrieval
- simulation
- skill selection
- proof selection
- human escalation
- stop/no-op when evidence is insufficient

### Initial implementation

Deterministic scheduler + competence statistics.

### Later implementation

Learned router/contextual bandit trained only from verified performance.

### Hard constraint

```text
CORTEX AUTHORITY = 0
```

### Exit criteria

Routing quality is measurable against a deterministic baseline and never bypasses authority.

---

## Phase F2 — Application / Domain Agent and Tool Orchestration Layer

This phase makes CIEAV usable as the trust substrate inside AI-native applications. It generalizes the architecture used by products where foundation models sit above live domain data and deterministic business logic.

The application-agent layer is intelligence orchestration, not execution authority.

### F2.1 Model Gateway

Provide one provider-neutral invocation boundary:

```text
ApplicationModelProvider {
    descriptor
    health()
    invoke(request)
}
```

Initial provider classes:

```text
EXTERNAL_API
LOCAL_RUNTIME
QUALIFIED_CIEAV
```

Expected adapters over time:

```text
OpenAI-compatible provider
Anthropic-compatible provider
local model runtime
Hugging Face / inference endpoint
CIEAV-qualified model registry
enterprise/private model gateway
```

The gateway must support:

- provider health
- model identity/version pinning
- purpose-based routing
- latency/cost budgets
- privacy compatibility
- structured output validation
- bounded retries
- request correlation
- model-call telemetry
- provider isolation
- zero authority

Provider credentials must be loaded by the adapter/runtime boundary through the CIEAV secret/credential infrastructure. Credentials must never be exposed to a model, workspace contribution or persisted prompt trace.

### F2.2 Context Builder Registry

Models must receive the smallest sufficient verified context, not unrestricted source databases.

```text
ContextDatum {
    kind
    sourceRef
    summary
    digest?
    privacy
    verified
}
```

Required context classes:

```text
USER_INPUT
FACT
RECORD
POLICY
PERMISSION
HISTORY
TOOL_RESULT
PROOF
```

Context builders must:

- query authoritative domain services
- enforce principal/session permissions before retrieval
- redact/minimize sensitive data
- classify local-only vs remote-allowed data
- preserve source references
- attach current reality/proof digests where applicable
- mark model-generated context separately from observed facts
- reject stale authority-relevant context
- provide deterministic size limits

### F2.3 Domain Agent Registry

A domain agent packages domain-specific workflow knowledge without receiving authority.

```text
DomainAgent {
    id
    domain
    capabilities
    contextBuilders
    allowedTools
    preferredModelPurposes
    policies
    proofRequirements
    authority: false
}
```

Initial reference domains should include:

```text
software / Git
cloud / DevOps
filesystem
browser / SaaS
accounting-style financial workflow reference
operations / support
robot/device workflow later
```

The accounting-style reference exists to prove the architecture pattern:

```text
live domain records
→ deterministic domain calculations
→ bounded model context
→ explanation or draft/proposal
→ deterministic validation
→ human approval when effectful
→ authoritative write
→ proof + audit
```

It must not create a second authority system inside the domain agent.

### F2.4 Tool Registry

The LLM must never receive direct database, shell, cloud or device credentials. It receives typed tool descriptions.

```text
ToolDescriptor {
    id
    operations
    argumentSchema
    readOnly
    consequenceClass
    dataCategories
    privacyBoundary
    permissionRequirements
    proofProvider
    duplicateSemantics
    approvalPolicy
    authority: false
}
```

Example tool families:

```text
get_account_balance
get_transactions
compare_periods
draft_journal_entry
get_git_status
read_file
propose_file_change
query_cloud_state
propose_cloud_change
browser_observe
browser_propose_action
robot_observe
robot_propose_action
```

A model may emit only a `ToolProposal`:

```text
ToolProposal {
    toolId
    operation
    target
    normalizedArgumentsDigest
    summary
    confidence
    authority: false
    mayMintExecutionAuthority: false
}
```

The runtime must reject:

- undeclared tools
- undeclared operations
- malformed arguments
- arguments outside the declared schema
- hidden raw SQL/shell/HTTP escape hatches
- privacy-incompatible tool requests
- provider/model attempts to claim authority

### F2.5 Read-only tool execution

Read-only does not mean unrestricted.

Read-only tools still require:

- authenticated principal
- permission check
- data-minimization policy
- privacy classification
- audit correlation
- bounded result size

A read-only result may return directly to the workspace/model only if the permission and privacy boundary allows it.

### F2.6 Effectful tool proposal bridge

Every effectful proposal must cross the existing CIEAV execution constitution:

```text
MODEL TOOL PROPOSAL
      ↓
normalize to Consequence ABI
      ↓
current reality / pre-state witness
      ↓
policy + permissions
      ↓
commitment required?
      ↓
human approval / delegated authority
      ↓
one-use execution ticket
      ↓
trusted adapter
      ↓
post-state proof
      ↓
SUCCESS / FAILURE / UNKNOWN
```

The application agent must never call an effectful trusted adapter directly.

### F2.7 Propose-and-approve workflow

For consequential domain operations, the default workflow is:

```text
user objective
→ domain agent
→ verified context
→ model reasoning
→ structured proposal
→ deterministic domain validation
→ CIEAV consequence classification
→ approval when required
→ execution
→ proof
→ receipt/audit
```

Examples:

```text
journal entry draft
cloud configuration change
Git mutation
filesystem mutation
SaaS state change
browser transaction
permission change
robot action
```

### F2.8 Model selection

Routing may use purpose, competence, privacy, latency and cost:

```text
ROUTE
CLASSIFY
REASON
EXPLAIN
EXTRACT
CRITIQUE
DRAFT
PLAN
```

Model routing remains advisory and authority-free.

A stronger model may be selected for complex reasoning; a smaller model may be used for classification or extraction; local/CIEAV-qualified models may be required for local-only data.

### F2.9 Audit and telemetry

Every application-agent run must produce a correlation chain covering:

```text
request id
principal/session
domain agent
context source refs + digests
privacy decision
model provider/model identity
model purpose
model usage/cost/latency
tool proposals
consequence ids
authority/approval refs
execution refs
proof refs
settlement
```

Do not persist raw secrets. Raw prompts/responses require explicit retention policy and privacy treatment.

### F2.10 Required workflow modes

#### Query / explain

```text
question
→ authorized context retrieval
→ deterministic calculations where possible
→ model explanation
→ evidence refs
```

No execution authority is created.

#### Draft / propose

```text
objective
→ context
→ model draft/tool proposal
→ validation
→ preview
→ optional approval
```

#### Execute

```text
approved proposal
→ Consequence ABI
→ Authority / Commit
→ trusted adapter
→ proof
→ settlement
```

#### Multi-step agent workflow

Each effectful step must independently bind to current reality and authority. A model-created plan is not a blanket execution permit.

#### UNKNOWN recovery

```text
UNKNOWN
→ stop blind retries
→ reconciliation context
→ recovery model/tool proposal
→ governed recovery consequence
```

### F2.11 Required tests

- provider descriptor authority rejection
- provider result authority rejection
- remote provider receives `LOCAL_ONLY` context
- undeclared tool proposal rejection
- undeclared operation rejection
- malformed argument rejection
- read-only permission bypass attempt
- effectful direct-adapter bypass attempt
- model-generated fake approval ref
- model-generated fake proof ref
- stale context action attempt
- cross-session context leak
- prompt-injection tool escalation
- provider credential leakage
- cost/latency budget exhaustion
- provider timeout/failure
- duplicate effect proposal
- UNKNOWN blind retry prevention
- audit correlation completeness

### F2.12 Exit criteria

`ApplicationAgentLayerQualification = PASS` only when:

```text
multiple providers can be registered without changing core authority code
remote/local privacy boundaries are enforced
context provenance survives end-to-end
models can use typed read-only tools safely
models can propose effectful tools but cannot execute them directly
all effectful proposals cross Consequence ABI + Authority / Commit
approval is request-bound and one-use where required
execution produces proof and settlement
provider/model/tool telemetry is correlated
negative authority-bypass tests pass
```

This phase is not production-qualified merely because an OpenAI/Anthropic/local-model demo works.

---

## Phase G — Epistemic State Persistence

### Requirements

Persist:

```text
claim
scope
status
confidence
supporting evidence
contradicting evidence
observed time
reality version
invalidation rules
```

Statuses:

```text
SUPPORTED
CONTRADICTED
STALE
UNKNOWN
```

### Required providers

- browser/runtime
- HTTP/API
- filesystem
- Git
- database
- Cloud
- device/robot telemetry later

### Exit criteria

CIEAV never substitutes stale remembered text for current authority-relevant reality.

---

## Phase H — Consequence Graph Persistence

### V1

Deterministic empirical graph:

- operation class
- preconditions
- world-before digest/class
- world-after digest/class
- SUCCESS count
- FAILURE count
- UNKNOWN count
- proofability
- authority-grade coverage
- reality-bound coverage
- latency
- reversibility
- recovery behavior

### V2

Calibrated transition estimates.

### V3

Learned representations / graph models only after evidence scale justifies them.

### Exit criteria

Planner can compare execution paths using observed outcomes rather than documentation alone.

---

## Phase I — Universal Consequence ABI

Normalize actions from all ecosystems into one consequence descriptor.

### Input adapters

```text
MCP
A2A
Application Agent ToolProposal
HTTP/gRPC
CLI
filesystem
Git
browser
Cloud/SaaS
desktop automation
ROS 2
MQTT / device adapters
future vehicle/industrial adapters
```

### Consequence descriptor

```text
principal
agent/model
resource
objective
worldBefore
expectedWorldChange
exactOperation
exactArgumentsDigest
authorityRequired
safetyConstraints
proofObligations
duplicateSemantics
reversibility
uncertaintyPolicy
continuationConditions
recoveryContract
```

### Exit criteria

Cursor, Cline, ChatGPT-compatible MCP clients, Claude-compatible MCP clients, CIEAV Application Agents and other agents can all reach the same CIEAV consequence boundary.

---

## Phase J — Proof Provider Runtime

### Providers

```text
cieav-browser
cieav-http
cieav-filesystem
cieav-git
cieav-database
cieav-cloud
cieav-tpm
cieav-ros
custom MCP/A2A proof providers
```

### Requirements

- pre-state witness
- post-state witness
- evidence provenance
- digest/signature where applicable
- timeout/failure semantics
- provider health
- no authority

### Exit criteria

Outcome settlement can be independently reproduced from provider evidence.

---

## Phase K — Authorized Outcome Trajectory

Build the full authority-grade settlement object.

### Required bindings

```text
principal identity
agent identity
model/checkpoint identity
delegated authority
credential lease
permission graph
pre-state witness
exact operation
exact argument digest
policy decision
Reality-Bound Commit
one-use ticket
execution correlation
post-state witness
SUCCESS / FAILURE / UNKNOWN
recovery evidence
consent/redaction/provenance
```

### Training eligibility

Only explicitly qualified evidence classes may become agentic-RL data.

Browser outcome receipts and application-agent traces remain outcome/context evidence only unless the full authority chain is present.

### Exit criteria

`AUTHORITY_BOUND_SETTLEMENT` trajectories pass cryptographic and semantic verification.

---

## Phase L — Intelligence Metabolism

Verified experience is routed into different learning assets.

```text
experience
  ├─ memory
  ├─ epistemic update
  ├─ Consequence Graph
  ├─ SFT
  ├─ DPO/KTO
  ├─ GRPO/RLVR
  ├─ offline RL
  ├─ distillation
  └─ skill candidate
```

### Hard rule

Not every experience becomes model training data.

Application-agent prompts, tool proposals and conversations are not automatically training-eligible. Eligibility requires provenance, consent/redaction policy, settlement class and deterministic qualification.

### Exit criteria

Learning eligibility is deterministic, provenance-aware and consent/redaction-aware.

---

## Phase M — CIEAV Model Family

Do not train a foundation model from scratch initially.

### Roles

```text
CIEAV Router
CIEAV Core Reasoner
CIEAV Proof Planner
CIEAV Recovery Model
CIEAV Consequence Model
CIEAV Critic / Reward Models
```

These models must also be usable through the same Application Model Gateway as external providers. CIEAV-owned models do not receive a privileged authority path.

### Initial approach

Shared open-weight backbone + LoRA/PEFT adapters where practical.

### Framework stack

```text
PyTorch
Transformers
PEFT
TRL
OpenEnv/Harbor-style environments
TorchRL/RLlib for structured offline RL
verl/Ray/FSDP2 for scale
vLLM/SGLang for serving
PyTorch Geometric when graph learning is justified
```

### Qualification

Every checkpoint starts:

```text
TRAINED_UNQUALIFIED
authority=false
productionAuthority=false
promotionExecuted=false
```

### Exit criteria

CIEAV-owned models beat deterministic/provider baselines on held-out consequence-quality tasks without violating hard safety gates.

---

## Phase N — Agentic RL Environments

### Required environments

```text
CieavGitEnv
CieavBrowserEnv
CieavFilesystemEnv
CieavDatabaseEnv
CieavCloudEnv
CieavPermissionEnv
CieavCredentialEnv
CieavUnknownOutcomeEnv
CieavDuplicateExecutionEnv
CieavRecoveryEnv
CieavStaleRealityEnv
CieavApplicationToolEnv
CieavContextPrivacyEnv
CieavApprovalBoundaryEnv
```

### Rewards

```text
verified objective success
proof completeness
uncertainty calibration
minimum authority
reversibility
recovery correctness
policy compliance
correct tool selection
context minimization
cost
latency
```

Strong penalties:

```text
false success
unsafe duplicate effect
excess privilege
blind retry after UNKNOWN
stale-reality action
undeclared tool escalation
privacy-boundary violation
approval bypass
```

### Exit criteria

GRPO/RLVR training is reproducible in isolated environments and cannot touch production credentials or authority.

---

## Phase O — Verified Skills

### Lifecycle

```text
verified trajectories
→ pattern candidate
→ Skill Compiler
→ typed candidate skill
→ sandbox
→ failure injection
→ authority validation
→ proof validation
→ recovery validation
→ deterministic qualification
→ VERIFIED SKILL
```

Application agents should prefer a Verified Skill over fresh model planning when a qualified skill exactly matches the operation and current constraints.

### Hard rule

The compiler cannot promote or install its own skill.

### Exit criteria

Repeated known tasks can execute using deterministic qualified procedures instead of fresh LLM planning.

---

## Phase P — Reflex Layer

For high-speed safety paths, models are too slow and nondeterministic.

### Examples

```text
robot human-proximity stop
credential exfiltration block
ambiguous payment reconcile
protected filesystem deny
critical policy deny
application-agent tool escalation deny
```

### Requirements

- local
- deterministic
- low latency
- fail-safe
- auditable
- separately qualified

### Exit criteria

Critical reflexes remain operational if model/network services are unavailable.

---

## Phase Q — Continuing Authority

One-shot authorization is not enough for long-running or physical operations.

### Runtime loop

```text
authorize
→ begin execution
→ continuously observe required conditions
→ continue while valid
→ revoke/stop/transition-to-safe-state when invalid
```

### Example constraints

```text
human distance
robot force
robot velocity
geofence
resource state
credential validity
price limits
error budget
energy budget
```

Application-agent plans do not override continuation constraints. Every long-running effect must remain bound to live authority-relevant reality.

### Exit criteria

Long-running execution stops safely when authority-relevant reality changes.

---

## Phase R — Autonomy Budgets

Generalize permissions into measurable capacity.

```text
financial budget
privacy budget
authority budget
irreversibility budget
energy budget
force budget
spatial budget
time budget
uncertainty budget
externality budget
model-call budget
tool-call budget
```

### Exit criteria

Budgets are consumed and enforced by deterministic runtime state, not model self-report.

---

## Phase S — ROS / Robot Adapter

### Initial target

ROS 2 action/service/topic integration.

### Requirements

- robot/device identity
- action normalization into Consequence ABI
- cancellable action tracking
- telemetry into Perception Mesh
- reflex stop path
- continuing-authority constraints
- safe-state transition
- hardware watchdog compatibility

### Exit criteria

A simulated robot can receive a CIEAV-governed action, prove completion/UNKNOWN, and stop on violated continuation conditions.

Physical robot claims require separate hardware qualification.

---

## Phase T — CIEAV Edge

For wearables, IoT and constrained devices.

### Edge runtime responsibilities

```text
device identity
local policy
small authority verifier
attestation evidence
privacy enforcement
local reflexes
offline execution envelope
signed consequence journal
safe degradation
```

Heavy reasoning may be delegated to CIEAV Core through the same model/application-agent abstractions where privacy and connectivity allow it.

### Exit criteria

Edge node can safely operate under network loss without obtaining new authority beyond its predelegated envelope.

---

## Phase U — Device Trust / Onboarding

### Integrations to evaluate

```text
TPM 2.0
Secure Enclave
Windows TPM
FIDO Device Onboard
Matter device attestation
platform attestation providers
```

### Exit criteria

Device identity and attestation claims are explicit, verifiable and platform-specific rather than simulated.

---

## Phase V — Cognitive Morphogenesis

Repeated successful cognitive programs may produce candidate specialized components.

```text
experience
→ recurring cognitive architecture
→ candidate adapter/model/skill/agent
→ sandbox
→ qualification
→ optional promotion
```

### Hard rule

No self-modification path bypasses deterministic qualification.

---

# 5. Product integrations

## AI-native application / Rillet-style domain products

Primary pattern:

```text
product UI / API
→ domain service
→ CIEAV Application Agent
→ Context Builder
→ Model Gateway
→ controlled ToolProposal
→ Consequence ABI when effectful
→ Authority / Approval
→ trusted domain adapter
→ proof + audit
```

The product's deterministic domain engine and database remain the source of truth.

## Cursor / coding tools

Primary path:

```text
Cursor / coding agent
→ MCP / CLI / local adapter
→ CIEAV
→ filesystem / Git / shell / Cloud
```

CIEAV authority remains independent of Cursor auto-run settings.

## Cline

```text
Cline
→ MCP / tool adapter
→ CIEAV
```

Even if Cline auto-approves internally, CIEAV keeps its independent consequence boundary.

## ChatGPT-compatible clients

```text
ChatGPT / API agent
→ remote MCP or Application Agent API
→ CIEAV
```

## Claude-compatible clients

```text
Claude / MCP client or provider adapter
→ CIEAV
```

## General agents

```text
A2A
→ CIEAV A2A adapter
→ Consequence ABI
```

## Robots

```text
robot planner
→ ROS 2
→ CIEAV ROS adapter
→ Authority / Continuing Authority
→ actuator path
```

## Wearables / IoT

```text
device
→ CIEAV Edge
→ CIEAV Core when available
```

---

# 6. Persistence architecture

Production state must not rely on process memory.

Required stores:

```text
Identity Store
Receipt / Settlement Store
Epistemic Store
Consequence Graph Store
Skill Registry
Model Registry
Competence Registry
Self Model Store
Objective / Workspace Store
Provider Registry
Domain Agent Registry
Tool Registry
Application Agent Run Store
Context Provenance Store
Audit Chain
```

### Application-agent persistence rules

Persist metadata necessary for reproducibility and audit:

```text
provider/model identity
request correlation
context source refs/digests
privacy decision
tool proposal digests
consequence / authority / proof refs
usage/cost/latency
```

Do not persist provider secrets. Do not persist raw prompts/responses by default when source-reference/digest metadata is sufficient. Any raw-content retention must be explicitly classified, encrypted where required and governed by retention policy.

### Requirements

- versioned schemas
- migrations
- crash consistency
- corruption detection
- backup/restore
- retention policy
- encryption where required
- no raw secret persistence unless explicitly required and protected

---

# 7. Observability

Production runtime must expose structured health without becoming a control bypass.

Required metrics:

```text
gateway health
provider health
model health
cell health
application-agent health
domain-agent health
tool-registry health
context-builder failures
privacy-boundary rejections
model latency / cost / token usage
tool proposal counts
undeclared-tool rejection counts
approval-required proposal rate
proof latency
settlement latency
UNKNOWN rate
false-success qualification rate
authority rejection reasons
ticket replay attempts
credential-lease failures
recovery outcomes
Consequence Graph coverage
Epistemic stale/contradiction counts
training candidate status
skill qualification status
```

Logs must be secret-redacted and provenance-bearing.

---

# 8. Security validation

Required before final production qualification:

- threat model
- privilege-boundary review
- dependency/SBOM review
- secret-scanning
- fuzzing of parsers and protocol adapters
- replay/forgery testing
- local privilege escalation review
- notification activation spoofing review
- MCP/A2A trust-boundary tests
- provider sandbox tests
- model prompt-injection isolation tests
- malicious tool/provider tests
- application-agent tool-escalation tests
- provider credential isolation tests
- cross-session/context leakage tests
- remote-model privacy-boundary tests
- model output spoofing of proof/approval/authority refs
- compromised device/cell revocation tests
- supply-chain/release signing review
- independent security assessment

Application-agent red-team tests must include hostile retrieved text attempting to instruct the model to invoke undeclared tools, expose credentials, weaken approval, forge proof or reinterpret UNKNOWN as success.

---

# 9. Release engineering

A production release requires:

```text
Windows signed installer
macOS signed + notarized package
Linux package strategy
reproducible build evidence where practical
SBOM
signed release metadata
migration tests
upgrade tests
rollback tests
uninstall tests
startup-service tests
clean-machine installer tests
application-agent qualification workflow
model-provider compatibility qualification
privacy/tool-boundary negative tests
```

No final production claim until real signing identities and supported-platform installer tests exist.

---

# 10. Qualification matrix

## Deterministic local qualification

Must pass continuously:

```text
unit
integration
typecheck
static invariants
negative/fail-closed tests
crash/restart
storage tamper
protocol misuse
replay
migration
```

## Application-agent / tool-layer qualification

Must include:

```text
provider registration/health
provider identity pinning
local/remote privacy compatibility
context provenance
context minimization
cross-session isolation
structured output validation
tool allowlist enforcement
tool operation enforcement
argument schema validation
read-only permission enforcement
effectful proposal → Consequence ABI
approval binding
provider credential isolation
model/provider timeout behavior
cost/latency budgets
prompt-injection tool escalation
fake proof/approval/authority rejection
UNKNOWN retry/recovery behavior
end-to-end audit correlation
```

## Model qualification

Must include:

```text
held-out tasks
false-success rate
UNKNOWN calibration
authority efficiency
proof quality
recovery correctness
duplicate-effect rate
policy violations
correct tool selection
privacy-boundary compliance
cost/latency
```

## Hardware qualification

Physical runners required for every claimed hardware-backed path.

## Robot qualification

Simulation first, then hardware-in-the-loop, then constrained physical tests.

## Edge qualification

Battery/network-loss/offline/fault tests on real devices.

---

# 11. GitHub engineering workflow

All production work on this program should follow:

```text
issue
→ implementation
→ tests
→ static invariant
→ local qualification evidence
→ pull request
→ code review
→ security review when boundary-changing
→ merge only after explicit approval
```

Issues must identify:

```text
problem
threat model / trust boundary
runtime contract
failure semantics
acceptance criteria
tests
external blockers
```

Changes to the Application Agent, Model Gateway, Tool Registry, Consequence ABI, Authority Kernel, trusted adapters, proof semantics or credential boundary are security-boundary changes and require the corresponding negative tests.

No issue should be closed merely because a scaffold or interface exists.

---

# 12. Definition of Done

A subsystem is **not done** when:

- types exist
- a placeholder adapter exists
- a mock passes
- a README says it works
- a model produced a demo
- an external model successfully called one tool

A subsystem is done only when:

```text
runtime implementation exists
real data flows through it
failure paths are handled
state survives restart where required
negative tests pass
security boundary is enforced
observability exists
migration/upgrade behavior is defined
qualification evidence exists
```

For an application-agent/domain integration, Done additionally requires:

```text
authoritative source-of-truth service is identified
context provenance and privacy are enforced
model provider is replaceable
model has zero authority
tool surface is explicitly declared
read permissions are enforced
effectful operations cross Consequence ABI
approval is bound where required
execution is performed by trusted adapter
outcome is proved as SUCCESS / FAILURE / UNKNOWN
audit correlation is complete
```

External claims additionally require real external evidence.

---

# 13. Immediate execution order

The next implementation sequence is:

```text
1. native actionable approval
2. production-grade Epistemic Store/indexing
3. production-grade Consequence Graph Store/indexing
4. complete Cognitive Cell registry/health/competence runtime
5. complete Self Model runtime
6. complete Global Intelligence Workspace
7. Cortex runtime over registered cells
8. Application Model Gateway registry + provider-neutral runtime
9. OpenAI-compatible / Anthropic-compatible / local / qualified-CIEAV provider adapters
10. Context Builder Registry + provenance/privacy enforcement
11. Domain Agent Registry
12. typed Tool Registry
13. read-only tool execution boundary
14. ToolProposal → Consequence ABI bridge
15. Application Agent API + propose-and-approve workflow
16. application-agent audit/model-call telemetry
17. Proof Provider implementations
18. full authority-grade Authorized Outcome Trajectory
19. MCP/A2A universal Consequence ABI adapters
20. Intelligence Metabolism pipeline
21. CIEAV model-family training environments
22. Verified Skill compiler + deterministic qualification
23. Reflex Layer
24. Continuing Authority
25. Autonomy Budgets
26. ROS 2 adapter
27. CIEAV Edge runtime
28. device onboarding/attestation integrations
29. installer/release/security qualification
```

### Application-agent implementation order

Inside items 8–16, build in this dependency order:

```text
contracts
→ provider registry
→ local/remote privacy checks
→ context builders
→ domain agent descriptors
→ tool registry
→ structured tool proposals
→ read-only tool runtime
→ Consequence ABI bridge for effects
→ approval bridge
→ trusted adapter execution
→ proof/settlement correlation
→ telemetry/audit
→ provider-specific adapters
→ domain reference workflows
→ qualification
```

Provider SDK integration must come after the zero-authority contracts and privacy/tool boundaries, not before them.

Each phase must preserve the constitutional authority boundary.

---

# 14. Long-term target

The finished CIEAV experience should allow a user or organization to give an objective while CIEAV dynamically assembles the necessary intelligence and embodiment:

```text
objective
→ select domain/application agent when appropriate
→ choose/compose cognition
→ retrieve permission-bounded live context
→ retrieve relevant memory
→ inspect live reality
→ simulate where appropriate
→ select model/provider under privacy/cost/latency constraints
→ choose controlled tools / Verified Skills
→ produce an answer or zero-authority proposal
→ normalize effectful proposals into consequences
→ acquire minimum delegated authority
→ obtain human approval when required
→ commit exact action
→ execute through trusted software/device/robot adapter
→ continuously validate required conditions
→ prove what happened
→ recover/reconcile when needed
→ update memory/world knowledge/skills/models
```

while always preserving:

```text
MODEL AUTHORITY = 0
AGENT AUTHORITY = 0
APPLICATION AGENT AUTHORITY = 0
MODEL PROVIDER AUTHORITY = 0
TOOL PROPOSAL AUTHORITY = 0
LEARNING AUTHORITY = 0
```

The long-term product architecture is therefore not:

```text
LLM + prompt + direct database/tool credentials
```

It is:

```text
LIVE DOMAIN REALITY
      ↓
DETERMINISTIC DOMAIN SERVICES
      ↓
PERMISSION-BOUND CONTEXT
      ↓
CIEAV APPLICATION AGENT / CORTEX
      ↓
MODEL GATEWAY
      ↓
REASONING + CONTROLLED TOOL PROPOSALS
      ↓
CONSEQUENCE / AUTHORITY / APPROVAL
      ↓
TRUSTED EXECUTION
      ↓
PROOF / SETTLEMENT / AUDIT
      ↓
VERIFIED LEARNING
```

That is the production target for CIEAV.