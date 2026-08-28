# CIEAV Production Execution Plan

## Universal Intelligence Substrate + Universal Consequence / Tool Trust Layer

This document is the canonical production roadmap for CIEAV.

CIEAV is not a tool-calling proxy, agent framework, model router, browser wrapper, MCP server, approval gateway, workflow engine, or integration marketplace. It is the **Commit Layer for autonomous computing**: a persistent, model-independent substrate that converts proposed actions from models, agents, software, cloud systems, desktop applications, browsers, devices and robots into governed, observable, durable and provable real-world state transitions.

The product experience remains:

> **Installed, not opened. Visible only when reality requires attention.**

The central architectural rule is:

> **Applications and protocols are execution routes. Consequences are the unit of coordination. Authority remains local and deterministic.**

---

# 1. Constitutional invariants

These are release blockers.

```text
NO MODEL CAN MINT AUTHORITY.
NO AGENT CAN MINT AUTHORITY.
NO ROUTER CAN MINT AUTHORITY.
NO APPLICATION AGENT CAN MINT AUTHORITY.
NO MODEL PROVIDER CAN MINT AUTHORITY.
NO TOOL DESCRIPTION CAN MINT AUTHORITY.
NO TOOL PROPOSAL CAN MINT AUTHORITY.
NO EXTERNAL TOOL ANNOTATION CAN DEFINE TRUSTED CONSEQUENCE SEMANTICS.
NO DISCOVERED MCP / A2A / OPENAPI / CONNECTOR TOOL IS QUALIFIED BY DISCOVERY ALONE.
NO MEMORY SYSTEM CAN MINT AUTHORITY.
NO TRAINING JOB CAN MINT AUTHORITY.
NO CANDIDATE MODEL CAN PROMOTE ITSELF.
NO SKILL COMPILER CAN QUALIFY ITS OWN OUTPUT.
MODEL OUTPUT IS NEVER OBSERVED REALITY.
TOOL OUTPUT IS NOT AUTOMATICALLY OBSERVED REALITY.
COMMITTED IS NOT SUCCESS.
UNKNOWN MUST NEVER BE SILENTLY MAPPED TO SUCCESS OR FAILURE.
RECOVERY / UNDO / COMPENSATION ARE NEW GOVERNED CONSEQUENCES.
EFFECTFUL EXECUTION MUST CROSS CONSEQUENCE ALGEBRA + AUTHORITY + COMMIT.
EQUIVALENT REAL-WORLD CONSEQUENCES MUST NOT EXECUTE TWICE THROUGH DIFFERENT ROUTES.
UNSETTLED / UNKNOWN CONSEQUENCES MUST BLOCK OR RECONCILE EQUIVALENT OR CONFLICTING FOLLOW-ON EFFECTS.
POLICY MUST EVALUATE COMPOSED AND CUMULATIVE CONSEQUENCES, NOT ONLY INDIVIDUAL TOOL CALLS.
A CHANGE IN QUALIFIED TOOL SEMANTICS OR EXECUTABLE IDENTITY INVALIDATES PREVIOUS AUTHORITY.
```

External tool metadata may help discovery and UX. It does not establish trusted effect class, risk, idempotency, proof semantics, privacy externality, canonical identity, reversibility, or authority.

---

# 2. Product target

The production path is:

```text
USER / AGENT / AUTOMATION OBJECTIVE
        ↓
INTELLIGENCE / DOMAIN ORCHESTRATION
        ↓
ZERO-AUTHORITY TOOL PROPOSAL
        ↓
UNTRUSTED TOOL DISCOVERY PLANE
  MCP · A2A · OpenAPI · SaaS connectors · computer use · native apps
        ↓
CIEAV TOOL TRUST KERNEL
  qualified manifest
  exact argument schema
  trusted semantic compiler
  canonical reality resolver
  consequence-bundle compiler
  privacy/data-flow contract
  duplicate/idempotency contract
  proof/reconciliation contract
  recovery/compensation contract
  artifact/runtime identity binding
        ↓
CONSEQUENCE BUNDLE / MATERIALIZATION
        ↓
CANONICAL REALITY REGISTRY
        ↓
CONSEQUENCE ALGEBRA + ACTIVE CONSEQUENCE GRAPH
        ↓
POLICY + PERMISSIONS + LOCAL AUTHORITY
        ↓
REALITY-BOUND COMMIT
        ↓
ONE-USE EXECUTION TICKET
        ↓
QUALIFIED TRUSTED ADAPTER
        ↓
REAL SOFTWARE / CLOUD / DEVICE / ROBOT
        ↓
INDEPENDENT PERCEPTION / PROOF
        ↓
OBSERVED_SUCCESS / OBSERVED_FAILURE / UNKNOWN
        ↓
SETTLEMENT / RECOVERY / AUDIT / LEARNING
```

