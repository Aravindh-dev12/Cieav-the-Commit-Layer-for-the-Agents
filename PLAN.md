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
NO MEMORY SYSTEM CAN MINT AUTHORITY.
NO TRAINING JOB CAN MINT AUTHORITY.
NO CANDIDATE MODEL CAN PROMOTE ITSELF.
NO SKILL COMPILER CAN QUALIFY ITS OWN OUTPUT.
UNKNOWN MUST NEVER BE SILENTLY MAPPED TO SUCCESS.
COMMITTED MUST NEVER MEAN VERIFIED SUCCESS.
```

Every execution-capable integration must cross the deterministic Authority / Commit boundary.

Every learning path must remain authority-free.

---

# 2. Target system anatomy

CIEAV is designed like a distributed intelligence organism.

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
- background notification-only mode
- fail-closed hidden-browser approval behavior
- local production-readiness/static qualification tooling

No item in this list should be interpreted as final external production qualification.

## 3.2 Known production gaps

Current known gaps include:

- secure actionable native OS approval flow
- full authority-grade Authorized Outcome Trajectory export
- persistent Epistemic State storage
- persistent Consequence Graph storage/indexing
- live Intelligence Mesh runtime
- Self Model runtime
- Global Workspace runtime
- Cognitive Cell registration/discovery
- full model competence profiling
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
6. Add static dependency rules preventing intelligence/training packages from importing signer/credential/ticket minting internals.

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

Cursor, Cline, ChatGPT-compatible MCP clients, Claude-compatible MCP clients and other agents can all reach the same CIEAV consequence boundary.

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

Browser outcome receipts remain outcome-proof only unless the full authority chain is present.

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

Heavy reasoning may be delegated to CIEAV Core.

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
→ remote MCP
→ CIEAV
```

## Claude-compatible clients

```text
Claude / MCP client
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
Audit Chain
```

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
- compromised device/cell revocation tests
- supply-chain/release signing review
- independent security assessment

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

No issue should be closed merely because a scaffold or interface exists.

---

# 12. Definition of Done

A subsystem is **not done** when:

- types exist
- a placeholder adapter exists
- a mock passes
- a README says it works
- a model produced a demo

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

External claims additionally require real external evidence.

---

# 13. Immediate execution order

The next implementation sequence is:

```text
1. native actionable approval
2. persistent Epistemic Store
3. persistent Consequence Graph Store
4. Cognitive Cell registry
5. Self Model runtime
6. Global Intelligence Workspace
7. Cortex runtime over registered cells
8. Proof Provider implementations
9. full authority-grade Authorized Outcome Trajectory
10. MCP/A2A universal Consequence ABI adapters
11. Intelligence Metabolism pipeline
12. CIEAV model-family training environments
13. Verified Skill compiler + deterministic qualification
14. Reflex Layer
15. Continuing Authority
16. Autonomy Budgets
17. ROS 2 adapter
18. CIEAV Edge runtime
19. device onboarding/attestation integrations
20. installer/release/security qualification
```

Each phase must preserve the constitutional authority boundary.

---

# 14. Long-term target

The finished CIEAV experience should allow a user or organization to give an objective while CIEAV dynamically assembles the necessary intelligence and embodiment:

```text
objective
→ choose/compose cognition
→ retrieve relevant memory
→ inspect live reality
→ simulate where appropriate
→ choose a proven or novel plan
→ acquire minimum delegated authority
→ commit exact action
→ execute through software/device/robot
→ continuously validate required conditions
→ prove what happened
→ recover/reconcile when needed
→ update memory/world knowledge/skills/models
```

while always preserving:

```text
MODEL AUTHORITY = 0
AGENT AUTHORITY = 0
LEARNING AUTHORITY = 0
```

That is the production target for CIEAV.
