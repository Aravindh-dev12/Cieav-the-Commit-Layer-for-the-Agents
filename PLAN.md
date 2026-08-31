# CIEAV Production Execution Plan

## Reality Transaction Kernel + Universal Tool Trust + Consequence Coordination

This document is the canonical production roadmap for CIEAV.

CIEAV is not a tool-calling proxy, agent framework, model router, browser wrapper, MCP server, approval gateway, workflow engine, integration marketplace, or ordinary agent guardrail. CIEAV is intended to become a **Reality Transaction Kernel for autonomous computing**: a persistent, model-independent substrate that converts proposed actions from humans, models, agents, software, cloud systems, desktop applications, browsers, devices, and robots into trusted, coordinated, observable, durable, and provable real-world state transitions.

The product experience remains:

> **Installed, not opened. Visible only when reality requires attention.**

The central architectural rule is:

> **Applications and protocols are execution routes. Consequences are the unit of coordination. Authority remains local and deterministic.**

The deeper production rule is:

> **Routes propose transitions. CIEAV owns trusted consequence identity. Reality settles consequences.**

The goal is not merely to connect tools. The goal is to build a production runtime in which an effectful action cannot become a real consequence unless its semantics, canonical reality identity, relation to active consequences, proofability, authority, execution route, and settlement obligations have been qualified.

This roadmap is a technical target, not a claim of legal novelty or patentability.

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
NO TOOL MANIFEST CAN MINT AUTHORITY.
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
EFFECTFUL EXECUTION MUST CROSS TRUSTED MATERIALIZATION + CONSEQUENCE ALGEBRA + AUTHORITY + COMMIT.
EQUIVALENT REAL-WORLD CONSEQUENCES MUST NOT EXECUTE TWICE THROUGH DIFFERENT ROUTES.
UNSETTLED / UNKNOWN CONSEQUENCES MUST BLOCK OR COORDINATE ALL SEMANTICALLY DEPENDENT FOLLOW-ON EFFECTS.
POLICY MUST EVALUATE COMPOSED AND CUMULATIVE CONSEQUENCES, NOT ONLY INDIVIDUAL TOOL CALLS.
A CHANGE IN QUALIFIED TOOL SEMANTICS OR EXECUTABLE IDENTITY INVALIDATES PREVIOUS AUTHORITY.
A ROUTE MAY REALIZE AN AUTHORIZED CONSEQUENCE; A ROUTE DOES NOT DEFINE THE CONSEQUENCE.
PROTECTED ROUTE FAILOVER MUST NEVER BLINDLY REDISPATCH AN UNKNOWN CONSEQUENCE.
PHYSICAL/REMOTE SUCCESS AND CAUSAL/INSTITUTIONAL LEGITIMACY ARE DISTINCT STATES.
A LATER INVALIDATION OF EVIDENCE MUST NEVER REWRITE PHYSICAL HISTORY.
```

External tool metadata may help discovery and UX. It does not establish trusted effect class, risk, idempotency, proof semantics, privacy externality, canonical identity, reversibility, recovery semantics, or authority.

---

# 2. Product target — full production Reality Transaction Kernel

The target production path is:

```text
USER / AGENT / AUTOMATION OBJECTIVE
        ↓
INTELLIGENCE / DOMAIN ORCHESTRATION
        ↓
ZERO-AUTHORITY ACTION / TOOL PROPOSAL
        ↓
UNTRUSTED TOOL DISCOVERY PLANE
  MCP · A2A · OpenAPI · SaaS connectors · computer use · native apps
        ↓
CIEAV TOOL TRUST KERNEL
  qualified manifest
  exact argument schema
  trusted semantic compiler
  consequence-bundle compiler
  canonical reality resolver
  privacy/data-flow contract
  duplicate/idempotency contract
  proof/reconciliation contract
  recovery/compensation contract
  artifact/runtime identity binding
        ↓
CONSEQUENCE BUNDLE
        ↓
CANONICAL REALITY ADDRESS / RESOLUTION
        ↓
CONSEQUENCE ALGEBRA
        ↓
ACTIVE CONSEQUENCE GRAPH
  equivalence · conflict · dependency · aggregation · causality
        ↓
REALITY QUARANTINE CLOSURE
  relation-aware propagation of unresolved/invalidated state
        ↓
PROOFABILITY RESERVATION / EVIDENCE QUORUM
        ↓
POLICY + PERMISSIONS + LOCAL AUTHORITY
        ↓
CONSEQUENCE AUTHORITY ENVELOPE
        ↓
LEAST-CONSEQUENCE ROUTE SELECTION
        ↓
REALITY-BOUND COMMIT
        ↓
ONE-USE EXECUTION TICKET
        ↓
QUALIFIED TRUSTED ADAPTER
        ↓
REAL SOFTWARE / CLOUD / DEVICE / ROBOT
        ↓
CONSEQUENCE-PRESERVING FAILOVER / RECONCILIATION
        ↓
INDEPENDENT PERCEPTION / PROOF
        ↓
MULTI-AXIS SETTLEMENT
  reality · legitimacy · evidence · recovery
        ↓
CAUSAL RECALL / RECOVERY CLOSURE WHEN REQUIRED
        ↓
