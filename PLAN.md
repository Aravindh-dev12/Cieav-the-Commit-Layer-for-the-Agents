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
EQUIVALENT REAL-WORLD CONSEQUENCES MUST NOT EXECUTE TWICE THROUGH DIFFERENT ROUTES.
AN UNSETTLED CONSEQUENCE MUST BLOCK OR RECONCILE EQUIVALENT / CONFLICTING FOLLOW-ON EFFECTS.
MODELS MAY SUGGEST CONSEQUENCE RELATIONS; ONLY DETERMINISTIC / QUALIFIED LOGIC MAY ADMIT THEM FOR EXECUTION.
POLICY MUST BE ABLE TO EVALUATE COMPOSED / CUMULATIVE CONSEQUENCES, NOT ONLY INDIVIDUAL TOOL CALLS.
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
CONSEQUENCE ABI / MATERIALIZATION
  ↓
CONSEQUENCE ALGEBRA / ACTIVE CONSEQUENCE GRAPH
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
CONSEQUENCE ALGEBRA
  ├─ canonical reality identity
  ├─ semantic effect identity
  ├─ footprints + invariants
  ├─ equivalence / conflict / causality
  ├─ active consequence graph
  ├─ reservations / unsettled barriers
  ├─ proofability / causal fences
  └─ cumulative consequence policy
        ↓
POLICY + PERMISSIONS + AUTHORITY + APPROVAL
        ↓
TRUSTED EXECUTION ADAPTER
        ↓
REALITY
        ↓
PROOF / SETTLEMENT / AUDIT / LEARNING
```

The application-agent pattern is one layer inside CIEAV, not the product identity. The model is a reasoning component inside a larger deterministic product and control system.

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
- semantic effect, effect key, Reality-Bound Commit, reversibility escrow, effect quarantine and continuing-authority foundations that can support future Consequence Algebra work

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
- Canonical Reality Address / cross-adapter resource identity
- semantic effect identity independent of execution route
- multi-dimensional Consequence Footprint
- deterministic Consequence Relation Resolver
- Invariant Compatibility / confluence admission
- persistent Active Consequence Graph
- semantic Consequence Reservations
- generalized Unsettled Consequence Barrier
- proofability admission / Proof Plan Reservation
- Causal Reality Fences
- cross-route semantic idempotency and reconciliation
- cumulative / anti-fragmentation consequence policy
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

The runtime must reject undeclared tools/operations, malformed or out-of-schema arguments, hidden raw escape hatches, privacy-incompatible requests and provider/model attempts to claim authority.

### F2.5 Read-only tool execution

Read-only does not mean unrestricted.

Read-only tools still require authenticated principal, permission checks, data minimization, privacy classification, audit correlation and bounded result size.

### F2.6 Effectful tool proposal bridge

Every effectful proposal must cross the existing CIEAV execution constitution:

```text
MODEL TOOL PROPOSAL
      ↓
normalize to Consequence ABI
      ↓
current reality / pre-state witness
      ↓
Consequence Algebra when applicable
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

### F2.9 Audit and telemetry

Every application-agent run must correlate principal/session, domain agent, context refs/digests, privacy decision, model identity, usage, tool proposals, consequence ids, authority/approval refs, execution refs, proof refs and settlement.

### F2.10 Required workflow modes

```text
Query/explain:
question → authorized context → deterministic calculation where possible → explanation + evidence

Draft/propose:
objective → context → model proposal → validation → preview / approval

Execute:
approved proposal → Consequence ABI → Authority / Commit → execution → proof → settlement

UNKNOWN recovery:
UNKNOWN → stop blind retry → reconcile reality → governed recovery proposal
```

Each effectful step in a multi-step plan must independently bind to current reality and authority.

### F2.11 Required tests

- provider/result authority rejection
- remote provider receives `LOCAL_ONLY` context
- undeclared tool/operation rejection
- malformed argument rejection
- read-only permission bypass
- direct-adapter bypass
- fake approval/proof refs
- stale context action
- cross-session context leak
- prompt-injection tool escalation
- provider credential leakage
- budget exhaustion
- provider timeout/failure
- duplicate effect proposal
- UNKNOWN blind retry prevention
- audit correlation completeness

### F2.12 Exit criteria

`ApplicationAgentLayerQualification = PASS` only when provider neutrality, privacy boundaries, context provenance, safe typed reads, zero-authority effect proposals, Consequence ABI + Authority/Commit crossing, request-bound approval, proof/settlement and correlated telemetry are all enforced.

---

## Phase G — Epistemic State Persistence

Persist claim, scope, status, confidence, supporting/contradicting evidence, observed time, reality version and invalidation rules.

Statuses:

```text
SUPPORTED
CONTRADICTED
STALE
UNKNOWN
```

Required providers include browser/runtime, HTTP/API, filesystem, Git, database, Cloud and later device/robot telemetry.

### Exit criteria

CIEAV never substitutes stale remembered text for current authority-relevant reality.

---

## Phase H — Consequence Graph Persistence

### V1

Deterministic empirical graph over operation class, preconditions, world-before/after classes, SUCCESS/FAILURE/UNKNOWN counts, proofability, authority-grade coverage, latency, reversibility and recovery behavior.

### V2

