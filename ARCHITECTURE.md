# CIEAV Architecture

## Reality Transaction Kernel for Autonomous Systems

> **Models think. Agents plan. CIEAV commits consequences.**
>
> **Applications are execution routes. Consequences are the unit of coordination. Authority remains local.**
>
> **Routes propose transitions. CIEAV owns trusted consequence identity. Reality settles consequences.**

This document is the canonical target architecture for CIEAV.

A component appearing here is not automatically implemented or production-qualified. Production claims require exact executable evidence, deterministic/qualified semantic evidence, and external infrastructure evidence where applicable.

This document describes the intended technical architecture. It is not a claim of legal novelty or patentability.

---

# 1. Product thesis

CIEAV is not a chatbot, browser wrapper, model router, agent framework, workflow engine, MCP server, AI Foundry clone, integration marketplace, approval proxy, or ordinary agent guardrail.

CIEAV is intended to become a **Reality Transaction Kernel for autonomous computing**: a model- and agent-independent consequence-native runtime that converts probabilistic machine intention into trusted, coordinated, observable, durable, and recoverable changes in reality.

The fundamental transaction is not a prompt, token, tool call, click, API request, workflow step, agent handoff, or provider invocation.

It is a **real-world consequence**.

```text
WORLD BEFORE
    +
objective / intent
    +
principal identity
    +
agent/model identity
    +
delegated authority
    +
exact proposed operation/arguments
    +
qualified tool semantics
    +
current canonical reality
    +
active/unsettled consequences
    +
proofability
    +
policy
    ↓
TRUSTED CONSEQUENCE MATERIALIZATION
    ↓
CONSEQUENCE BUNDLE
    ↓
CANONICAL REALITY RESOLUTION
    ↓
CONSEQUENCE ALGEBRA
    ↓
ACTIVE CONSEQUENCE GRAPH
    ↓
REALITY QUARANTINE / PROOFABILITY
    ↓
CONSEQUENCE-BOUND LOCAL AUTHORITY
    ↓
QUALIFIED ROUTE SELECTION
    ↓
REALITY-BOUND COMMIT
    ↓
ONE-USE EXECUTION AUTHORITY
    ↓
QUALIFIED EXECUTION
    ↓
INDEPENDENT PERCEPTION / PROOF
    ↓
MULTI-AXIS SETTLEMENT
    ↓
WORLD AFTER
```

Frontier APIs, local models, coding agents, enterprise agents, MCP/A2A servers, SaaS connectors, computer-use systems, cloud APIs, desktop software, robots, and devices are replaceable capabilities around this boundary.

---

# 2. Constitutional invariants

1. No model can mint authority.
2. No agent can mint authority.
3. No application agent can mint authority.
4. No MCP/A2A server or client can mint authority.
5. No model/provider SDK can mint authority.
6. No external tool description or annotation is trusted consequence truth.
7. Tool discovery is not tool qualification.
8. No learned component can qualify its own semantic output.
9. Model output is never observed reality.
10. Tool output is never automatically observed reality.
11. `COMMITTED` is not success.
12. Missing proof remains `UNKNOWN` where reality cannot be established.
13. Exact authority is bound to exact consequence, exact execution constraints, and exact qualified semantics.
14. Execution authority is scoped, short-lived, and preferably one-use.
15. Recovery, compensation, and undo are new governed consequences.
16. Equivalent real-world consequences must not execute twice merely because their routes differ.
17. Unsettled/UNKNOWN effects create relation-aware quarantine, not merely retry suppression.
18. Consequence policy must resist fragmentation across agents, sessions, tools, routes, and time windows.
19. Native/local execution does not bypass policy, Algebra, proofability, settlement, or recovery.
20. Only the Authority / Commit Plane may issue execution authority.
21. Tool/compiler/resolver/adapter/runtime identity drift invalidates existing authority.
22. Authority-bearing semantics must come from deterministic or explicitly qualified logic.
23. A route may realize an admitted consequence; a route does not define that consequence.
24. Failover after an uncertain commit boundary must not produce a second equivalent consequence.
25. Physical/remote reality status and causal/institutional legitimacy are separate settlement dimensions.
26. Later invalidation of evidence, policy, authority, or provenance never rewrites physical history.
27. Causal recall and recovery are governed transitions, not privileged corrections.