AUDIT / LEARNING
```

CIEAV should sit beneath native integrations, MCP/A2A, OpenAPI, external connector platforms, browser/computer-use systems, desktop automation, CLI, databases, cloud APIs, ROS2/MQTT, and future execution ecosystems.

CIEAV should not attempt to win primarily by manually owning every integration. It should own the **trusted semantic, coordination, authority, and settlement boundary beneath integrations**.

## 2.1 Universal Intelligence Substrate

The Reality Transaction Kernel accepts proposals from a **Universal Intelligence Substrate** that is useful across models, agents, applications, devices, and offline runtimes without inheriting authority from any of them:

- a **Cognitive Cell** wraps one bounded model, agent, deterministic service, or qualified skill with declared privacy, cost, latency, capability, and locality constraints;
- the **Self Model** represents current runtime capability and limits without allowing self-description to become trusted evidence;
- a **Global Intelligence Workspace** carries privacy-scoped claims and contributions while preventing `LOCAL_ONLY` data from reaching remote cells;
- the **CIEAV Cortex** schedules admissible cells and emits a non-authoritative cognitive program;
- the **Universal Consequence ABI** normalizes framework proposals from MCP, A2A, agents, and native software without issuing execution authority;
- **Continuing Authority** constrains long-running control to explicit checkpoints, cancellation, reflex policy, duration, and safe-state behavior;
- **CIEAV Edge** preserves local policy, state, proof, and reconciliation boundaries during intermittent connectivity and requires fresh authority after reconnect.

Every output from this substrate remains a proposal. Trusted materialization, Consequence Algebra, proofability, policy, authority, commit, execution, and settlement remain kernel-owned boundaries.

---

# 3. Current engineering truth

## 3.1 Proven foundations inherited by this branch

The branch `feat/trusted-tool-consequence-contract` is based on authority-state hardening head `08ef7b5b41b618703e526ac4023116bbb09ff057`.

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

These are **offline/local exact-head qualification facts**. They are not evidence of production SQL listener activation, Always On failover, network-partition qualification, production authority, or execution-authority issuance.

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

## 3.2 Tool-trust implementation present on this branch

The branch contains the initial trusted tool consequence contract and deterministic validation:

```text
7058f12  Add trusted tool consequence contracts
a9d0bc9  Enforce trusted tool consequence contracts
f6fc121  Test trusted tool consequence contract enforcement
```

The current validator can constrain declared effect classes, target binding/prefixes, required semantic attributes, duplicate semantics, and canonical resolver identity/version while preserving `authority=false`.

This is **not yet a completed production Tool Trust Kernel**. In particular:

- `CieavExecutionFabricStore.authorize()` is not yet required to bind and persist the trusted tool-contract result;
- ticket issuance/consumption does not yet bind the complete manifest/compiler/resolver/adapter/proof/recovery identity set;
- one `ExecutionProposal.semanticEffect` still cannot faithfully represent all multi-effect application actions;
- canonicalization still needs qualified cross-adapter resolver implementations;
- relation-aware UNKNOWN quarantine is not yet a complete graph-closure subsystem;
- consequence-aware route selection/failover is not yet implemented;
- settlement does not yet separate physical reality from legitimacy/evidence/recovery dimensions;
- causal recall/recovery closure is not yet implemented;
- this branch has not yet received a new full local authority/tool qualification run after all Tool Trust changes.

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
UNKNOWN quarantine/reconciliation primitives
persistent authenticated state
startup recovery
```

Existing tests cover route-independent semantic comparison after normalization, same-reality conflicts, trusted advanced relation classes, independent concurrency, reconciliation, cumulative budgets, proofability, invariants, persistent reservations, tamper rejection, UNKNOWN reconciliation, and causal fences.

The remaining hard problem is not merely more relation enums. It is **trusted universal materialization, coordination, execution, uncertainty propagation, failover, and settlement across arbitrary real software**.

---

# 4. P0 — Universal Tool Trust Kernel

The Tool Trust Kernel is the trusted ingress into the Reality Transaction Kernel. It is a prerequisite for broad adapter expansion.

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