Calibrated transition estimates.

### V3

Learned representations / graph models only after evidence scale justifies them.

### Exit criteria

Planner can compare execution paths using observed outcomes rather than documentation alone.

---

## Phase H2 — CIEAV Consequence Algebra and Multi-Agent Reality Coordination

CIEAV already governs individual consequences through semantic effects, reality witnesses, commitments, authority, execution tickets, proof and settlement. This phase solves a different problem:

> **When many agents, models, tools, protocols and devices can act on the same reality, determine whether proposed consequences are equivalent, safely composable, conflicting, causally dependent, invalidating, compensating, superseding or cumulatively dangerous before authority is issued.**

This layer coordinates **real-world consequences**, not tool names.

### H2.0 Prior-art-aware research boundary

Do not claim novelty from any one of these ideas alone:

```text
semantic / commutativity-based concurrency control
intent locks
escrow / reservation transactions
Try-Confirm/Cancel
sagas / compensation
idempotency keys
causal consistency
invariant confluence
per-action agent authorization
session / temporal authorization policy
proof-of-execution / action certificates
```

These have substantial prior art in database systems, distributed systems, capability security, runtime verification and modern agent-security platforms.

Research anchors include:

- commutativity- and semantics-based concurrency control for abstract data types;
- escrow transaction methods for safe concurrent consumption of bounded resources;
- Sagas and compensating transactions for long-lived distributed workflows;
- invariant-confluence / coordination-avoidance work that asks when invariants permit safe concurrent execution without coordination;
- modern execution-time authorization and proof-of-execution work for AI agents;
- modern temporal agent policies that already enforce ordering, freshness and cumulative limits within a session.

Therefore the CIEAV research target is the **cross-system composition** enabled by the existing architecture:

```text
transport-independent reality identity
+ semantic effect identity across execution routes
+ multi-dimensional consequence footprints
+ invariant-aware composition
+ state-dependent consequence relations
+ live in-flight consequence graph
+ cross-route semantic idempotency
+ authority-bound semantic reservations
+ proofability admission
+ proof-closed causal progression
+ cumulative / anti-fragmentation policy across agents and sessions
+ one model spanning digital and physical effects
```

This is an engineering research thesis, not a legal novelty or patentability conclusion.

### H2.1 Canonical Reality Address

API identifiers, browser pages, CLI paths, database keys and device addresses that refer to the same real resource must be resolvable into one evidence-backed identity.

```text
RealityAddress {
    version
    namespace
    authorityDomain
    resourceKind
    stableId
    aliases[]
    parentRefs[]
    identityEvidenceRefs[]
    resolverId
    resolverVersion
}
```

Rules:

- alias/equivalence mapping must be deterministic or independently qualified;
- a model may propose an alias but cannot establish authoritative resource identity;
- ambiguous aliases remain unresolved rather than guessed;
- identity evidence and resolver version are auditable;
- stale identity evidence invalidates dependent mappings.

### H2.2 Multi-dimensional Consequence Footprint

A consequence must describe what it may touch beyond a single target string.

```text
ConsequenceFootprint {
    realityRead[]
    realityWrite[]
    create[]
    delete[]
    grant[]
    revoke[]

    authorityUse[]
    credentialUse[]
    budgetDeltas[]
    privacyExternalities[]
    proofDependencies[]

    invariantsTouched[]
    spatialRegion?
    temporalWindow?

    digest
}
```

Two actions may touch different resources yet still conflict because they consume the same authority budget, privacy budget, externality budget, credential quota, proof channel or physical space/time envelope.

### H2.3 Semantic Effect Identity and Consequence Equivalence Classes

`normalizedArgumentsDigest` identifies invocation arguments. It does not establish whether different routes produce the same real-world effect.

```text
SemanticEffectIdentity {
    version
    effectClass
    targetRealityRefs[]
    transitionShape
    normalizedDeltaDigest
    invariantContextDigest
    equivalenceScope
    resolverId
    resolverVersion
}
```

Example:

```text
provider API operation
browser operation
MCP operation
CLI operation
```

may belong to the same **Consequence Equivalence Class** when a qualified resolver establishes the same real transition.

This is the foundation for **cross-route semantic idempotency**.

### H2.4 Consequence Relation Algebra

For materialized consequences `A` and `B`, define a versioned relation against current reality:

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

Relations may be directional and state-dependent.

```text
A EQUIVALENT B
    different routes intend the same real-world transition

A COMMUTES B
    either admissible order preserves required invariants and equivalent settled state

A CONFLICTS B
    concurrent execution may violate an invariant or invalidate one transition

A REQUIRES B
    A may materialize only after B reaches a required proof-closed state

A INVALIDATES B
    A makes B's pre-state, proof plan, authority binding or expected effect stale

A SUPERSEDES B
    B is unnecessary / obsolete if A is proved

A COMPENSATES B
    A semantically compensates B but remains a separately governed consequence

A AGGREGATES_WITH B
    policy evaluates cumulative effect rather than each action independently
```

Hard rule:

```text
Potentially effectful overlap + UNKNOWN_RELATION
    → never assume independence
    → block, re-observe, resolve or escalate according to policy
```

Models may suggest candidate relations, but only deterministic or qualified relation results may participate in authority decisions.