CIEAV should be able to sit beneath native integrations, MCP/A2A, OpenAPI, external connector platforms, browser/computer-use systems, desktop automation, CLI, databases, cloud APIs, ROS2/MQTT and future execution ecosystems. CIEAV should not attempt to win primarily by manually owning every integration. It should own the **trusted semantic and commit boundary** beneath those integrations.

---

# 3. Current engineering truth

## 3.1 Proven foundations inherited by this branch

The branch `feat/trusted-tool-consequence-contract` is based on the authority-state hardening head `08ef7b5b41b618703e526ac4023116bbb09ff057`.

At that base head, user-local evidence established:

```text
build:api                                      PASS
static authority deployment gate              PASS
test:authority-state                           9 files / 51 tests PASS
release:qualify:authority-state                PASS
mssql 12.7.0 packaging/integrity               PASS
singleTransactionCrossStoreCommitTested        true
ISSUE_TICKET single SQL transaction            true
CONSUME_TICKET single SQL transaction          true
UNKNOWN five-store SQL transaction             true
SQL atomic rollback test                       true
```

These are **offline/local exact-head qualification facts**. They are not evidence of production SQL listener activation, Always On failover, network partition qualification, production authority or execution-authority issuance.

Production truth remains fail closed:

```text
productionSqlServerRuntimeActivated = false
externalClusterFailoverTested       = false
networkPartitionTested              = false
clusterHaQualified                  = false
authority                           = false
mayMintExecutionAuthority           = false
executionAuthorityIssued            = false
```

## 3.2 Tool-trust implementation now present on this branch

The branch also contains initial additive implementation for a trusted tool consequence contract and deterministic validation:

```text
7058f12  Add trusted tool consequence contracts
a9d0bc9  Enforce trusted tool consequence contracts
f6fc121  Test trusted tool consequence contract enforcement
```

The current validator can constrain declared effect classes, target binding/prefixes, required semantic attributes, duplicate semantics and canonical resolver identity/version, while preserving `authority=false`.

This work is **not yet a completed Tool Trust Kernel**. In particular:

- `CieavExecutionFabricStore.authorize()` is not yet required to bind and persist the trusted tool-contract result;
- ticket issuance/consumption does not yet bind the exact contract/compiler/resolver/artifact digests;
- one `ExecutionProposal.semanticEffect` still cannot faithfully represent all multi-effect application actions;
- canonicalization still needs qualified cross-adapter resolver implementations;
- the new branch has not yet received a new full local authority/tool qualification run after the tool-contract commits.

## 3.3 Existing Consequence Algebra foundations

Current contracts/core/store already provide substantial foundations for:

```text
RealityAddress
SemanticEffectIdentity
ConsequenceFootprint
ConsequenceMaterialization
relation vocabulary
trusted relation rules
Invariant Compatibility Witness
Active Consequence Graph
Consequence Reservation
Proof Plan Reservation
Causal Reality Fence
aggregation ledger/policy
UNKNOWN quarantine/reconciliation
persistent authenticated state
startup recovery
```

Existing tests cover route-independent semantic comparison after normalization, same-reality conflicts, trusted advanced relation classes, independent concurrency, reconciliation, cumulative budgets, proofability, invariants, persistent reservations, tamper rejection, UNKNOWN reconciliation and causal fences.

The remaining hard problem is not merely more relation enums. It is **trusted universal materialization from arbitrary real software into those primitives**.

---

# 4. P0 program — Universal Tool Trust Kernel

This program is now a prerequisite for broad adapter expansion.

## 4.1 Separate discovery from qualification

Two distinct representations are required:

```text
ExternalToolDescription
  source = MCP | A2A | OPENAPI | CONNECTOR | COMPUTER_USE | NATIVE | OTHER
  provider metadata
  display description
  provider annotations
  provider schemas
  trust = UNTRUSTED_DISCOVERY
  authority = false
```

and:

```text
QualifiedToolManifestV1
  CIEAV-owned / verified semantics
  trustState
  exact version identities
  authority = false
  mayMintExecutionAuthority = false
```

External descriptions may never silently become qualified manifests.

Tool lifecycle:

```text
DISCOVERED
  ↓
UNTRUSTED
  ↓
VERIFIED
  ↓
QUALIFIED
  ↓
ACTIVE
  ↓
SUSPENDED / REVOKED / SUPERSEDED
```

Any material tool change returns the tool to an unqualified or superseded state until requalification succeeds.

## 4.2 `QualifiedToolManifestV1`

Minimum target contract:

```text
QualifiedToolManifestV1 {
    manifestId
    manifestVersion

    toolId
    providerId
    applicationId
    adapterId
    operationId

    argumentSchema
    resultSchema?

    readOnly
    consequenceCapable
    allowedEffectClasses[]

    semanticCompilerId
    semanticCompilerVersion
    semanticCompilerDigest

    canonicalResolverId
    canonicalResolverVersion
    canonicalResolverDigest

    consequenceBundleCompilerId
    consequenceBundleCompilerVersion
    consequenceBundleCompilerDigest

    duplicateSemantics
    idempotencyContract

    proofContract
    reconciliationContract
    recoveryContract
    compensationContract?

    dataCategories[]
    privacyBoundary
    dataFlowPolicy

    riskPolicy
    permissionRequirements
    approvalPolicy

    adapterArtifactDigest
    provenanceRefs[]
    runtimeIdentityRequirements[]

    validFrom
    validUntil?
    supersedes?
    revokedAt?

    authority: false
    mayMintExecutionAuthority: false
}
```

The manifest is CIEAV-owned trust metadata. Models/providers may propose candidate values but cannot qualify them.

## 4.3 Invocation semantics must be derived, not trusted from the agent

The model/agent may propose:

```text
ToolProposal {
    toolId
    operation
    target?
    arguments
    normalizedArgumentsDigest
    requestedOutcome
    modelSuggestedSemantics?
    authority: false
}
```

Production authority uses semantics derived by qualified code:

```text
ToolProposal
   ↓
argument validation
   ↓
QualifiedToolManifest
   ↓
trusted semantic/bundle compiler
   ↓
canonical resolver
   ↓
CIEAV consequence materialization
```

A model-provided `semanticEffect` becomes an assertion to compare against trusted materialization, not the authority-bearing source of truth.

Mismatch for a protected/effectful operation → `BLOCK`.

## 4.4 Replace single-effect assumption with Consequence Bundle

A universal application action may cause multiple state transitions. Example: a purchase may simultaneously create an order, transfer value, disclose data, change inventory and create future cancellation/refund obligations.

Introduce:

```text
ConsequenceBundleV1 {
    bundleId
    invocationDigest
    manifestDigest

    primaryEffects[]
    secondaryEffects[]
    conditionalEffects[]
    deferredEffects[]

    dependencies[]
    atomicityGroups[]
    privacyExternalities[]
    budgetDeltas{}
    proofDependencies[]
    recoveryEdges[]

    bundleDigest
    authority: false
}
```

Each effect receives canonical reality identity, semantic identity and footprint. Algebra evaluates both individual effects and bundle-level composition/invariants.

Compatibility bridge: legacy single-effect proposals may map to a one-effect bundle but are not sufficient evidence that an arbitrary external tool is production-qualified.

## 4.5 Canonical Reality Resolver Registry

The current system must evolve from “hash an already-normalized target” to independent, evidence-backed cross-adapter identity resolution.

Required interface:

```text
CanonicalRealityResolver {
    id
    version
    digest
    supportedNamespaces[]
    resolve(routeNativeIdentity, context) -> RealityResolution
    verify(resolution, evidence) -> boolean
    authority: false
}
```

Resolution output must contain:

```text
canonicalRealityAddress
routeAliases[]
identityEvidenceRefs[]
confidenceClass
ambiguityState
resolver identity/version/digest
```

Protected operations fail closed on unresolved ambiguity.

Qualification must prove that genuinely different identifiers converge correctly, for example:

```text
browser URL
REST resource ID
MCP object ID
desktop application object
CLI path
vendor-specific opaque ID
        ↓
ONE canonical reality address
```

Do not call a test “cross-route canonicalization” when every route was given the same pre-normalized target string.

## 4.6 Tool semantics are versioned supply-chain material

Authority must bind:

```text
toolManifestDigest
semanticCompilerDigest
bundleCompilerDigest
canonicalResolverDigest
adapterArtifactDigest
runtimeIdentityDigest / attestation when required
proofContractDigest
recoveryContractDigest
```

If any bound digest changes before dispatch:

```text
INVALIDATE TICKET / COMMIT
→ rematerialize
→ rerun Algebra
→ rerun policy/approval/authority
```

Where appropriate, provenance/attestation may use SLSA/Sigstore-class artifact evidence, package integrity, signed manifests, OS signing, TPM/Secure Enclave, mTLS or SPIFFE-like workload identity. No particular external standard is mandatory; the CIEAV contract must support equivalent cryptographically verifiable evidence.

## 4.7 Runtime identity binding

A qualified manifest is insufficient if an unqualified process can consume its ticket.

Target runtime binding:

```text
Qualified manifest
  + expected adapter artifact
  + actual running workload identity
  + device/process identity
  + one-use ticket
  = dispatch eligibility
```

Supported evidence classes may include:

```text
LOCAL_PROCESS
SIGNED_EXECUTABLE
PACKAGE_DIGEST
CONTAINER_IMAGE_DIGEST
MTLS_WORKLOAD
SPIFFE_LIKE_WORKLOAD
TPM
SECURE_ENCLAVE
REMOTE_PROVIDER_ATTESTATION
```