Critical direction:

```text
intelligence / agents / tool discovery
          │
          │ proposals / descriptions / observations
          ▼
      TOOL TRUST KERNEL
          │
          │ qualified materialization
          ▼
   CONSEQUENCE BUNDLE
          │
          ▼
   CANONICAL REALITY
          │
          ▼
   CONSEQUENCE ALGEBRA
          │
          ▼
 ACTIVE CONSEQUENCE GRAPH
          │
          ▼
 QUARANTINE + PROOFABILITY
          │
          ▼
  CONSEQUENCE AUTHORITY
          │
          ▼
 QUALIFIED ROUTE / COMMIT
          │
          ▼
       REALITY
          │
          ▼
        PROOF
          │
          ▼
      SETTLEMENT
```

Never:

```text
model / agent / tool provider / MCP server / computer-use controller
        ──► signer / ticket minting / credential issuance / settlement authority
```

---

# 3. User experience

```text
install CIEAV once
      ↓
runs as background infrastructure
      ↓
AI / agents / automation / applications operate normally
      ↓
CIEAV becomes visible only when
approval, uncertainty, conflict, quarantine, recovery, or policy requires attention
```

Developer and forensic surfaces may expose state, receipts, causality, quarantine, route decisions, and diagnostics. Those surfaces are not authority.

---

# 4. Top-level architecture

```text
╔══════════════════════════════════════════════════════════════════════╗
║                              CIEAV                                  ║
║                     Reality Transaction Kernel                     ║
╠══════════════════════════════════════════════════════════════════════╣
║ INTELLIGENCE PLANE                                                   ║
║ models · agents · planners · retrievers · simulators · memory       ║
╠══════════════════════════════════════════════════════════════════════╣
║ INTEROP / DISCOVERY PLANE                                            ║
║ MCP · A2A · OpenAPI · connectors · computer use · native software   ║
║ external descriptions/annotations are UNTRUSTED DISCOVERY DATA      ║
╠══════════════════════════════════════════════════════════════════════╣
║ TOOL TRUST KERNEL                                                    ║
║ Qualified Tool Manifest · argument schema · semantic compiler        ║
║ bundle compiler · canonical resolver · proof/recovery contract       ║
║ artifact/runtime identity · data-flow semantics                      ║
╠══════════════════════════════════════════════════════════════════════╣
║ CONSEQUENCE MATERIALIZATION                                          ║
║ invocation → Consequence Bundle → canonical identities               ║
║ semantic identities · footprints · dependencies · privacy effects    ║
╠══════════════════════════════════════════════════════════════════════╣
║ REALITY COORDINATION PLANE                                           ║
║ Consequence Algebra · Active Consequence Graph                       ║
║ equivalence · conflict · causality · invariants · aggregation        ║
║ reservations · quarantine closure · causal fences                    ║
╠══════════════════════════════════════════════════════════════════════╣
║ PROOFABILITY / ROUTE PLANE                                           ║
║ Proof Plan Reservation · Evidence Quorum · qualified route set       ║
║ least-consequence routing · consequence-preserving failover          ║
╠══════════════════════════════════════════════════════════════════════╣
║ AUTHORITY / COMMIT PLANE                                             ║
║ identity · delegation · policy · credential lease · reality witness ║
║ Consequence Authority Envelope · Reality-Bound Commit                ║
║ one-use execution ticket                                             ║
╠══════════════════════════════════════════════════════════════════════╣
║ EXECUTION PLANE                                                      ║
║ browser · HTTP · MCP/A2A · cloud · DB · filesystem · Git · native   ║
║ enterprise SaaS · desktop · Windows/.NET · ROS2 · embedded           ║
╠══════════════════════════════════════════════════════════════════════╣
║ PERCEPTION / SETTLEMENT PLANE                                        ║
║ independent evidence · reconciliation · multi-axis settlement        ║
║ reality · legitimacy · evidence · recovery                           ║
╠══════════════════════════════════════════════════════════════════════╣
║ CAUSAL RECOVERY PLANE                                                 ║
║ causal provenance · recall · recovery closure · compensation         ║
╠══════════════════════════════════════════════════════════════════════╣
║ LEARNING / QUALIFICATION PLANE                                       ║
║ verified trajectories · evals · adapter qualification · promotion    ║
╚══════════════════════════════════════════════════════════════════════╝
```