Any material semantic or executable change returns the tool to an unqualified/superseded state until requalification succeeds.

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

    routeCapabilities[]
    routeRiskProfile?

    validFrom
    validUntil?
    supersedes?
    revokedAt?

    authority: false
    mayMintExecutionAuthority: false
}
```

Models/providers may propose candidate values but cannot qualify them.

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

A model-provided `semanticEffect` is an assertion to compare against trusted materialization, not the authority-bearing source of truth.

Mismatch for a protected/effectful operation → `BLOCK`.

## 4.4 Tool semantics are versioned supply-chain material

Authority must eventually bind:

```text
toolManifestDigest
semanticCompilerDigest
bundleCompilerDigest
canonicalResolverDigest
adapterArtifactDigest
runtimeIdentityDigest / attestation when required
proofContractDigest
recoveryContractDigest
routeQualificationDigest
```

If any bound digest changes before dispatch:

```text
INVALIDATE TICKET / COMMIT
→ rematerialize
→ rerun Algebra
→ rerun policy/approval/authority
```

Where appropriate, provenance may use package integrity, signed manifests/binaries, image digests, SLSA/Sigstore-class evidence, OS signing, TPM/Secure Enclave, mTLS, SPIFFE-like workload identity, or equivalent cryptographically verifiable evidence.

---

# 5. P0 — Consequence Bundle

One software action may cause multiple consequences. A single `semanticEffect` is a compatibility primitive, not the final universal abstraction.

Example purchase:

```text
PURCHASE item
TRANSFER_VALUE money
CREATE order
SHARE shipping address
UPDATE inventory
CREATE shipment obligation
COMMUNICATE confirmation
```

Target:

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

Each effect receives canonical reality identity, semantic identity, and footprint. Algebra evaluates individual effects and bundle-level invariants.

Legacy one-effect proposals may map to one-effect bundles but do not qualify arbitrary external tools for production.

---

# 6. P0 — Canonical Reality Address and Resolver Registry

The system must evolve from hashing an already-normalized target into resolving genuinely different route-native identities to one real-world object.

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

Resolution output:

```text
canonicalRealityAddress
routeAliases[]
identityEvidenceRefs[]
confidenceClass
ambiguityState
resolverId/version/digest
```

Protected operations fail closed on unresolved ambiguity.

Qualification must prove convergence such as:

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

Do not call a test “cross-route canonicalization” when all routes were given the same pre-normalized target string.

Long-term protocol direction:

```text
CIEAV Canonical Reality Address
= route-independent address of the thing in reality that a consequence can change.
```

Resolver evidence must be versioned, auditable, and protected against alias poisoning/collision.

---

# 7. P0 — Active Consequence Graph as a production coordination kernel

The Active Consequence Graph must become an authority-relevant coordination structure, not merely a history/index.

Nodes represent materialized or unsettled consequences. Edges represent qualified relations:

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

The graph must persist:

```text
active reservations
unsettled outcomes
proof obligations
causal predecessors
cumulative/aggregate state
quarantine state
route realization state
recovery dependencies
```

Authority admission reads the active graph transactionally enough to prevent two independent callers from separately minting incompatible authority.

---

# 8. P0 — Reality Quarantine Closure

This becomes a first-class CIEAV primitive.

An `UNKNOWN`, invalidated, or otherwise unsettled consequence does not merely block retry of the same tool call. CIEAV computes the semantic region of reality whose safe behavior depends on resolving that consequence.

Target object:

```text
RealityQuarantineClosure {
    sourceConsequenceId
    sourceState
    relationRuleSetDigest
    affectedConsequences[]
    affectedRealityAddresses[]
    blockers[]
    waiters[]
    reconcileCandidates[]
    allowedIndependentConsequences[]
    closureDigest
    computedAt
    authority: false
}
```

Example:

```text
A = TRANSFER_VALUE $50k
A = UNKNOWN

B = same transfer via another route       → EQUIVALENT → BLOCK/RECONCILE
C = mark invoice paid                     → REQUIRES   → WAIT
D = communicate "payment completed"       → REQUIRES   → WAIT
E = unrelated utility payment             → INDEPENDENT→ MAY CONTINUE
```

Required properties:

- relation-aware, not resource-lock-only;
- deterministic/qualified relation rules;
- persistent across restart;
- closure recomputed when evidence/relations change;
- no global freeze when unrelated effects are provably independent;
- quarantine state itself has zero authority.

Machine-readable report target:

```text
CIEAV_REALITY_QUARANTINE_QUALIFICATION_V1
```

---

# 9. P0 — Proofability Reservation and Evidence Quorum

For protected consequences, proofability is an admission precondition, not merely post-execution logging.

Every protected operation declares a `ToolProofContract`:

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

Introduce:

```text
EvidenceQuorumPlan {
    consequenceClass
    requiredProviders[]
    alternativeProviderSets[]
    independencePolicy
    freshnessWindow
    availabilityState
    quorumDigest
    authority: false
}
```

Rules:

- transport `200 OK` is not automatically `OBSERVED_SUCCESS`;
- tool-returned text is not automatically proof;
- timeout does not imply failure;
- missing trustworthy proof → `UNKNOWN` where reality cannot be established;
- UNKNOWN non-idempotent execution never blind retries;
- high-risk consequence classes may require multiple independent evidence sources;
- if required proof topology is unavailable before execution, policy may deny authority.

Target report:

```text
CIEAV_PROOFABILITY_QUALIFICATION_V1
```

---

# 10. P0 — Consequence Authority Envelope

The final architecture must progressively move authority away from “permission to call this tool” toward “permission to realize this exact admitted consequence.”

Target object:

```text
ConsequenceAuthorityEnvelope {
    consequenceIdentity
    bundleDigest
    canonicalRealityRefs[]
    permittedEffectClasses[]
    permittedDeltas
    invariantWitnessDigest
    reservationDigest
    proofPlanDigest
    quarantineSnapshotDigest
    authorityPolicyDigest
    permittedRouteSet[]
    routeConstraints
    expiresAt
    oneUse
}
```

The envelope is minted only by the local Authority / Commit Plane after all admission checks.

A route is a qualified realization mechanism. A route may not expand the consequence beyond the envelope.

This enables safe route choice/failover without granting a generic “call any equivalent tool” capability.

---

# 11. P0 — Least-Consequence Routing

When multiple qualified routes can realize the same admitted consequence, CIEAV should choose the route that minimizes consequence risk rather than allowing arbitrary model/tool choice.

Candidate route score inputs may include:

```text
proofability
idempotency strength
reversibility / compensation quality
adapter qualification level
runtime identity strength
credential scope
privacy exposure
uncertainty risk
latency
financial cost
availability
provider concentration
```

Target object:

```text
ConsequenceRouteDecision {
    consequenceIdentity
    candidateRoutes[]
    disqualifiedRoutes[]
    selectedRoute
    routeScoreInputs
    policyDigest
    decisionDigest
    authority: false
}
```

Route scoring may use learned components for suggestions, but protected route eligibility and hard constraints remain deterministic/qualified.

The model requests the outcome. It does not gain authority to select a weaker route that violates the envelope.

---

# 12. P0 — Consequence-Preserving Failover

Traditional failover retries requests/providers. CIEAV must fail over **the intended consequence** without duplicating reality.

State machine:

```text
ROUTE A SELECTED
    ↓