Exact requirements are tool/risk specific.

## 4.8 Tool Proof Contract

Every protected effectful operation must specify how reality can be observed independently enough to settle it.

```text
ToolProofContract {
    providerBindings[]
    successClaims[]
    failureClaims[]
    unknownConditions[]
    evidenceClasses[]
    independenceRequirements
    freshnessRequirements
    timeoutPolicy
    reconciliationProcedure
    negativeProofCapability
    authority: false
}
```

Rules:

- transport `200 OK` is not automatically `OBSERVED_SUCCESS`;
- tool-returned text is not automatically proof;
- timeout does not imply failure;
- missing proof → `UNKNOWN` where outcome cannot be established;
- UNKNOWN retry follows the operation-specific duplicate/reconciliation contract.

## 4.9 Recovery / compensation contract

Every effectful tool must explicitly classify:

```text
REVERSIBLE
COMPENSABLE
IRREVERSIBLE
UNKNOWN_REVERSIBILITY
```

and bind a recovery contract where available.

Undo/compensation may execute only after observed success or other policy-qualified evidence proving the prerequisite reality. Recovery itself must pass Tool Trust Kernel → Algebra → Authority.

## 4.10 Data-flow and instruction-taint semantics

Tool results can carry hostile instructions, sensitive data or untrusted external content. CIEAV needs a data-flow trust model independent of prompt filtering.

Required labels include:

```text
source identity
origin trust
observed vs model-generated
data category
privacy class
instruction trust
allowed sinks
retention/redaction policy
```

Example invariant:

```text
EXTERNAL_UNTRUSTED content
must not cause
CONFIDENTIAL / CREDENTIAL data → EXTERNAL sink
without independent authorized policy path.
```

Taint/provenance must survive model summarization and multi-tool hops when authority-relevant.

## 4.11 Commit Point Interceptor for browser/desktop/computer use

UI automation cannot treat `click(x,y)` as the consequence.

Target path:

```text
UI observation
  ↓
application semantic state
  ↓
commit-point detection
  ↓
qualified consequence bundle
  ↓
Algebra + Authority
  ↓
permit exactly the bound effectful transition
  ↓
post-state observation
```

Commit points include actions such as:

```text
Send
Submit
Purchase
Transfer
Delete
Publish
Share
Grant
Deploy
Save/Overwrite
Sign/Accept
Start physical motion
```

Selectors/coordinates are execution mechanics, not consequence identity.

## 4.12 Qualification modes

Every adapter/tool integration should support explicit modes where feasible:

```text
OBSERVE_ONLY
  discover/materialize/log; never issue execution authority

SHADOW
  evaluate what CIEAV would admit/block/reconcile without controlling execution

ENFORCE
  protected effectful execution must present valid CIEAV authority
```

Promotion to `ENFORCE` requires qualification evidence for the exact manifest/compiler/resolver/adapter versions.

## 4.13 Adapter Qualification SDK

Do not manually hand-qualify every integration with ad hoc logic.

Build a CIEAV Adapter Qualification SDK that accepts fixtures and fault-injection scenarios and emits machine-readable evidence for:

```text
argument schema correctness
semantic under-description attempts
canonical alias resolution
false equivalence
false independence
bundle completeness
privacy/data-flow externalities
duplicate/idempotency behavior
UNKNOWN reconciliation
proof availability and freshness
recovery/compensation
manifest drift
adapter artifact drift
runtime identity mismatch
restart/crash behavior
```

Community/vendor adapters remain `UNTRUSTED` until their exact version passes the required profile.

---

# 5. Consequence Algebra completion program

Consequence Algebra remains the semantic coordination core after trusted materialization.

## 5.1 Required primitives

```text
Canonical Reality Address
Semantic Effect Identity
Consequence Bundle
Consequence Footprint
Consequence Relation Result
Invariant Compatibility Witness
Active Consequence Graph
Consequence Reservation
Unsettled Consequence Barrier
Proof Plan Reservation
Causal Reality Fence
Aggregation Ledger
UNKNOWN Quarantine
```

## 5.2 Relation vocabulary

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

Protected `UNKNOWN_RELATION` fails closed according to policy.

## 5.3 Required production semantics

Consequence Algebra qualification requires:

- canonical resources resolve across at least two genuinely heterogeneous execution routes;
- semantic equivalence is independent of tool/protocol identity;
- relation decisions are deterministic/qualified, versioned and auditable;
- false-equivalence and false-independence fixtures are hard gates;
- invariant-aware composition permits safe concurrency without weakening correctness;
- Active Consequence Graph persists in-flight/unsettled state across restart;
- conflicts are blocked before independent authority is issued;
- UNKNOWN consequences create relation-aware barriers;
- equivalent cross-route duplicates reconcile instead of blind redispatch;
- proofability admission is enforced for configured consequence classes;
- causal fences require proof-closed predecessor reality, not merely previous dispatch;
- cumulative policy resists fragmentation across sessions, agents, tools, routes and time windows;
- bundle-level invariants account for secondary/conditional/privacy effects;
- relation/invariant rule changes replay the qualification fixture corpus before promotion.