Authority is not transitive across planes.

---

# 5. Tool is a universal execution capability, not the unit of authority

A CIEAV tool may represent any capability capable of observing or changing software, cloud, device, or physical state:

```text
browser
email/calendar/chat
Word/Excel/desktop applications
CRM/ERP/SaaS
banking/payment/e-commerce
filesystem/database
Git/developer tools
cloud/infrastructure
operating-system actions
IoT / smart devices
industrial systems
robots / vehicles
future application protocols
```

The actual execution route may be:

```text
native API
MCP
A2A
OpenAPI
HTTP/gRPC
CLI
browser automation
desktop automation
enterprise RPA/connector platform
ROS2
MQTT
custom local IPC
```

CIEAV coordinates **what reality changes**, not which route was used.

Example:

```text
Windows Explorer Delete
CLI rm
Python os.remove
Desktop automation Delete
      ↓
DELETE file://device/documents/report.pdf
```

Different execution mechanics may correspond to one semantic consequence.

The long-term authority model is therefore:

```text
Consequence E
    ↓ admitted
Consequence Authority Envelope
    ↓
Qualified route chosen
    ↓
Route realizes E
```

not:

```text
Tool X receives broad permission
    ↓
Tool X decides what consequence occurs
```

---

# 6. Discovery plane vs Tool Trust Kernel

External systems may advertise:

```text
tool name
description
input schema
readOnly/destructive hints
idempotency hints
provider risk labels
protocol metadata
```

These are useful for discovery and candidate generation. They are **not trusted authority inputs**.

```text
ExternalToolDescription {
    source
    provider
    externalToolId
    operation
    description
    externalSchema
    externalAnnotations
    observedVersion?
    trust: UNTRUSTED_DISCOVERY
    authority: false
}
```

A malicious or compromised provider must not redefine a destructive operation as `READ`, `SAFE`, `IDEMPOTENT`, or `REVERSIBLE` by changing metadata.

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

A semantic/executable change can require requalification.

---

# 7. Qualified Tool Manifest

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

The manifest itself has zero authority. It is trusted semantic material used by the Authority plane.

---

# 8. Tool proposal and trusted materialization

A model/agent may propose:

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

Trusted path:

```text
ToolProposal
     ↓
qualified tool lookup
     ↓
argument schema validation
     ↓
trusted semantic compiler
     ↓
Consequence Bundle compiler
     ↓
Canonical Reality Resolver
     ↓
Consequence materialization
```

If model-suggested semantics disagree with qualified semantics for a protected effect, the protected path fails closed.

The model may help discover intent. It does not define authority-bearing consequence truth.

---

# 9. Consequence Bundle

One software action may create multiple consequences. A single semantic effect is a compatibility primitive, not the universal abstraction.

Example checkout:

```text
PURCHASE item
TRANSFER_VALUE money
CREATE order
SHARE shipping address
UPDATE inventory
CREATE shipment obligation
COMMUNICATE confirmation
```

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

A legacy one-effect operation maps to a one-effect bundle.

Bundle semantics are necessary for payments, communications, shopping, CRM/ERP transitions, permission changes, cloud operations, UI workflows, and physical systems.

---

# 10. Canonical Reality Address and Resolver Registry

Route-independent consequence coordination requires route-native identities to converge on one reality object.

```text
CanonicalRealityResolver {
    id
    version
    digest
    supportedNamespaces[]
    resolve(routeNativeIdentity, context)
    verify(resolution, evidence)
    authority: false
}
```

A `RealityResolution` contains:

```text
canonicalRealityAddress
routeAliases[]
identityEvidenceRefs[]
ambiguityState
confidenceClass
resolverId/version/digest
```

Example:

```text
Git CLI remote/ref
GitHub REST ref resource
GitHub browser branch URL
Desktop Git client repository ID
         ↓
cieav://git/organization/project/ref/main
```