### H2.5 Invariant Compatibility Witness

CIEAV should not serialize every overlapping consequence. It should coordinate only when required to preserve declared invariants.

Borrow the useful principle from invariant-confluence research and generalize it beyond database state.

```text
InvariantCompatibilityWitness {
    version
    consequenceRefs[]
    invariantRefs[]
    worldVersion
    compositionClass
    result: PRESERVES | REQUIRES_COORDINATION | VIOLATES | UNKNOWN
    basisDigest
    evidenceRefs[]
    resolverId
    resolverVersion
    authority: false
}
```

Possible invariants include:

```text
one active production revision
minimum remaining quota
maximum aggregate authority exposure
privacy disclosure limit
one exclusive lease-holder
robot separation distance
force / velocity envelope
geofence
proof-provider independence requirement
resource uniqueness
```

Rules:

- `PRESERVES` may permit safe parallelism subject to normal authority;
- `REQUIRES_COORDINATION` requires reservation/ordering;
- `VIOLATES` blocks;
- `UNKNOWN` fails closed for protected classes;
- models may propose candidate invariant reasoning but cannot issue the witness used for execution.

This makes the algebra more than a lock manager: it becomes **invariant-aware consequence composition**.

### H2.6 Algebraic composition operators

The term Consequence Algebra must correspond to executable composition semantics.

Initial operators:

```text
SEQUENCE(A, B)
    B waits for required proof-closed state of A.

PARALLEL(A, B)
    allowed only when relation + invariant rules establish admissible independence/commutativity.

ALTERNATIVE(A, B)
    alternative routes may satisfy one semantic consequence; settlement of one suppresses unnecessary alternatives.

COMPENSATE(A, B)
    B is a new governed consequence intended to compensate A.

RECONCILE(A)
    observe current reality for an unsettled consequence before any unsafe redispatch/alternate route.
```

Future formal work may define stronger partial-order and composition laws, but implementation starts with explicit deterministic contracts and qualification fixtures rather than decorative mathematics.

### H2.7 Active Consequence Graph

The historical Consequence Graph learns how reality tends to behave. CIEAV also needs a live control graph for what is happening now.

```text
ActiveConsequenceGraph {
    nodes[]
    relationEdges[]
    invariantWitnessRefs[]
    reservations[]
    causalFences[]
    unresolvedBarriers[]
    updatedAt
}
```

Node states may include:

```text
MATERIALIZED
RESERVED
AUTHORIZED
COMMITTED
DISPATCHED
OBSERVING
QUARANTINED
SETTLED_SUCCESS
SETTLED_FAILURE
SETTLED_UNKNOWN
CANCELLED
```

The graph must persist where restart could otherwise permit duplicate or conflicting execution.

### H2.8 Consequence Reservation

Before a protected consequence receives authority, CIEAV may reserve its semantic footprint.

A reservation is not execution authority.

```text
ConsequenceReservation {
    id
    consequenceRef
    semanticEffectRef
    footprintDigest
    invariantRefs[]
    realityVersion
    reservationClass
    ownerPrincipalRef
    rootIntentRef
    issuedAt
    expiresAt
    state
}
```

Candidate classes:

```text
EXCLUSIVE_EFFECT
COMMUTATIVE_EFFECT
READ_STABILITY
BUDGET
SPATIAL_TEMPORAL
CONTINUING_EFFECT
```

If dispatch may have occurred and settlement is `UNKNOWN`, reservation expiry must not silently reopen the semantic effect for duplicate execution. The state becomes an unresolved barrier/quarantine until reconciliation.

### H2.9 Generalized Unsettled Consequence Barrier

Existing `EffectQuarantine` is the foundation. Generalize it into relation-aware coordination.

When consequence `A` is unsettled:

```text
new B EQUIVALENT A
    → attach to reconciliation / observation of A
    → do not redispatch through another route

new B CONFLICTS A
    → block or escalate

new B INVALIDATES A
    → reconcile and rematerialize

new B REQUIRES A
    → hold behind a causal fence

new B INDEPENDENT / proven COMMUTES A
    → may proceed if all other gates pass

relation UNKNOWN
    → fail closed for protected classes
```

The barrier spans agents, sessions, models, MCP, A2A, API, browser, CLI, cloud adapters, devices and robots.

### H2.10 Proofability Admission and Proof Plan Reservation

Proof obligations already exist. The new admission question is whether the required proof path is credibly available before a protected action is authorized.

```text
consequence
    ↓
proof obligations
    ↓
proof-provider capability / health / permission / freshness check
    ↓
Proof Plan Reservation
    ↓
Authority / Commit
```

```text
ProofPlanReservation {
    id
    consequenceRef
    proofObligationDigest
    providerBindings[]
    providerVersionDigests[]
    requiredEvidenceClasses[]
    freshnessRequirements[]
    timeoutPolicy
    fallbackPolicy
    issuedAt
    expiresAt
    authority: false
}
```

This is not proof of success. If the proof path fails after dispatch, settlement remains `UNKNOWN`.

### H2.11 Causal Reality Fence

A dependent plan step must not advance merely because the previous tool call returned.

```text
CausalRealityFence {
    predecessorConsequenceRefs[]
    requiredOutcomes[]
    requiredRealityClaims[]
    minimumEvidenceClass
    maxEvidenceAgeMs
    fenceDigest
}
```