## 5.4 Dedicated qualification report

Add:

```text
CIEAV_CONSEQUENCE_ALGEBRA_QUALIFICATION_V1
```

Minimum fields:

```text
commit
schemaVersion
fixtureCorpusDigest
resolverSetDigest
relationRuleSetDigest
invariantRuleSetDigest
canonicalHeterogeneousRoutesTested
semanticEquivalenceTested
falseEquivalenceRejected
falseIndependenceRejected
activeGraphRestartTested
unknownBarrierTested
crossRouteDuplicateReconcileTested
proofabilityAdmissionTested
causalFenceProofClosureTested
fragmentationResistanceTested
bundleCompositionTested
qualificationPassed
authority: false
executionAuthorityIssued: false
```

A static token check alone is never sufficient for this report.

---

# 6. Authority / SQL Server production program

The Tool Trust program does not replace the existing authority/HA program.

Next SQL production work remains:

```text
real SQL Server listener activation
managed candidate startup against real SQL
schema initialization
writer lease acquire / renew / release
real multi-key transaction readback
idempotent replay
idempotency conflict rejection
stale writer fencing
connection-loss qualification
DB restart qualification
deadlock / retry exhaustion qualification
process restart / pending-journal recovery
backup/restore + schema migration qualification
Always On AG listener failover
network partition / stale-writer proof
```

Use a separate live report such as:

```text
CIEAV_SQLSERVER_LIVE_QUALIFICATION_V1
```

Do not make offline authority qualification depend on the presence of a live SQL listener. Do not set production/HA authority flags from mocks or offline tests.

---

# 7. Application / Domain Agent program

Models remain above deterministic domain services and below CIEAV authority.

Required components:

```text
Application Model Gateway
Context Builder Registry
Domain Agent Registry
Tool Discovery Registry
Qualified Tool Registry
Tool Trust Kernel
Consequence ABI / Bundle Compiler
Proof Provider Registry
Application Agent Run Store
Context Provenance Store
```

Model providers are replaceable. Provider credentials stay outside model context. Effectful application-agent actions must not directly call trusted adapters.

Read-only tools still require principal authentication, permission checks, privacy/data minimization, bounded result size, provenance and audit.

---

# 8. Persistence requirements

Production state must survive process restart and must not rely on model memory.

Required stores include:

```text
Identity Store
Receipt / Settlement Store
Epistemic Store
Historical Consequence Graph Store
Active Consequence Graph Store
Canonical Reality Registry
Resolver Registry
Semantic Compiler Registry
Qualified Tool Manifest Registry
Tool Qualification Evidence Store
Tool Revocation / Supersession Store
Runtime Identity / Attestation Cache where appropriate
Consequence Relation Registry
Invariant Registry
Consequence Reservation Store
Proof Plan Reservation Store
Consequence Aggregation Ledger
Model / Skill / Provider Registries
Self Model Store
Workspace / Objective Store
Domain Agent Registry
Application Agent Run Store
Context / Data-flow Provenance Store
Audit Chain
```

Secrets are referenced, not persisted into these semantic registries.

---

# 9. Observability requirements

Required metrics/events include:

```text
tool discovery count by source
untrusted → verified → qualified transitions
manifest qualification failures
manifest drift / supersession / revocation
semantic compiler mismatch
proposal-vs-trusted-semantic mismatch
canonical resolution success / ambiguity / collision
bundle effect counts
bundle secondary/conditional effect rate
privacy externalities
relation latency / UNKNOWN_RELATION
false-equivalence fixture regressions
active graph size
reservation contention
UNKNOWN/quarantined consequences
cross-route duplicate attempts suppressed
proof-provider availability/freshness
causal-fence waits
fragmentation/cumulative-policy blocks
runtime identity mismatches
adapter artifact mismatches
ticket invalidations from tool drift
commit-point interceptions
settlement latency
OBSERVED_SUCCESS / OBSERVED_FAILURE / UNKNOWN rates
recovery outcomes
```

Logs/reports must be secret-redacted and provenance-bearing.

---

# 10. Security validation

The Tool Trust Kernel is a security boundary.

Required adversarial tests include:

```text
tool poisoning / malicious descriptions
post-approval tool metadata change / rug-pull
manifest substitution
semantic under-description
READ claim for mutating operation
missing secondary effects
canonical alias poisoning
canonical collision
resolver downgrade
compiler downgrade
adapter artifact substitution
runtime workload identity substitution
schema confusion
argument smuggling
prompt injection from tool results
cross-tool toxic data flow
credential/data exfiltration
fake proof provider
stale proof provider
blind UNKNOWN retry
idempotency-key collision
cross-session duplicate bypass
cross-route duplicate bypass
fragmentation / salami slicing
causal-fence bypass
recovery bypass
UI commit-point bypass
coordinate/selector drift in computer use
```

For protected effects, ambiguity fails closed or requires explicit reconciliation/coordination.

---

# 11. Production milestones

The following sequence replaces broad “build more adapters” as the immediate priority.

## M0 — Document and boundary lock

**Goal:** make Tool Trust Kernel architecture canonical.

Deliverables:

- PLAN.md and ARCHITECTURE.md updated;
- external discovery metadata explicitly untrusted;
- security-boundary review checklist updated;
- current implementation vs target clearly separated.

Exit:

```text
ToolTrustArchitectureReview = PASS
```

No production authority claim.

## M1 — Wire trusted tool contract into authority path

Deliverables:

- `assertTrustedToolConsequenceContract()` called before Algebra admission for effectful tools;
- production mode requires a trusted consequence contract;
- authorization audit records contract digest and qualification state;
- `issueTicket`, `inspectTicket`, `consumeTicket` revalidate the current contract;
- contract drift invalidates execution eligibility;
- legacy effectful tools remain explicitly unqualified.

Tests:

```text
agent claims READ for destructive tool → reject
route target != semantic target → reject
target outside qualified namespace → reject
required semantic attribute missing → reject
contract removed after authorization → reject
contract changed after authorization → reject
non-consequence tool attempts mutation → reject
```

Exit:

```text
TrustedToolAuthorizationBindingQualification = PASS
```

## M2 — Introduce Consequence Bundle V1

Deliverables:

- multi-effect bundle contracts;
- compatibility bridge from legacy single semantic effect;
- bundle digest in audit/authority context;
- dependency/atomicity/privacy/recovery edges;
- Algebra admission over bundle members and bundle invariants.

Qualification fixtures:

```text
purchase
send/accept legal communication
cloud deployment
file overwrite + external share
account permission grant
robot motion + spatial occupancy
```

Exit:

```text
ConsequenceBundleQualification = PASS
```

## M3 — Canonical Reality Resolver Registry

Deliverables:

- resolver registry and version/digest semantics;
- ambiguity model;
- evidence-backed aliases;
- resolver qualification fixtures;
- protected ambiguity fail closed.

First heterogeneous targets:

```text
Git CLI ↔ GitHub/HTTP representation
browser/SaaS UI ↔ HTTP/API object
filesystem path ↔ desktop/file URI
```

Exit:

```text
CanonicalRealityResolverQualification = PASS
```

At least two route pairs must use genuinely different route-native identifiers.

## M4 — Bind compiler/resolver/adapter identity into authority

Deliverables:

```text
toolManifestDigest
semanticCompilerDigest
bundleCompilerDigest
canonicalResolverDigest
adapterArtifactDigest
proofContractDigest
recoveryContractDigest
```

bound into proposal authorization / Reality-Bound Commit / execution-ticket context as appropriate.

Any mismatch at dispatch → reject and require fresh authority.

Exit:

```text
ToolSemanticSupplyChainBindingQualification = PASS
```

## M5 — Proof + reconciliation + recovery contracts

Deliverables:

- explicit proof contract per protected operation;
- provider health/version binding;
- success/failure/UNKNOWN claim definitions;
- duplicate/retry state machine;
- negative-proof capability where supported;
- governed compensation/recovery.

Hard gate:

```text
UNKNOWN non-idempotent operation can never blind retry.
```

Exit:

```text
ToolSettlementContractQualification = PASS
```

## M6 — Data-flow / taint / privacy consequences

Deliverables:

- source trust and data-category labels;
- provenance propagation across model/tool hops;
- privacy externalities emitted into consequence bundles/footprints;
- sink policy;
- untrusted-instruction boundary.

Hard fixtures:

```text
malicious email → CRM → external send
malicious web page → filesystem/cloud secret read
untrusted MCP result → credential/tool escalation
```

Exit:

```text
CrossToolDataFlowQualification = PASS
```

## M7 — Browser/Desktop Commit Point Interceptor

Deliverables:

- semantic commit-point detector boundary;
- protected UI transition pauses before effect;
- proposal materialized from current UI/app state;
- one-use authority releases only the bound transition;
- post-transition proof hooks.

Reference apps/scenarios should include at least:

```text
email Send
file Save/Overwrite/Delete
purchase/checkout
permission/share dialog
```

Exit:

```text
ComputerUseCommitPointQualification = PASS
```

## M8 — Adapter Qualification SDK

Deliverables:

- fixture format;
- fault-injection runner;
- qualification profiles by risk class;
- machine-readable report;
- regression corpus;
- adapter promotion/revocation workflow.

Exit:

```text
CIEAV_TOOL_ADAPTER_QUALIFICATION_V1 = PASS
```

for reference adapters.

## M9 — First end-to-end heterogeneous consequence qualification

Demonstrate one real consequence reachable through at least two genuinely different routes.

Required proof:

```text
same canonical reality
equivalent or conflicting semantic relation as expected
one active reservation domain
cross-route duplicate suppression/reconciliation
proof settlement
UNKNOWN fault injection
restart persistence
```

Recommended first domain: Git or filesystem/browser-backed SaaS because identity and proof can be independently inspected.

Exit:

```text
HeterogeneousConsequenceQualification = PASS
```

## M10 — Dedicated Tool + Algebra release gates

Add:

```text
CIEAV_TOOL_LAYER_QUALIFICATION_V1
CIEAV_CONSEQUENCE_ALGEBRA_QUALIFICATION_V1
```

Both reports must bind exact git commit and exact qualified manifest/resolver/compiler fixture digests.

Exit: release tooling refuses production-tool claims without both reports.

## M11 — Live SQL authority qualification

Continue the separate SQL production issue/program:

- real listener;
- managed candidate startup;
- lease/fencing/fault tests;
- restart/recovery;
- backup/migration;
- AG failover;
- partition qualification.

Authority/HA flags remain false until external evidence.

## M12 — Scale application coverage

Only after M1–M10 establish the semantic trust substrate, scale integrations through:

```text
native CIEAV adapters
MCP/A2A
OpenAPI
external connector platforms
browser/computer use
desktop/native OS
enterprise automation platforms
cloud APIs
databases/filesystems
ROS2/MQTT/edge
```

The goal is not “N tools connected.” The product metric is:

```text
% of protected tool operations with
qualified manifest
+ trusted materialization
+ canonical identity
+ proof/reconciliation
+ recovery classification
+ enforceable authority binding
```

---

# 12. Broader CIEAV roadmap retained

The Tool Trust program integrates with, rather than replaces, the rest of the CIEAV roadmap.

Required major programs remain:

```text
A. Authority / Commit kernel
B. Native background approval
C. Universal Cognitive Cell contract
D. Self Model
E. Global Intelligence Workspace
F. CIEAV Cortex
F2. Application / Domain Agent orchestration
G. Epistemic State
H. Consequence Graph
H2. Consequence Algebra
I. Universal Consequence ABI
J. Proof Provider Runtime
K. Authorized Outcome Trajectory
L. Intelligence Metabolism
M. CIEAV model family
N. Agentic RL environments
O. Verified Skills
P. Reflex Layer
Q. Continuing Authority
R. Autonomy Budgets
S. ROS / Robot adapters
T. CIEAV Edge
U. Device Trust / Onboarding
V. Cognitive Morphogenesis
```

Tool Trust Kernel is a cross-cutting prerequisite for effectful execution in F2/I/H2/J/K/P/Q/S/T.

---

# 13. Qualification reports

Target machine-readable release evidence:

```text
CIEAV_AUTHORITY_STATE_QUALIFICATION_V1
CIEAV_SQLSERVER_LIVE_QUALIFICATION_V1
CIEAV_TOOL_LAYER_QUALIFICATION_V1
CIEAV_TOOL_ADAPTER_QUALIFICATION_V1
CIEAV_CANONICAL_REALITY_QUALIFICATION_V1
CIEAV_CONSEQUENCE_ALGEBRA_QUALIFICATION_V1
CIEAV_COMPUTER_USE_COMMIT_POINT_QUALIFICATION_V1
CIEAV_DATA_FLOW_QUALIFICATION_V1
CIEAV_PROOF_SETTLEMENT_QUALIFICATION_V1
```

Every production report should bind:

```text
git commit
schema/report version
test/fixture corpus digest
qualified component versions/digests
timestamp
execution environment identity where relevant
explicit untested fields
```

A field is `true` only from corresponding evidence. Static architecture intent never sets a production evidence field.

---

# 14. Release gates

A production release must include, as applicable:

```text
typecheck/build
unit/integration tests
negative/fail-closed tests
static authority invariants
storage tamper/restart tests
migration/backup/restore tests
Tool Trust qualification
Consequence Algebra qualification
proof/UNKNOWN qualification
security/adversarial qualification
SBOM/dependency review
artifact provenance/signing
installer/upgrade/rollback/uninstall tests
external infrastructure/hardware qualification
```

Security-boundary changes include Tool Registry, Tool Trust Kernel, semantic/bundle compilers, Canonical Reality resolvers, Consequence ABI/Algebra, relation/invariant rules, Active Consequence Graph, Authority Kernel, trusted adapters, proof/recovery semantics, runtime identity and credential boundaries.