A protected operation must not silently proceed when canonical identity is ambiguous.

Canonicalization evidence must be stored and auditable. Alias poisoning/collision is a security problem.

The long-term protocol-level primitive is a **Canonical Reality Address**: an address for the real object/economic/physical state affected by a consequence, independent of how software exposes it.

---

# 11. Semantic/compiler supply-chain and runtime binding

Authority is valid only for the exact qualified semantics and execution implementation.

Bind, as applicable:

```text
toolManifestDigest
semanticCompilerDigest
consequenceBundleCompilerDigest
canonicalResolverDigest
adapterArtifactDigest
runtimeIdentityDigest
proofContractDigest
recoveryContractDigest
routeQualificationDigest
```

If any binding changes after authorization:

```text
invalidate commit/ticket
→ rematerialize
→ rerun Algebra
→ rerun quarantine/proofability
→ rerun policy/approval/authority
```

Possible artifact/runtime evidence:

```text
package integrity
signed executable
signed manifest
container/image digest
SLSA/Sigstore-class provenance
mTLS workload identity
SPIFFE-like workload identity
TPM
Secure Enclave
remote provider attestation
```

The architecture requires verifiable identity; it does not mandate one external vendor.

---

# 12. Consequence Program vs Consequence Bundle

`ConsequenceProgram` expresses an objective and candidate ways to achieve it:

```text
objective
expected/desired world change
preconditions
candidate execution paths
required authority
proof obligations
recovery semantics
UNKNOWN policy
duplicate policy
```

`ConsequenceBundle` expresses what one concrete qualified invocation may cause.

```text
Consequence Program
      ↓ selects candidate outcome/path
Tool Invocation
      ↓
Consequence Bundle
      ↓
Reality Transaction Kernel
```

Planning and concrete effect materialization remain separate.

---

# 13. Consequence Algebra

The Algebra answers:

> When multiple agents, tools, applications, protocols, or devices may act on the same reality, how are their proposed consequences related before authority is issued?

Primary primitives:

```text
Canonical Reality Address
Consequence Bundle
Semantic Effect Identity
Consequence Footprint
Relation Algebra
Invariant Compatibility Witness
Active Consequence Graph
Consequence Reservation
Proof Plan Reservation
Causal Reality Fence
Semantic idempotency/reconciliation
Cumulative anti-fragmentation policy
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

Admission decisions constrain authority but do not create it:

```text
ADMIT
BLOCK
COORDINATE
RECONCILE
```

Protected `UNKNOWN_RELATION` follows fail-closed policy.

---

# 14. Active Consequence Graph

This graph is production coordination state.

Node classes may include:

```text
TRUSTED_MATERIALIZED
RESERVED
AUTHORIZED
COMMITTED
DISPATCHED
OBSERVING
OBSERVED_SUCCESS
OBSERVED_FAILURE
UNKNOWN
LEGITIMACY_INVALIDATED
RECOVERY_REQUIRED
RECOVERY_IN_PROGRESS
```

Edges include relation results plus causal/proof/recovery dependencies.

The graph persists:

```text
active reservations
unsettled outcomes
proof obligations
causal predecessors
aggregate/cumulative state
quarantine state
route realization state
recovery dependencies
```

Authority admission must read and mutate the graph transactionally enough to prevent two callers from independently acquiring incompatible authority.

---

# 15. Consequence Footprint

A consequence is not only a target resource.

Footprints may contain:

```text
realityRead[]
realityWrite[]
create[]
delete[]
grant[]
revoke[]
authorityUse[]
credentialUse[]
budgetDeltas{}
privacyExternalities[]
proofDependencies[]
invariantsTouched[]
spatialRegion?
temporalWindow?
```

Bundle-level footprint composition must preserve secondary, conditional, deferred, privacy, monetary, and physical effects.

---

# 16. Reality Quarantine Closure

UNKNOWN/unsettled state has a semantic blast radius.

CIEAV computes the relation closure that depends on resolving a source consequence:

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
A = TRANSFER_VALUE $50k = UNKNOWN

B = same transfer through another route
    EQUIVALENT → BLOCK / RECONCILE

C = mark invoice paid
    REQUIRES proof(A success) → WAIT

D = send “payment completed”
    REQUIRES proof(A success) → WAIT

E = unrelated utility payment
    INDEPENDENT → may continue
```