A dependent consequence crosses the fence only when required predecessor settlement and fresh reality claims exist and no unresolved contradicting consequence invalidates them.

### H2.12 Cross-route semantic idempotency

Distinguish request idempotency from semantic idempotency.

```text
request idempotency
    same transport request should not duplicate

semantic idempotency
    same real-world effect should not duplicate even through a different route
```

If API dispatch becomes `UNKNOWN` and a model attempts the same effect through browser, CLI or MCP, CIEAV must recognize the semantic match and reconcile before redispatch.

### H2.13 Cumulative consequence / anti-fragmentation policy

Per-call policy is insufficient because a model can decompose one prohibited/high-risk outcome into many individually admissible actions.

CIEAV must support policy over a composed consequence window.

Examples:

```text
many transfers below one approval threshold
    → one cumulative financial consequence

many small exports
    → cumulative disclosure/privacy consequence

multiple grants
    → aggregate privilege expansion

repeated infrastructure mutations
    → aggregate blast radius

staged robot motions
    → one path crossing a prohibited spatial boundary
```

Aggregation dimensions may include:

```text
principal / delegated authority root
root intent / objective
semantic effect class
target reality set
organization / tenant
time window
privacy / financial / authority / externality budget
```

Starting a new session, switching model/agent, changing tool protocol or splitting arguments must not reset cumulative policy when the same authority/principal/objective scope applies.

This goes beyond session-only temporal policy.

### H2.14 Relation Resolver architecture

Do not put an LLM in the final relation-admission path.

Initial resolver stack:

```text
canonical resource resolver
+ tool/domain-declared effect semantics
+ deterministic footprint overlap
+ declared invariants
+ static relation rules
+ state-dependent rule evaluation against fresh reality
+ qualified adapter-specific relation plugins
```

Learned components may later propose likely aliases, effect classes, relations, invariant risks or aggregation groups, but their output remains advisory until deterministic/qualified evidence establishes the decision used for authority.

Requirements:

- deterministic for identical versioned inputs;
- versioned and auditable;
- fail closed on protected ambiguity;
- distinguish `UNKNOWN_RELATION` from `INDEPENDENT`;
- support state-dependent commutativity;
- support hierarchical resources and physical/spatiotemporal footprints over time.

### H2.15 Scaling strategy

V1:

```text
single CIEAV node
persistent Active Consequence Graph
canonical resource ids for Git/filesystem/browser/cloud reference adapters
static + state-aware relation rules
declared invariants
semantic reservations
barriers / reconciliation
```

V2:

```text
multi-process / crash-recovery coordination
hierarchical resource selectors
relation indexes
Invariant Compatibility Witnesses
cumulative consequence aggregation
proofability admission
```

V3:

```text
federated / multi-node consequence coordination
physical spatiotemporal footprints
qualified learned relation suggestions
cross-device Active Consequence Graph replication
```

Do not introduce distributed consensus into V1 unless the deployment actually requires a multi-writer authority domain.

### H2.16 Required tests

- API/browser routes to same effect resolve `EQUIVALENT`
- different argument encodings of same effect deduplicate
- same tool against different canonical targets does not falsely deduplicate
- independent resources execute concurrently
- state-dependent commutative effects are admitted only in valid states
- conflicting effects from different agents are blocked
- parent-resource conflict with incompatible child mutation
- invariant-preserving concurrent composition succeeds
- invariant-breaking composition coordinates or blocks
- invariant `UNKNOWN` does not allow protected parallelism
- unresolved UNKNOWN blocks equivalent alternate route
- unresolved UNKNOWN blocks conflicting mutation
- safe independent action proceeds while unrelated effect is UNKNOWN
- `UNKNOWN_RELATION` never silently becomes `INDEPENDENT`
- stale RealityAddress evidence invalidates relation result
- malicious model cannot forge canonical identity or trusted relation
- reservation survives restart
- reservation expiry before dispatch releases safely
- reservation expiry after ambiguous dispatch does not enable duplicate effect
- reservation deadlock/livelock stress
- proof-required protected effect rejected when proof providers unavailable
- Proof Plan Reservation cannot be presented as outcome proof
- causal fence blocks dependent action after dispatch but before proof
- causal fence opens after qualified predecessor settlement
- compensation receives new authority
- sub-threshold actions aggregate into policy-relevant cumulative consequence
- session/agent/tool switching does not evade cumulative policy
- physical/spatiotemporal overlap simulation blocks unsafe concurrent actions
- Active Consequence Graph restores correctly after crash
- tampered relation/reservation/aggregation records are detected

### H2.17 Qualification metrics and hard gates

Track:

```text
critical false-equivalence violations
critical false-independence / missed-conflict violations
over-block / unnecessary serialization rate
semantic dedup precision / recall
relation resolution latency
UNKNOWN_RELATION rate
reservation contention / recovery
cross-route duplicate attempts suppressed
cross-route duplicate effects materialized
invariant-compatibility correctness
causal-fence correctness
proofability-admission correctness
fragmentation-evasion detection rate
active-graph crash recovery correctness
```

Hard gates:

```text
critical false-equivalence > 0 in protected qualification corpus
    → FAIL

critical false-independence / missed conflict > 0
    → FAIL

protected semantic duplicate materializes through alternate route
    → FAIL

UNKNOWN_RELATION silently treated as independent
    → FAIL

model output directly controls trusted relation/invariant witness
    → FAIL

cumulative policy bypass succeeds by session / agent / route switching
    → FAIL

causal fence opens without required proof
    → FAIL
```

### H2.18 Exit criteria

`ConsequenceAlgebraQualification = PASS` only when:

```text
canonical resources resolve across at least two heterogeneous execution routes
semantic equivalent effects are recognized independently of tool/protocol identity
relation decisions are deterministic / qualified and auditable
invariant-aware composition allows safe concurrency without weakening correctness
Active Consequence Graph persists in-flight state
conflicting effects are blocked before independent authority is issued
UNKNOWN consequences create relation-aware barriers
cross-route duplicates reconcile instead of blind redispatch
proofability admission is enforced for configured consequence classes
causal fences require proof-closed predecessor reality
cumulative policy detects fragmentation across sessions/agents/routes
crash/restart cannot erase protected reservations or unsettled barriers
models remain authority-free throughout relation/composition planning
```

This phase is not complete merely because a conflict graph, lock manager or temporal policy exists. The target is cross-system semantic consequence coordination under CIEAV's authority/proof semantics.

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

The ABI must expose enough normalized semantics for later Canonical Reality Address, Semantic Effect Identity and Consequence Footprint materialization. The ABI itself does not decide relation or authority.

### Exit criteria

Heterogeneous clients can all reach the same CIEAV consequence boundary.

---

## Phase J — Proof Provider Runtime

Providers:

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

Requirements include pre/post-state witnesses, evidence provenance, digest/signature where applicable, timeout/failure semantics, provider health, proofability/capability advertisement and zero authority.

### Exit criteria

Outcome settlement can be independently reproduced from provider evidence, and configured high-risk consequences can determine before execution whether a qualified proof path is presently available.

---

## Phase K — Authorized Outcome Trajectory

Build the full authority-grade settlement object with principal/agent/model identity, delegated authority, credential lease, permission graph, pre-state witness, exact operation/arguments, policy decision, Reality-Bound Commit, one-use ticket, execution correlation, post-state witness, SUCCESS/FAILURE/UNKNOWN, recovery evidence, consent/redaction/provenance and, where applicable, canonical reality / semantic effect / relation / reservation references.

Only explicitly qualified evidence classes may become agentic-RL data.

### Exit criteria

`AUTHORITY_BOUND_SETTLEMENT` trajectories pass cryptographic and semantic verification.

---

## Phase L — Intelligence Metabolism

Verified experience is routed into:

```text
memory
epistemic update
Consequence Graph
consequence-relation statistics
semantic-effect / route reliability
SFT
DPO/KTO
GRPO/RLVR
offline RL
distillation
skill candidate
```

Not every experience becomes training data. Model assertions of equivalence/conflict/invariant compatibility are not training truth by themselves.

### Exit criteria

Learning eligibility is deterministic, provenance-aware and consent/redaction-aware.

---

## Phase M — CIEAV Model Family

Do not train a foundation model from scratch initially.

Roles:

```text
CIEAV Router
CIEAV Core Reasoner
CIEAV Proof Planner
CIEAV Recovery Model
CIEAV Consequence Model
CIEAV Critic / Reward Models
```

CIEAV-owned models use the same Application Model Gateway and do not receive privileged authority.

The Consequence Model may eventually suggest effect identities, footprints, relations or invariant risks, but those suggestions remain advisory until accepted by deterministic / qualified Consequence Algebra logic.

Initial approach: shared open-weight backbone + PEFT/LoRA where practical.

Framework stack may include PyTorch, Transformers, PEFT, TRL, isolated agent environments, TorchRL/RLlib, verl/Ray/FSDP2, vLLM/SGLang and graph tooling when evidence scale justifies it.

Every checkpoint begins `TRAINED_UNQUALIFIED`, `authority=false`, `productionAuthority=false`, `promotionExecuted=false`.

### Exit criteria

CIEAV-owned models beat deterministic/provider baselines on held-out consequence-quality tasks without violating hard gates.

---

## Phase N — Agentic RL Environments

Required environments include Git, Browser, Filesystem, Database, Cloud, Permission, Credential, UnknownOutcome, DuplicateExecution, Recovery, StaleReality, ApplicationTool, ContextPrivacy, ApprovalBoundary, EquivalentEffect, ConsequenceConflict, CrossRouteUnknown, Reservation, CausalFence, FragmentationEvasion, InvariantCompatibility and ProofabilityAdmission environments.

Rewards include verified success, proof completeness, calibration, minimum authority, reversibility, recovery correctness, policy compliance, correct tool/effect/relation reasoning, context minimization, cost and latency.

Strong penalties include false success, duplicate consequence, excess privilege, blind UNKNOWN retry, stale-world action, tool escalation, privacy violation, approval bypass, false independence/equivalence, invariant-unsafe parallelism, fragmentation evasion and causal-fence bypass.

### Exit criteria

Training is reproducible in isolated environments and cannot touch production credentials or authority.

---

## Phase O — Verified Skills