PRE-COMMIT PROVEN FAILURE
    → alternate qualified route MAY be selected

DISPATCHED / COMMIT BOUNDARY CROSSED
    ↓
OUTCOME UNKNOWN
    → quarantine equivalent routes
    → reconcile
    → NO blind route failover

OBSERVED_SUCCESS
    → equivalent route requests reconcile to existing success

OBSERVED_FAILURE with qualified negative evidence
    → alternate qualified route MAY receive fresh execution authority
```

Target contract:

```text
ConsequenceFailoverPlan {
    consequenceIdentity
    orderedQualifiedRoutes[]
    routeCommitBoundaries[]
    safePreCommitFailureStates[]
    reconciliationRequiredStates[]
    failoverPolicyDigest
    authority: false
}
```

Qualification must inject failures before and after commit boundaries and prove there is no duplicate consequence.

Target report:

```text
CIEAV_CONSEQUENCE_FAILOVER_QUALIFICATION_V1
```

---

# 13. P0 — Multi-Axis Settlement

A single `success/failure/unknown` field is insufficient for long-lived autonomous systems.

CIEAV must separate physical/remote truth from institutional/causal legitimacy.

Target:

```text
ConsequenceSettlementV2 {
    executionState
    realityState
    legitimacyState
    evidenceState
    recoveryState
    observedAt?
    legitimacyEvaluatedAt?
    settlementDigest
}
```

Suggested dimensions:

```text
executionState:
  NOT_DISPATCHED | DISPATCHED | COMPLETED | INTERRUPTED

realityState:
  OBSERVED_SUCCESS | OBSERVED_FAILURE | UNKNOWN

legitimacyState:
  VALID | AUTHORITY_REVOKED | EVIDENCE_INVALIDATED |
  TOOL_COMPROMISED | POLICY_INVALIDATED | CAUSALLY_TAINTED |
  UNKNOWN_VALIDITY

evidenceState:
  RESERVED | AVAILABLE | VERIFIED | CONFLICTING | STALE | UNAVAILABLE

recoveryState:
  NOT_REQUIRED | REQUIRED | IN_PROGRESS | RECOVERED |
  PARTIALLY_RECOVERED | IRREVERSIBLE | UNKNOWN
```

Critical invariant:

```text
OBSERVED_SUCCESS is never rewritten to OBSERVED_FAILURE
merely because later legitimacy/evidence becomes invalid.
```

Reality history remains truthful while recovery obligations change.

---

# 14. P0 — Causal Recall and Consequence Recovery Closure

A consequence can be physically successful and later become causally illegitimate because the evidence, identity, tool, policy, or predecessor that justified it is later invalidated.

CIEAV must support **Causal Recall**:

```text
later invalidation event
    ↓
identify affected provenance/causal node
    ↓
traverse consequence descendants
    ↓
mark legitimacy/evidence state
    ↓
compute Recovery Closure
    ↓
freeze/coordinate affected future consequences
    ↓
propose recovery/compensation consequences
    ↓
run those recovery actions through normal Tool Trust + Algebra + Authority
```

Target objects:

```text
CausalRecallEvent {
    invalidatedEvidenceRef?
    invalidatedAuthorityRef?
    compromisedToolRef?
    invalidatedPolicyRef?
    reasonClass
    discoveredAt
    evidenceRefs[]
}
```

```text
ConsequenceRecoveryClosure {
    recallEventId
    directlyAffectedConsequences[]
    transitivelyAffectedConsequences[]
    futureConsequencesToBlock[]
    recoverableConsequences[]
    compensableConsequences[]
    irreversibleConsequences[]
    proposedRecoveryPrograms[]
    closureDigest
    authority: false
}
```

Recovery is never a privileged bypass. Every compensation/undo is a new governed consequence.

Target report:

```text
CIEAV_CAUSAL_RECALL_QUALIFICATION_V1
```

---

# 15. Data-flow and instruction-taint semantics

Tool results can carry hostile instructions, sensitive data, or untrusted external content. CIEAV needs a data-flow trust model independent of prompt filtering.

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
provenance chain
```

Example invariant:

```text
EXTERNAL_UNTRUSTED content
must not independently cause
CONFIDENTIAL / CREDENTIAL data → EXTERNAL sink
without a separately authorized policy path.
```

Taint/provenance must survive model summarization and multi-tool hops when authority-relevant.