Properties:

- relation-aware, not simple resource locking;
- deterministic/qualified graph rules;
- persistent across restart;
- recomputed after evidence/relation changes;
- independent work does not freeze unnecessarily;
- quarantine never mints authority.

---

# 17. Proofability Reservation and Evidence Quorum

A successful transport response is not the same as observed remote success.

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

High-risk consequences may require:

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

- HTTP success does not automatically settle a consequence;
- model/tool text is not proof by itself;
- timeout does not imply failure;
- proof providers remain zero-authority;
- proofability may be reserved before execution;
- unavailable required proof topology may prevent authority;
- non-idempotent UNKNOWN effects reconcile before retry.

---

# 18. Consequence Authority Envelope

Authority progressively binds to an admitted consequence rather than merely a tool invocation.

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

Only the Authority / Commit Plane may mint this envelope.

A route may realize only the bound consequence and may not expand its effect surface.

This is the basis for safe route substitution and failover without granting generic broad tool permission.

---

# 19. Least-Consequence Routing

When multiple qualified routes can realize the same consequence, route selection should minimize execution risk and consequence uncertainty.

Candidate dimensions:

```text
proofability
idempotency strength
reversibility/compensation quality
adapter qualification
runtime identity strength
credential scope
privacy exposure
uncertainty risk
latency
financial cost
availability
provider concentration
```

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

Learned components may propose route scores. Protected eligibility and hard constraints remain deterministic/qualified.

---

# 20. Consequence-Preserving Failover

Traditional failover retries requests/providers. CIEAV must fail over an intended consequence without duplicating reality.

```text
ROUTE A SELECTED
    ↓
PROVEN PRE-COMMIT FAILURE
    → alternate qualified route may be selected

COMMIT BOUNDARY MAY HAVE BEEN CROSSED
    ↓
UNKNOWN
    → quarantine equivalent routes
    → reconcile
    → no blind failover

OBSERVED_SUCCESS
    → equivalent route requests reconcile to existing success

OBSERVED_FAILURE + qualified negative evidence
    → alternate route may receive fresh authority
```

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

Qualification must inject failures before and after commit boundaries and prove duplicate consequences cannot be created by failover.

---

# 21. Multi-Axis Settlement

A single action status cannot represent production reality.

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

Suggested state families:

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

Critical rule:

```text
physical/remote truth and legitimacy are independent.
```

Example:

```text
realityState = OBSERVED_SUCCESS
legitimacyState = CAUSALLY_TAINTED
recoveryState = REQUIRED
```

The transfer happened. CIEAV must preserve that fact while initiating recovery.

---

# 22. Causal Recall and Consequence Recovery Closure

A physically successful consequence can later become causally illegitimate because the evidence, identity, policy, tool, or predecessor that justified it is later invalidated.

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

CIEAV computes:

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

Flow:

```text
later invalidation
    ↓
causal provenance lookup
    ↓
descendant traversal
    ↓
legitimacy/evidence state update
    ↓
quarantine affected future consequences
    ↓
compute recovery closure
    ↓
propose recovery/compensation
    ↓
normal Tool Trust + Algebra + Authority path
```

Causal recall never rewrites physical history.

---

# 23. Recovery and compensation

Reversibility classes:

```text
REVERSIBLE
COMPENSABLE
IRREVERSIBLE
UNKNOWN_REVERSIBILITY
```

Recovery path:

```text
observed prerequisite reality
       ↓
new recovery/compensation proposal
       ↓
qualified tool materialization
       ↓
Canonical Reality + Algebra + Quarantine + Proofability
       ↓
Authority / Commit
       ↓
execution
       ↓
proof / settlement
```

Undo is never a privileged bypass.

---

# 24. Data-flow / instruction-taint architecture

Tool results can contain hostile instructions and sensitive data. Prompt filtering alone is insufficient.

Authority-relevant data carries:

```text
source identity
origin trust
observed/model-generated status
data category
privacy class
instruction trust
allowed sinks
retention/redaction policy
provenance chain
```

Example rule:

```text
EXTERNAL_UNTRUSTED content
cannot independently authorize
CONFIDENTIAL/CREDENTIAL data → EXTERNAL sink
```

Taint/provenance must survive model/tool hops when necessary to evaluate consequence and privacy policy.

Data movement itself may create consequence footprints and privacy externalities.

---

# 25. Browser/Desktop Commit Point Interceptor

Computer-use systems operate on clicks, keyboard input, selectors, DOM/accessibility nodes, and visual state. Those mechanics are not the consequence.

```text
screen / DOM / accessibility / app state
            ↓
semantic state extractor
            ↓
commit-point detector
            ↓
qualified Tool Invocation / Consequence Bundle
            ↓
Canonical Reality
            ↓
Algebra + Quarantine + Proofability + Authority
            ↓
release exactly the bound effectful transition
            ↓
post-state observation / settlement
```

Commit-point examples:

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
Start motion
```

Coordinates/selectors may change without changing semantic identity. Conversely, the same geometry can represent a radically different consequence.

---

# 26. Execution Fabric

Execution providers may include:

```text
browser/CDP
HTTP/REST/gRPC
MCP/A2A
filesystem
Git/code
cloud/infrastructure
SaaS/enterprise systems
database
Windows/.NET native services
desktop application automation
ROS2/C++ robotics
C/embedded devices
external connector/RPA platforms
```

Execution adapters should implement, where possible:

```text
operation identity
argument canonicalization
qualified manifest lookup
credential scope
idempotency semantics
precondition checks
ticket consumption
runtime identity verification
route commit-boundary reporting
execution correlation ID
post-state witness hooks
reconciliation hooks
recovery hooks
```

No adapter bypasses ticket consumption because it is native, local, signed, vendor-provided, or externally annotated “read-only.”

---

# 27. Authority / Commit Plane

Target inputs:

```text
principal identity
agent identity
model/checkpoint identity
delegated authority
credential lease
permission graph
exact operation/arguments digest
qualified Tool Manifest digest
semantic/bundle compiler digests
canonical resolver digest
adapter/runtime identity binding
canonical reality identity
fresh reality witness
Consequence Algebra admission/reservation
Active Consequence Graph snapshot/revision
Reality Quarantine Closure digest
Proof Plan / Evidence Quorum digest
policy
risk/reversibility
route constraints
proof/recovery obligations
```

Output:

```text
Consequence Authority Envelope
       ↓
Reality-Bound Commit
       ↓
short-lived / one-use Execution Ticket
```

A ticket authorizes only its exact bound consequence under exact trusted semantics and exact permitted route constraints.

---

# 28. Durable consequence lifecycle

```text
PROPOSED
   ↓
TRUSTED_MATERIALIZED
   ↓
ALGEBRA_ADMITTED / COORDINATED
   ↓
PROOFABILITY_RESERVED
   ↓
AUTHORIZED
   ↓
COMMITTED
   ↓
DISPATCHED
   ↓
OBSERVING
   ↓
┌──────────────────┬──────────────────┬──────────────────┐
OBSERVED_SUCCESS   OBSERVED_FAILURE   UNKNOWN
        │                 │                │
        │                 │                ▼
        │                 │       REALITY QUARANTINE
        │                 │            / RECONCILE
        │                 │
        └──────────────┬──┘
                       ▼
               LEGITIMACY / EVIDENCE
                    EVALUATION
                       │
         ┌─────────────┴─────────────┐
         VALID               INVALIDATED/TAINTED
                                     │
                                     ▼
                                CAUSAL RECALL
                                     │
                                     ▼
                              RECOVERY CLOSURE