Lifecycle:

```text
verified trajectories
→ pattern candidate
→ Skill Compiler
→ typed candidate skill
→ sandbox
→ failure injection
→ authority validation
→ consequence-relation / invariant validation
→ proof validation
→ recovery validation
→ deterministic qualification
→ VERIFIED SKILL
```

Verified Skills must declare semantic effect / footprint metadata sufficient for Consequence Algebra and cannot bypass active reservations/barriers/fences.

The compiler cannot promote or install its own skill.

---

## Phase P — Reflex Layer

Critical reflexes remain local, deterministic, low latency, fail-safe, auditable and separately qualified.

Examples include robot proximity stop, credential exfiltration block, protected filesystem deny, critical policy deny and critical active-consequence conflict deny.

---

## Phase Q — Continuing Authority

```text
authorize
→ reserve/register active consequence where required
→ begin execution
→ continuously observe required conditions
→ continue while valid
→ revoke/stop/safe-state when invalid
→ settle / release or quarantine active consequence state
```

Continuing effects expose temporal/spatial footprints when needed so Consequence Algebra can coordinate them against other active effects.

### Exit criteria

Long-running execution stops safely when authority-relevant reality changes.

---

## Phase R — Autonomy Budgets

Generalize permissions into measurable capacity:

```text
financial
privacy
authority
irreversibility
energy
force
spatial
time
uncertainty
externality
model-call
tool-call
```

Budgets must aggregate across semantically related consequences so decomposition or route/session switching cannot evade cumulative limits.

---

## Phase S — ROS / Robot Adapter

Requirements include robot/device identity, Consequence ABI normalization, canonical physical resource identity, spatial/temporal footprint, active-conflict detection, cancellable tracking, telemetry, reflex stop, continuing authority, safe-state transition and watchdog compatibility.

### Exit criteria

A simulated robot can receive a CIEAV-governed action, prove completion/UNKNOWN, stop on violated continuation conditions, and prevent incompatible concurrent actions from independently receiving authority.

Physical claims require separate hardware qualification.

---

## Phase T — CIEAV Edge

Edge responsibilities include device identity, local policy, authority verification, attestation evidence, privacy, local reflexes, offline envelope, signed consequence journal, active consequence/reservation summary where required and safe degradation.

### Exit criteria

Edge node can safely operate under network loss without obtaining new authority beyond its predelegated envelope.

---

## Phase U — Device Trust / Onboarding

Evaluate TPM 2.0, Secure Enclave, Windows TPM, FIDO Device Onboard, Matter device attestation and platform-specific providers.

### Exit criteria

Device identity and attestation claims are explicit, verifiable and platform-specific rather than simulated.

---

## Phase V — Cognitive Morphogenesis

```text
experience
→ recurring cognitive architecture
→ candidate adapter/model/skill/agent/relation rule
→ sandbox
→ qualification
→ optional promotion
```

No self-modification path bypasses deterministic qualification. Learned relation rules remain candidates until explicitly qualified and promoted.

---

# 5. Product integrations

## AI-native applications

```text
product UI/API
→ domain service
→ CIEAV Application Agent
→ Context Builder
→ Model Gateway
→ controlled ToolProposal
→ Consequence ABI
→ Consequence Algebra / active checks
→ Authority / Approval
→ trusted adapter
→ proof + audit
```

## Coding tools / agents

```text
coding agent
→ MCP / CLI / local adapter
→ CIEAV
→ Consequence ABI / Algebra
→ filesystem / Git / shell / Cloud
```

Different agents/routes targeting the same repository state should converge on the same canonical reality/effect rules where qualified.

## General agents

```text
A2A / MCP / remote agent
→ CIEAV adapter
→ Consequence ABI
→ Consequence Algebra
```

## Robots