---

# 15. External blockers that code alone cannot close

Do not fabricate evidence for:

```text
Windows/macOS production signing identities
Apple Developer ID / notarization
physical TPM/Secure Enclave/TPM2 qualification
real GPU/hardware-specific claims
live supported installers on clean machines
independent security assessment
real DR/incident exercise
public production cloud/domain/DNS/CDN
real SQL Server HA listener/failover/network-partition evidence
physical robot/device safety qualification
```

Track these as external qualification work, not as missing unit tests.

---

# 16. Definition of Done

A subsystem is not done because types, mocks, demos, static tokens or one successful tool call exist.

## Tool integration Done

An effectful tool operation is production-qualified only when:

```text
exact tool/application/provider identity is known
external discovery metadata is separated from trusted manifest
arguments are schema validated
trusted semantic/bundle compiler is qualified
canonical resolver is qualified or ambiguity is explicit
all material consequences are represented sufficiently for policy
privacy/data-flow externalities are represented
manifest/compiler/resolver/artifact digests are authority-bound
duplicate/idempotency behavior is explicit
proof/reconciliation path is available where required
recovery/reversibility is classified
runtime identity is verified where required
UNKNOWN is preserved and safely reconciled
negative/fault tests pass
observability/audit correlation is complete
machine-readable qualification report exists
```

## Consequence Algebra Done

Requires:

```text
genuine heterogeneous canonicalization
semantic equivalence independent of route
false-equivalence hard gates
false-independence/missed-conflict hard gates
persistent active state
unsettled/UNKNOWN barriers
cross-route duplicate reconciliation
invariant-safe concurrency
proofability admission
proof-closed causal fences
anti-fragmentation across sessions/agents/routes
bundle-aware composition
crash/restart/tamper qualification
```

## Authority Done

Requires real production backend/fault/HA evidence for claims that depend on external infrastructure. Offline atomicity qualification is not HA qualification.

---

# 17. Immediate execution order

The next engineering order is now:

```text
1.  wire TrustedToolConsequenceContract into Execution Fabric authorization
2.  bind trusted contract digest into authorization/audit and revalidate at ticket lifecycle
3.  add contract-drift invalidation tests
4.  introduce ConsequenceBundleV1 + one-effect compatibility bridge
5.  build Canonical Reality Resolver Registry
6.  add genuinely heterogeneous canonicalization fixtures
7.  bind compiler/resolver/adapter/proof/recovery digests into authority
8.  implement qualified proof/reconciliation/recovery contracts
9.  implement cross-tool data-flow/taint semantics
10. implement browser/desktop Commit Point Interceptor
11. build Adapter Qualification SDK + fixture corpus
12. add Tool Layer + Consequence Algebra machine-readable release qualifiers
13. run first real heterogeneous end-to-end consequence qualification
14. continue live SQL Server authority/fault/HA qualification separately
15. only then scale broad application/tool adapter coverage
16. continue native approval / Epistemic / historical graph / Cortex / model / skill / edge programs
```

Do not start with a learned semantic/relation model. Learned components may propose aliases, bundles, effects or relations, but deterministic/qualified logic establishes the authority-relevant result.

---

# 18. Long-term target

A mature CIEAV should allow arbitrary intelligence and arbitrary software to participate without giving either one authority to define reality:

```text
objective
→ choose cognition
→ retrieve permission-bounded reality/context
→ select/discover tools
→ treat external tool metadata as untrusted
→ select exact qualified tool manifest
→ validate exact arguments
→ compile complete consequence bundle
→ resolve canonical reality across routes
→ compare with active/history consequence state
→ evaluate equivalence/conflict/causality/invariants/aggregation
→ reserve effects / establish proofability / causal fences
→ acquire minimum delegated authority
→ bind exact manifest/compiler/resolver/adapter/runtime identity
→ issue one-use execution authority
→ execute through the qualified adapter
→ independently observe reality
→ settle OBSERVED_SUCCESS / OBSERVED_FAILURE / UNKNOWN
→ recover/reconcile through new governed consequences
→ update provenance-bearing memory/learning
```

while always preserving:

```text
MODEL AUTHORITY = 0
AGENT AUTHORITY = 0
APPLICATION AGENT AUTHORITY = 0
MODEL PROVIDER AUTHORITY = 0
TOOL DESCRIPTION AUTHORITY = 0
TOOL PROPOSAL AUTHORITY = 0
TOOL MANIFEST AUTHORITY = 0
CONSEQUENCE ALGEBRA AUTHORITY = 0
LEARNING AUTHORITY = 0
```

The defining direction is:

> **CIEAV coordinates autonomous systems by the real-world consequences they can create, regardless of which application, protocol, connector, model, agent or device route produced them.**