Data disclosure, publication, access grant, and retention changes are consequences and belong in the bundle/footprint.

---

# 16. Browser/Desktop Commit Point Interceptor

UI automation cannot treat `click(x,y)` as the consequence.

Target path:

```text
UI observation
  ↓
application semantic state extraction
  ↓
commit-point detection
  ↓
qualified Tool Invocation / Consequence Bundle
  ↓
Canonical Reality + Algebra + Quarantine + Proofability + Authority
  ↓
release exactly the bound effectful UI transition
  ↓
post-state observation
```

Commit points include:

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

The interceptor should allow benign navigation/observation under policy while preventing protected state transitions from bypassing CIEAV.

---

# 17. Adapter Qualification SDK

Do not hand-qualify every integration with ad hoc logic.

Build a CIEAV Adapter Qualification SDK that accepts deterministic fixtures and fault-injection scenarios and emits machine-readable evidence for:

```text
argument schema correctness
semantic under-description attempts
bundle completeness
canonical alias resolution
false equivalence
false independence
privacy/data-flow externalities
duplicate/idempotency behavior
UNKNOWN reconciliation
quarantine closure correctness
proof availability/freshness/evidence quorum
route eligibility
pre/post-commit failover safety
recovery/compensation
multi-axis settlement
causal recall propagation
manifest drift
compiler/resolver drift
adapter artifact drift
runtime identity mismatch
restart/crash behavior
UI commit-point bypass
```

Community/vendor adapters remain `UNTRUSTED` until their exact version/profile passes the required qualification profile.

Operational modes:

```text
OBSERVE_ONLY
  discover/materialize/log; never issue execution authority

SHADOW
  evaluate what CIEAV would admit/block/reconcile without controlling execution

ENFORCE
  protected effectful execution must present valid CIEAV authority
```

Promotion to `ENFORCE` is exact-version and evidence-bound.

---

# 18. Consequence Algebra completion program

Consequence Algebra remains the semantic coordination core after trusted materialization.

Required primitives:

```text
Canonical Reality Address
Semantic Effect Identity
Consequence Bundle
Consequence Footprint
Consequence Relation Result
Invariant Compatibility Witness
Active Consequence Graph
Consequence Reservation
Reality Quarantine Closure
Proof Plan Reservation
Evidence Quorum Plan
Causal Reality Fence
Aggregation Ledger
Consequence Authority Envelope
Consequence Route Decision
Consequence Failover Plan
Multi-Axis Settlement
Causal Recall
Recovery Closure
```

Required production semantics:

- canonical resources resolve across at least two genuinely heterogeneous execution routes;
- semantic equivalence is independent of tool/protocol identity;
- relation decisions are deterministic/qualified, versioned, and auditable;
- false-equivalence and false-independence fixtures are hard gates;
- invariant-aware composition permits safe concurrency without weakening correctness;
- Active Consequence Graph persists in-flight/unsettled state across restart;
- conflicts are blocked before independent authority is issued;
- UNKNOWN creates relation-aware quarantine closure;
- equivalent cross-route duplicates reconcile instead of blind redispatch;
- proofability admission is enforced for configured consequence classes;
- evidence quorum is enforceable for high-risk classes;
- causal fences require proof-closed predecessor reality, not merely previous dispatch;
- cumulative policy resists fragmentation across sessions, agents, tools, routes, and time windows;
- bundle-level invariants account for secondary/conditional/privacy effects;
- failover cannot duplicate a consequence across routes;
- settlement preserves physical truth independently from later legitimacy changes;
- causal recall can compute recovery closure without silently rewriting history;
- relation/invariant/resolver/compiler rule changes replay the qualification corpus before promotion.

---

# 19. Authority / SQL Server production program

The Reality Transaction Kernel does not replace the existing authority/HA program.

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

Use a separate live report:

```text
CIEAV_SQLSERVER_LIVE_QUALIFICATION_V1
```

Do not make offline authority qualification depend on a live SQL listener. Do not set production/HA authority flags from mocks or offline tests.

---