```text
robot planner
→ ROS 2
→ CIEAV ROS adapter
→ Consequence Algebra / reservation
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
Historical Consequence Graph Store
Active Consequence Graph Store
Canonical Reality Address Registry
Semantic Effect / Equivalence Registry
Consequence Relation Registry
Invariant Registry
Consequence Reservation Store
Proof Plan Reservation Store
Consequence Aggregation Ledger
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

Persist enough trusted state to prevent restart/process failure from erasing coordination. An ambiguous dispatched consequence must not become executable again because an in-memory reservation disappeared.

Do not persist provider secrets. Raw prompt/response retention requires explicit classification, encryption where needed and retention policy.

General requirements: versioned schemas, migrations, crash consistency, corruption detection, backup/restore, retention and protected secret handling.

---

# 7. Observability

Required metrics include gateway/provider/model/cell/application/domain/tool health; context/privacy failures; model latency/cost; tool proposals; canonical-reality resolution failures; relation latency; `UNKNOWN_RELATION`; semantic equivalent detections; cross-route duplicate attempts suppressed; active graph size; unresolved/quarantined count; reservation contention; invariant-compatibility results; causal-fence waits; proofability rejects; fragmentation/cumulative-policy blocks; proof/settlement latency; UNKNOWN rate; authority rejections; ticket replay; credential lease failures; recovery outcomes; historical graph coverage; epistemic stale/contradiction counts; and model/skill qualification status.

Logs must be secret-redacted and provenance-bearing.

---

# 8. Security validation

Required before final production qualification:

- threat model
- privilege-boundary review
- dependency/SBOM review
- secret scanning
- parser/protocol fuzzing
- replay/forgery testing
- local privilege escalation review
- notification activation spoofing
- MCP/A2A trust-boundary tests
- provider sandbox / prompt-injection isolation
- malicious tool/provider tests
- application-agent tool escalation
- provider credential isolation
- cross-session/context leakage
- remote-model privacy boundary
- model spoofing of proof/approval/authority refs
- Canonical Reality Address alias poisoning/collision
- semantic effect identity spoofing
- relation/invariant resolver manipulation
- `UNKNOWN_RELATION` fail-closed behavior
- cross-route duplicate bypass
- reservation deadlock/livelock/starvation
- ambiguous-dispatch reservation expiry
- Active Consequence Graph tamper/crash recovery
- Proof Plan Reservation spoof/stale provider
- causal-fence bypass
- fragmentation/salami-slicing policy evasion
- agent/session/tool switching cumulative-budget bypass
- multi-agent conflicting consequence tests
- physical spatiotemporal conflict tests before robot qualification
- compromised device/cell revocation
- supply-chain/release signing review
- independent security assessment

Hostile retrieved text must not be able to forge semantic equivalence, suppress conflict, bypass invariant checks, bypass causal fences, fragment effects below thresholds, weaken approval or reinterpret UNKNOWN as success.

---

# 9. Release engineering

A production release requires signed installers/packages as applicable, reproducible build evidence where practical, SBOM, signed release metadata, migration/upgrade/rollback/uninstall/startup/clean-machine tests, application-agent qualification, Consequence Algebra qualification, model-provider compatibility and privacy/tool-boundary negative tests.

No final production claim until real signing identities and supported-platform installer tests exist.

---

# 10. Qualification matrix

## Deterministic local qualification

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

Must include provider identity/health, privacy compatibility, context provenance/minimization/isolation, structured output validation, tool/operation/schema enforcement, read permission, effect→Consequence ABI, approval binding, credential isolation, timeout/budget behavior, prompt-injection escalation, fake proof/approval rejection, UNKNOWN recovery and audit correlation.

## Consequence Algebra qualification

Must include:

```text
canonical identity across heterogeneous routes
alias ambiguity rejection
semantic effect equivalence / non-equivalence
multi-dimensional footprint derivation
relation determinism / versioning
state-dependent commutativity
conflict / dependency / invalidation
Invariant Compatibility Witness correctness
Active Consequence Graph crash recovery
reservation compatibility / expiry / restart
unsettled barriers
cross-route semantic idempotency
proofability admission
causal reality fences
cumulative / anti-fragmentation policy
physical/spatiotemporal conflict simulation
relation-result tamper detection
model inability to authorize relation/invariant decisions
```

Hard gates:

```text
critical false-equivalence
critical false-independence / missed conflict
protected cross-route duplicate materializes
UNKNOWN_RELATION silently becomes independent
ambiguous dispatched consequence loses barrier after restart
invariant-unsafe parallelism is admitted
causal fence opens without required proof
fragmentation bypasses cumulative policy
model output becomes trusted relation/invariant result without qualification
```

Any protected hard-gate violation → `FAIL`.

## Model qualification

Must include held-out tasks, false-success, UNKNOWN calibration, authority efficiency, proof/recovery quality, duplicate-effect rate, semantic-effect/relation reasoning as advisory intelligence, policy violations, privacy compliance, cost and latency.

## Hardware / robot / edge qualification

Hardware-backed claims require physical runners. Robot qualification proceeds simulation → hardware-in-loop → constrained physical tests and includes concurrent/conflicting action tests. Edge qualification includes battery/network-loss/offline/fault tests on real devices.

---

# 11. GitHub engineering workflow

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

Issues must identify problem, trust boundary, runtime contract, failure semantics, acceptance criteria, tests and external blockers.

Changes to Application Agent, Model Gateway, Tool Registry, Consequence ABI, Consequence Algebra, Canonical Reality resolver, relation/invariant rules, Active Consequence Graph, Authority Kernel, trusted adapters, proof semantics or credential boundary are security-boundary changes.

Relation/invariant rule changes require regression replay over qualification fixtures because additional concurrency may introduce false-independence risk.

No issue is complete merely because a scaffold/interface exists.

---

# 12. Definition of Done

A subsystem is not done when only types, placeholders, mocks, documentation, demos or one successful model/tool call exist.

Done requires runtime implementation, real data, failure handling, persistence where needed, negative tests, enforced security boundaries, observability, migration/upgrade behavior and qualification evidence.

For application-agent/domain integrations, Done also requires authoritative source-of-truth identification, context provenance/privacy, replaceable provider, zero model authority, explicit tool surface, read permission, effectful Consequence ABI crossing, bound approval where required, trusted execution, SUCCESS/FAILURE/UNKNOWN proof and complete audit correlation.

For Consequence Algebra integrations, Done additionally requires:

```text
canonical resources or explicit ambiguity
materialized footprint
versioned semantic effect identity
deterministic / qualified relations
declared invariants and compatibility semantics where relevant
persistent active state
fail-closed equivalence/conflict/unknown behavior
reservation/barrier behavior
proofability behavior for protected effects
causal fences for dependent effects
cumulative policy resistant to session/route switching
false-equivalence / false-independence / invariant-negative qualification
```

External claims additionally require real external evidence.

---

# 13. Immediate execution order

```text
1. native actionable approval
2. production-grade Epistemic Store/indexing
3. production-grade historical Consequence Graph Store/indexing
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
15. Canonical Reality Address registry + qualified resolver foundation
16. Semantic Effect Identity + Consequence Footprint contracts
17. deterministic Consequence Relation Resolver
18. invariant registry + Invariant Compatibility Witness
19. persistent Active Consequence Graph
20. Consequence Reservations + generalized Unsettled Consequence Barrier
21. Proof Provider implementations / capability-health contracts
22. Proofability Admission + Proof Plan Reservations
23. Causal Reality Fences + cross-route semantic idempotency
24. cumulative consequence / anti-fragmentation policy
25. Application Agent API + propose-and-approve workflow
26. application-agent + consequence-algebra audit/telemetry
27. full authority-grade Authorized Outcome Trajectory
28. MCP/A2A universal Consequence ABI adapters
29. Intelligence Metabolism pipeline
30. CIEAV model-family training environments
31. Verified Skill compiler + deterministic qualification
32. Reflex Layer
33. Continuing Authority
34. Autonomy Budgets
35. ROS 2 adapter + physical consequence footprints
36. CIEAV Edge runtime
37. device onboarding/attestation integrations
38. installer/release/security qualification
```

### Application-agent dependency order

```text
contracts
→ provider registry
→ privacy checks
→ context builders
→ domain agents
→ tool registry
→ structured proposals
→ read-only runtime
→ Consequence ABI bridge
→ approval bridge
→ trusted execution
→ proof/settlement correlation
→ telemetry/audit
→ provider adapters
→ domain reference workflows
→ qualification
```

### Consequence Algebra dependency order

```text
Canonical Reality Address
→ evidence-backed alias resolver
→ Semantic Effect Identity
→ Consequence Footprint
→ relation enums / versioned relation result
→ deterministic relation rules
→ invariant registry / compatibility witnesses
→ held-out relation/invariant fixtures
→ persistent Active Consequence Graph
→ semantic reservations
→ unsettled barriers
→ cross-route semantic idempotency
→ proofability admission
→ Proof Plan Reservation
→ Causal Reality Fence
→ cumulative aggregation ledger
→ anti-fragmentation policy
→ multi-agent / crash / race qualification
→ physical spatiotemporal extensions
```

Do not start with a learned relation model. Establish deterministic semantics and a held-out qualification corpus first.

Each phase must preserve the constitutional authority boundary.

---

# 14. Long-term target

The finished CIEAV experience should allow a user or organization to provide an objective while CIEAV dynamically assembles intelligence and embodiment:

```text
objective
→ select domain/application agent when appropriate
→ choose/compose cognition
→ retrieve permission-bounded live context
→ inspect live reality / memory / simulation
→ select model/provider under privacy/cost/latency constraints
→ choose controlled tools / Verified Skills
→ produce answer or zero-authority proposal
→ normalize effectful proposals into consequences
→ resolve canonical reality identity
→ materialize semantic effect + multi-dimensional footprint
→ compare against active consequences
→ evaluate equivalence / conflict / causality / invariants / aggregation
→ reserve consequence footprint where required
→ establish proofability / causal fences where required
→ acquire minimum delegated authority
→ obtain human approval when required
→ commit exact action
→ execute through trusted software/device/robot adapter
→ continuously validate required conditions
→ prove what happened
→ release reservation or quarantine unresolved consequence
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
CONSEQUENCE RELATION MODEL AUTHORITY = 0
LEARNING AUTHORITY = 0
```

The long-term architecture is not:

```text
LLM + prompt + direct database/tool credentials
```

It is:

```text
LIVE REALITY
      ↓