```

`COMMITTED` means an exact consequence was committed/authorized under the constitution. It does not prove the remote world changed.

---

# 29. Persistence architecture

Production trusted state must not rely on process memory.

Required stores include:

```text
Identity Store
Receipt / Multi-Axis Settlement Store
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
Aggregation Ledger
Consequence Authority Envelope Store
Route Qualification Store
Route Decision Store
Failover / Reconciliation Store
Causal Provenance Store
Causal Recall Store
Recovery Closure Store
Context and Data-flow Provenance Store
Provider / Domain Agent / Skill / Model Registries
Self Model / Workspace Store
Audit Chain
```

An ambiguous dispatched consequence must not become executable again because a process restarted.

Secrets are referenced, not stored in semantic registries.

---

# 30. Qualification modes and Adapter Qualification SDK

Operational modes where feasible:

```text
OBSERVE_ONLY
    materialize/log only; no execution authority

SHADOW
    evaluate what would be admitted/blocked/quarantined/routed
    without controlling execution

ENFORCE
    protected effectful execution requires valid CIEAV authority
```

Promotion to `ENFORCE` is version-specific and evidence-bound.

The Adapter Qualification SDK must execute deterministic fixtures/fault scenarios for:

```text
argument validation
semantic under-description
bundle completeness
canonical alias resolution
false equivalence
false independence
privacy/data-flow effects
duplicate/idempotency behavior
UNKNOWN reconciliation
quarantine closure
proof availability/freshness/evidence quorum
route eligibility
pre/post-commit failover
recovery/compensation
multi-axis settlement
causal recall propagation
manifest/compiler/resolver drift
adapter artifact substitution
runtime identity mismatch
crash/restart behavior
commit-point bypass
```

Output target:

```text
CIEAV_TOOL_ADAPTER_QUALIFICATION_V1
```

A community/vendor adapter remains unqualified until its exact version/profile passes required gates.

---

# 31. Qualification reports

Target machine-readable evidence includes:

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
CIEAV_SQLSERVER_LIVE_QUALIFICATION_V1
```

A PASS binds, as applicable:

```text
git commit
schema version
fixture corpus digest
qualified manifest set digest
semantic/bundle compiler set digest
resolver set digest
relation/invariant rule-set digest
adapter artifact identities
proof/recovery contract digests
route qualification digests
negative/fault results
explicit untested fields
```

Static token checks alone cannot establish production qualification.

---

# 32. SQL Server authority topology

The Reality Transaction Kernel does not weaken authority-state database requirements.

For production horizontal authority, SQL Server must own trusted shared state where configured, including atomic multi-key trusted-state transitions, DB-clock leases, and fencing.

Offline evidence and live topology evidence remain distinct.

Live production/HA claims require real:

```text
listener connectivity
writer lease behavior
connection-loss handling
DB restart
stale-writer fencing
deadlock/retry behavior
process restart/recovery
backup/restore/migration
Always On failover
network partition testing
```

Until that evidence exists:

```text
clusterHaQualified = false
authority = false
mayMintExecutionAuthority = false
executionAuthorityIssued = false
```

for external/live qualification reports.

---

# 33. Security model

Threats include:

```text
tool poisoning
post-approval metadata rug-pull
manifest substitution
semantic under-description
READ-for-write deception
missing secondary effects
alias poisoning/collision
resolver/compiler downgrade
adapter artifact substitution
runtime workload substitution
argument smuggling
schema confusion
prompt injection from tool output
cross-tool toxic data flows
privacy/credential exfiltration
fake/stale/colluding proof providers
blind UNKNOWN retry
cross-route duplicate bypass
fragmentation/salami slicing
quarantine-closure bypass
causal-fence bypass
route-score manipulation
unsafe failover after commit boundary
route/provider substitution
settlement-state rewriting
causal-recall suppression
recovery bypass
UI commit-point bypass
selector/coordinate drift
```

Protected ambiguity fails closed or requires explicit coordination/reconciliation.

Hostile retrieved text may propose data or instructions. It may not forge canonical identity, trusted semantics, proof, relation results, quarantine state, route eligibility, approval, or authority.

---

# 34. Definition of production-qualified operation

A protected effectful operation is production-qualified only when:

```text
exact tool/provider/application identity known
external description separated from trusted manifest
arguments schema validated
trusted semantic compiler qualified
Consequence Bundle sufficiently complete
canonical resolver qualified or ambiguity explicit
privacy/data-flow externalities represented
manifest/compiler/resolver/adapter/runtime identities authority-bound where required
relation/invariant behavior qualified
Active Consequence Graph enforcement active
Reality Quarantine behavior qualified
proofability/reconciliation path available
Evidence Quorum satisfiable where configured
route eligibility/failover behavior qualified
recovery/reversibility classified
UNKNOWN preserved safely
multi-axis settlement enabled for required profile
fault/negative tests pass
observability/audit complete
machine-readable qualification evidence exists
```

A connected tool is not automatically a trusted tool.

A trusted tool is not automatically a complete Reality Transaction path.

---

# 35. Immediate architectural milestones

```text
M0  Reality Transaction architecture/document boundary lock
M1  TrustedToolConsequenceContract wired into Execution Fabric authority/ticket/recovery path
M2  ConsequenceBundleV1
M3  Canonical Reality Resolver Registry with genuine heterogeneous fixtures
M4  production Active Consequence Graph enforcement
M5  Reality Quarantine Closure
M6  Proofability Reservation + Evidence Quorum
M7  Consequence Authority Envelope + semantic supply-chain/runtime binding
M8  Least-Consequence Routing + Consequence-Preserving Failover
M9  Multi-Axis Settlement
M10 Causal Recall + Consequence Recovery Closure
M11 cross-tool data-flow / taint / privacy consequence semantics
M12 browser/desktop Commit Point Interceptor
M13 Adapter Qualification SDK
M14 first real heterogeneous Reality Transaction benchmark
M15 Tool/Reality/Algebra/Quarantine/Proof/Failover/Settlement/Recall release gates
M16 live SQL authority / failover / partition qualification
M17 broad application/tool scaling through native + external ecosystems
```

Broad adapter count is deliberately after the semantic/coordination/authority substrate.

---

# 36. Long-term system

```text
LIVE REALITY
      ↓
DETERMINISTIC DOMAIN / SYSTEM SERVICES
      ↓
PERMISSION-BOUND CONTEXT
      ↓
CIEAV APPLICATION AGENT / CORTEX
      ↓
MODEL / AGENT REASONING
      ↓
UNTRUSTED TOOL DISCOVERY
      ↓
QUALIFIED TOOL TRUST KERNEL
      ↓
CONSEQUENCE BUNDLE
      ↓
CANONICAL REALITY
      ↓
CONSEQUENCE ALGEBRA
  equivalence · conflict · causality · invariants · aggregation
      ↓
ACTIVE CONSEQUENCE GRAPH
  reservations · cumulative state · proof dependencies
      ↓
REALITY QUARANTINE
  relation-aware uncertainty propagation
      ↓
PROOFABILITY / EVIDENCE QUORUM
      ↓
CONSEQUENCE AUTHORITY ENVELOPE
      ↓
LEAST-CONSEQUENCE QUALIFIED ROUTE
      ↓
REALITY-BOUND COMMIT
      ↓
ONE-USE EXECUTION TICKET
      ↓
QUALIFIED EXECUTION
      ↓
CONSEQUENCE-PRESERVING FAILOVER / RECONCILIATION
      ↓
INDEPENDENT PROOF
      ↓
MULTI-AXIS SETTLEMENT
  reality · legitimacy · evidence · recovery
      ↓
CAUSAL RECALL / RECOVERY CLOSURE WHEN REQUIRED
      ↓
VERIFIED AUDIT / LEARNING
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
ROUTE DECISION AUTHORITY = 0
CONSEQUENCE ALGEBRA AUTHORITY = 0
QUARANTINE AUTHORITY = 0
PROOF PROVIDER AUTHORITY = 0
RECOVERY PLANNER AUTHORITY = 0
LEARNING AUTHORITY = 0
```

The defining architecture is:

> **CIEAV changes the unit of autonomous execution from a tool call to a globally coordinated real-world consequence.**

The production target is:

> **A Reality Transaction Kernel that canonicalizes consequences across heterogeneous routes, coordinates equivalent/conflicting/dependent/unresolved effects before commitment, grants minimum local authority to the admitted consequence rather than the model, selects and fails over between qualified routes without duplicating reality, and preserves truthful settlement even when causal legitimacy changes after the action has physically succeeded.**