# 20. Persistence requirements

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
Runtime Identity / Attestation State
Consequence Relation Registry
Invariant Registry
Consequence Reservation Store
Reality Quarantine Store
Proof Plan Reservation Store
Evidence Quorum Store
Consequence Aggregation Ledger
Consequence Authority Envelope Store
Route Qualification / Route Decision Store
Failover / Reconciliation Store
Causal Provenance Store
Causal Recall Store
Recovery Closure Store
Context / Data-flow Provenance Store
Model / Skill / Provider Registries
Self Model Store
Workspace / Objective Store
Domain Agent Registry
Application Agent Run Store
Audit Chain
```

Secrets are referenced, not persisted into semantic registries.

---

# 21. Observability requirements

Required metrics/events include:

```text
tool discovery count by source
untrusted → verified → qualified transitions
manifest qualification failures
manifest drift / supersession / revocation
semantic compiler mismatch
proposal-vs-trusted-semantic mismatch
canonical resolution success / ambiguity / collision
bundle effect counts / missing-effect failures
relation latency / UNKNOWN_RELATION
active graph size
reservation contention
quarantine closure size / duration
UNKNOWN consequences
cross-route duplicate attempts suppressed
proof-provider availability/freshness
proofability admission blocks
evidence quorum availability/failure
causal-fence waits
fragmentation/cumulative-policy blocks
route candidates / route disqualifications
least-consequence route decisions
failover attempts by boundary state
failover blocked because predecessor UNKNOWN
runtime identity mismatches
adapter artifact mismatches
ticket invalidations from tool drift
commit-point interceptions
reality settlement latency
legitimacy-state changes
causal recall events
recovery closure size/outcome
OBSERVED_SUCCESS / OBSERVED_FAILURE / UNKNOWN rates
```

Logs/reports must be secret-redacted and provenance-bearing.

---

# 22. Security validation

The Tool Trust Kernel, Canonical Reality Resolver, Active Consequence Graph, route-selection/failover logic, settlement, and Authority Kernel are security boundaries.

Required adversarial tests include:

```text
tool poisoning / malicious descriptions
post-approval metadata rug-pull
manifest substitution
semantic under-description
READ claim for mutating operation
missing secondary effects
canonical alias poisoning
canonical collision
resolver downgrade
compiler downgrade
adapter artifact substitution
runtime workload substitution
schema confusion
argument smuggling
prompt injection from tool results
cross-tool toxic data flow
credential/data exfiltration
fake proof provider
stale proof provider
colluding proof providers
blind UNKNOWN retry
idempotency-key collision
cross-session duplicate bypass
cross-route duplicate bypass
fragmentation / salami slicing
quarantine-closure bypass
causal-fence bypass
route-score manipulation
unsafe failover after commit boundary
failover provider substitution
settlement-state rewriting
causal-recall suppression
recovery bypass
UI commit-point bypass
coordinate/selector drift in computer use
```

For protected effects, ambiguity fails closed or requires explicit reconciliation/coordination.

---

# 23. Production milestones

The following sequence supersedes broad “build more adapters” as the immediate priority.

## M0 — Architecture and boundary lock

Deliverables:

- PLAN.md and ARCHITECTURE.md define the Reality Transaction Kernel;
- Tool Trust Kernel is ingress, not the whole product;
- discovery metadata is explicitly untrusted;
- consequence authority, quarantine, proofability, failover, settlement, and recall are explicit target boundaries;
- current implementation vs target remains clear.

Exit:

```text
RealityTransactionArchitectureReview = PASS
```

No production authority claim.

## M1 — Wire trusted tool contract into real authority path

Deliverables:

- `assertTrustedToolConsequenceContract()` before Algebra admission for effectful tools;
- production mode requires trusted consequence contract;
- authorization audit records contract digest and qualification state;
- `issueTicket`, `inspectTicket`, `consumeTicket`, dispatch verification, and crash recovery revalidate the current contract;
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
contract changed during crash/recovery window → reject
non-consequence tool attempts mutation → reject
```

Exit:

```text
TrustedToolAuthorizationBindingQualification = PASS
```

## M2 — ConsequenceBundleV1

Deliverables:

- multi-effect bundle contracts;
- one-effect compatibility bridge;
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

## M4 — Production Active Consequence Graph enforcement

Deliverables:

- transactional enough admission against current active graph;
- persistent relation edges/reservations;
- duplicate/conflict/require/aggregate enforcement before authority;
- restart-safe unsettled state;
- rule-version binding.

Exit:

```text
ActiveConsequenceGraphQualification = PASS
```

## M5 — Reality Quarantine Closure

Deliverables:

- graph closure from UNKNOWN/unsettled/invalidated source;
- relation-aware BLOCK/WAIT/RECONCILE/ALLOW classification;
- restart persistence;
- closure recomputation after evidence changes;
- no unnecessary global freeze of independent consequences.

Hard fixture:

```text
UNKNOWN payment
→ equivalent route blocked
→ invoice-paid transition waits
→ payment-complete communication waits
→ unrelated utility payment remains admissible
```

Exit:

```text
CIEAV_REALITY_QUARANTINE_QUALIFICATION_V1 = PASS
```

## M6 — Proofability Reservation + Evidence Quorum

Deliverables:

- explicit proof contract per protected operation;
- proof-provider identity/health/freshness binding;
- proof plan reserved before authority;
- optional evidence quorum for high-risk consequence classes;
- success/failure/UNKNOWN claim definitions;
- duplicate/retry state machine;
- negative-proof capability where supported.

Hard gate:

```text
UNKNOWN non-idempotent operation can never blind retry.
```

Exit:

```text
CIEAV_PROOFABILITY_QUALIFICATION_V1 = PASS
```

## M7 — Consequence authority envelope + semantic supply-chain binding

Deliverables:

```text
toolManifestDigest
semanticCompilerDigest
bundleCompilerDigest
canonicalResolverDigest
adapterArtifactDigest
runtimeIdentityDigest where required
proofContractDigest
recoveryContractDigest
reservationDigest
quarantineSnapshotDigest
```

bound into the exact consequence authority context.

A route can only realize the consequence permitted by the envelope.

Exit:

```text
ConsequenceAuthorityEnvelopeQualification = PASS
```

## M8 — Least-Consequence Routing + Consequence-Preserving Failover

Deliverables:

- qualified equivalent-route registry;
- deterministic hard eligibility constraints;
- route risk/proof/idempotency/privacy/recovery scoring;
- failover state machine aware of route commit boundaries;
- no alternate route while equivalent predecessor is UNKNOWN;
- fresh authority after qualified negative proof where required.

Fault fixtures:

```text
route fails before commit boundary → safe alternate route
route times out after possible commit → quarantine + reconcile
route succeeds but response is lost → no duplicate through alternate route
route artifact changes → route becomes ineligible
```

Exit:

```text
CIEAV_CONSEQUENCE_FAILOVER_QUALIFICATION_V1 = PASS
```

## M9 — Multi-Axis Settlement

Deliverables:

- execution, reality, legitimacy, evidence, and recovery dimensions;
- migration/compatibility from existing receipt states;
- physical success cannot be rewritten because legitimacy later changes;
- audit/replay semantics.

Exit:

```text
MultiAxisSettlementQualification = PASS
```

## M10 — Causal Recall + Recovery Closure

Deliverables:

- causal provenance graph linked to consequences;
- invalidation events for evidence/authority/tool/policy;
- descendant legitimacy propagation;
- recovery closure computation;
- affected future consequences quarantined/blocked;
- compensation/undo re-enter normal consequence path.

Hard fixture:

```text
external instruction causes account change
→ payment succeeds
→ source later proven compromised
→ payment remains OBSERVED_SUCCESS
→ legitimacy becomes CAUSALLY_TAINTED
→ dependent accounting/communications identified
→ recovery closure generated
```

Exit:

```text
CIEAV_CAUSAL_RECALL_QUALIFICATION_V1 = PASS
```

## M11 — Cross-tool data-flow / taint / privacy

Deliverables:

- source trust and data-category labels;
- provenance propagation across model/tool hops;
- privacy externalities emitted into bundles/footprints;
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

## M12 — Browser/Desktop Commit Point Interceptor

Deliverables:

- semantic commit-point detector boundary;
- protected UI transition pauses before effect;
- proposal materialized from current UI/app state;
- consequence authority releases only the bound transition;
- post-transition proof hooks.

Reference scenarios:

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

## M13 — Adapter Qualification SDK

Deliverables:

- fixture format;
- fault-injection runner;
- risk profiles;
- qualification reports;
- regression corpus;
- adapter promotion/revocation workflow;
- qualification support for quarantine/failover/settlement/recall semantics.

Exit:

```text
CIEAV_TOOL_ADAPTER_QUALIFICATION_V1 = PASS
```

for reference adapters.

## M14 — First real heterogeneous Reality Transaction benchmark

Demonstrate one consequence reachable through at least two genuinely different routes.

Required proof:

```text
same canonical reality
equivalent/conflicting relation as expected
one active reservation domain
cross-route duplicate suppression
UNKNOWN fault injection
reality quarantine closure
proof settlement
safe pre-commit route failover
blocked post-commit UNKNOWN failover
restart persistence
multi-axis settlement
```

Recommended first domain: Git or filesystem/browser-backed SaaS for deterministic identity/proof, followed by a sandbox payment-like domain for high-risk UNKNOWN/failover tests.

Exit:

```text
HeterogeneousRealityTransactionQualification = PASS
```

## M15 — Dedicated release gates

Add/upgrade:

```text
CIEAV_TOOL_LAYER_QUALIFICATION_V1
CIEAV_CANONICAL_REALITY_QUALIFICATION_V1
CIEAV_CONSEQUENCE_ALGEBRA_QUALIFICATION_V1
CIEAV_REALITY_QUARANTINE_QUALIFICATION_V1
CIEAV_PROOFABILITY_QUALIFICATION_V1
CIEAV_CONSEQUENCE_FAILOVER_QUALIFICATION_V1
CIEAV_MULTI_AXIS_SETTLEMENT_QUALIFICATION_V1
CIEAV_CAUSAL_RECALL_QUALIFICATION_V1
CIEAV_COMPUTER_USE_COMMIT_POINT_QUALIFICATION_V1
CIEAV_DATA_FLOW_QUALIFICATION_V1
```

Reports bind exact git commit and exact manifest/resolver/compiler/rule/fixture digests.

Release tooling must refuse production claims without the reports required by the enabled feature profile.

## M16 — Live SQL authority qualification

Continue the separate SQL production program:

- real listener;
- managed candidate startup;
- lease/fencing/fault tests;
- restart/recovery;
- backup/migration;
- AG failover;
- partition qualification.

Authority/HA flags remain false until external evidence.

## M17 — Scale application coverage

Only after the semantic/coordination/authority substrate is qualified, scale integrations through:

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

The product metric is not “N tools connected.” The production metric is:

```text
% of protected operations with
qualified manifest
+ trusted consequence bundle
+ canonical reality identity
+ active-graph relation coverage
+ quarantine behavior
+ proofability/reconciliation
+ route/failover qualification
+ recovery classification
+ multi-axis settlement
+ enforceable authority binding
```

---

# 24. Definition of Done

A subsystem is not done because types, mocks, demos, static tokens, or one successful tool call exist.

## Production-qualified tool operation

An effectful operation is production-qualified only when:

```text
exact tool/application/provider identity is known
external discovery metadata is separated from trusted manifest
arguments are schema validated
trusted semantic/bundle compiler is qualified
canonical resolver is qualified or ambiguity is explicit
all material consequences are represented sufficiently for policy
privacy/data-flow externalities are represented
manifest/compiler/resolver/artifact/runtime digests are authority-bound where required
duplicate/idempotency behavior is explicit
proofability/reconciliation path is available where required
high-risk evidence quorum is satisfiable where configured
recovery/reversibility is classified
UNKNOWN is preserved and relation-aware quarantine is enforced
route failover cannot duplicate the consequence
settlement preserves physical truth separately from legitimacy
negative/fault tests pass
observability/audit correlation is complete
machine-readable qualification evidence exists
```

## Reality Transaction Kernel Done

Requires:

```text
genuine heterogeneous canonicalization
semantic equivalence independent of route
false-equivalence hard gates
false-independence/missed-conflict hard gates
persistent active consequence state
relation-aware uncertainty quarantine
cross-route duplicate reconciliation
invariant-safe concurrency
proofability admission / evidence quorum where configured
proof-closed causal fences
anti-fragmentation across sessions/agents/routes
bundle-aware composition
consequence-bound authority envelope
safe route selection
consequence-preserving failover
multi-axis settlement
causal recall + recovery closure
crash/restart/tamper qualification
```

## Authority Done

Requires real production backend/fault/HA evidence for claims that depend on external infrastructure. Offline atomicity qualification is not HA qualification.

---

# 25. Immediate execution order

The engineering order is now:

```text
1.  wire TrustedToolConsequenceContract into Execution Fabric authorization
2.  bind trusted contract digest into authorization/audit and revalidate through ticket + crash-recovery lifecycle
3.  add contract-drift invalidation tests
4.  introduce ConsequenceBundleV1 + one-effect compatibility bridge
5.  build Canonical Reality Resolver Registry
6.  add genuine heterogeneous canonicalization fixtures
7.  harden Active Consequence Graph as authority-relevant coordination state
8.  implement Reality Quarantine Closure
9.  implement proofability reservation + evidence quorum contracts
10. introduce Consequence Authority Envelope
11. bind compiler/resolver/adapter/runtime/proof/recovery identity into authority
12. implement Least-Consequence Routing
13. implement Consequence-Preserving Failover
14. introduce Multi-Axis Settlement
15. implement Causal Recall + Recovery Closure
16. implement cross-tool data-flow / instruction-taint semantics
17. implement browser/desktop Commit Point Interceptor
18. build Adapter Qualification SDK + fault corpus
19. add machine-readable Tool/Reality/Algebra/Quarantine/Proof/Failover/Settlement/Recall release gates
20. run first real heterogeneous end-to-end Reality Transaction benchmark
21. continue live SQL Server authority/fault/HA qualification separately
22. only then scale broad application/tool adapter coverage
23. continue native approval / Epistemic / historical graph / Cortex / model / skill / edge programs
```

Do not start with a learned relation/semantic model as authority. Learned components may propose aliases, bundles, effects, relations, routes, or recovery plans, but deterministic/qualified logic establishes the authority-relevant result.

---

# 26. Long-term target

A mature CIEAV should allow arbitrary intelligence and arbitrary software to participate without giving either one authority to define reality:

```text
objective
→ choose cognition
→ retrieve permission-bounded reality/context
→ discover/select candidate capabilities
→ treat external tool metadata as untrusted
→ select exact qualified tool manifest
→ validate exact arguments
→ compile complete consequence bundle
→ resolve canonical reality across routes
→ compare with active/history consequence state
→ evaluate equivalence/conflict/causality/invariants/aggregation
→ compute relation-aware quarantine around unsettled state
→ reserve effects + proofability/evidence quorum + causal fences
→ mint minimum consequence-bound local authority
→ choose least-consequence qualified route
→ bind exact manifest/compiler/resolver/adapter/runtime identity
→ issue one-use execution authority
→ execute through qualified adapter
→ fail over only when consequence-preserving state permits
→ independently observe reality
→ settle reality + legitimacy + evidence + recovery dimensions
→ perform causal recall when later invalidation occurs
→ recover/reconcile through new governed consequences
→ update provenance-bearing audit/memory/learning
```

while preserving:

```text
MODEL AUTHORITY = 0
AGENT AUTHORITY = 0
APPLICATION AGENT AUTHORITY = 0
MODEL PROVIDER AUTHORITY = 0
TOOL DESCRIPTION AUTHORITY = 0
TOOL PROPOSAL AUTHORITY = 0
TOOL MANIFEST AUTHORITY = 0
ROUTE DECISION AUTHORITY = 0
CONSEQUENCE ALGEBRA AUTHORITY = 0
QUARANTINE COMPUTATION AUTHORITY = 0
PROOF PROVIDER AUTHORITY = 0
LEARNING AUTHORITY = 0
```

The defining direction is:

> **CIEAV changes the unit of autonomous execution from a tool call to a globally coordinated real-world consequence.**

And the production thesis is:

> **CIEAV is a Reality Transaction Kernel that canonicalizes real-world consequences across heterogeneous execution routes, coordinates equivalent/conflicting/dependent/unresolved effects before commitment, grants minimum local authority to the consequence rather than the model, preserves exactly-once semantics across route failure where provable, and maintains truthful settlement even when causal legitimacy changes later.**