DETERMINISTIC DOMAIN / SYSTEM SERVICES
      ↓
PERMISSION-BOUND CONTEXT
      ↓
CIEAV APPLICATION AGENT / CORTEX
      ↓
MODEL GATEWAY
      ↓
REASONING + CONTROLLED TOOL PROPOSALS
      ↓
CONSEQUENCE ABI / MATERIALIZATION
      ↓
CANONICAL REALITY + SEMANTIC EFFECT IDENTITY
      ↓
CONSEQUENCE ALGEBRA
  equivalence · conflict · causality · invariants · aggregation
      ↓
ACTIVE CONSEQUENCE GRAPH
  reservation · barrier · proofability · causal fence
      ↓
CONSEQUENCE / AUTHORITY / APPROVAL
      ↓
TRUSTED EXECUTION
      ↓
PROOF / SETTLEMENT / AUDIT
      ↓
VERIFIED LEARNING
```

The defining research direction is:

> **CIEAV coordinates autonomous systems by the real-world consequences they can create, not merely by the tool calls they issue.**

A mature CIEAV should recognize when different agents using different protocols attempt the same consequence, when separate-looking actions conflict or aggregate into one dangerous outcome, when independent effects may safely proceed without unnecessary serialization, and when dependent actions must wait for proof of reality rather than trust prior tool responses.

That is the production target for CIEAV.