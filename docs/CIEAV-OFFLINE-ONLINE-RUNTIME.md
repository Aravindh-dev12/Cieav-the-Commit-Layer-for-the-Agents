# CIEAV Offline + Online Runtime

Status: implementation architecture contract

## Thesis

CIEAV is offline-first integrity infrastructure, not a cloud service that happens to cache state locally.

The local node owns the execution trust boundary. Connectivity may expand cognition, proof and execution routes, but connectivity does not create authority.

```text
Intelligence may run anywhere.
Authority stays where the consequence is owned.
```

## Constitutional rules

1. Loss of internet must not erase local consequence state, policy, audit history, recovery state or authority-state history.
2. A cloud control plane cannot mint local execution authority.
3. A model provider cannot mint execution authority.
4. Offline operation is allowed only when local authoritative state, policy, journal and consequence graph are healthy.
5. An effect that requires unavailable remote reality, credentials, execution routes or proof waits rather than weakening policy.
6. Deferred network work stores a proposal, never a reusable authority token or executable credential.
7. Reconnect never means "flush the queue".
8. UNKNOWN consequences are reconciled before equivalent/conflicting deferred work can receive fresh authority.
9. Online configuration/catalog updates are zero-authority inputs and must be verified and revalidated locally.
10. Cloud synchronization exports evidence/state events, not root authority or raw executable credentials.

## Runtime topology

```text
                         CIEAV NODE

┌────────────────────────────────────────────────────────────┐
│                    LOCAL COGNITION                         │
│ local model / LAN model / deterministic cognition         │
│ authority = 0                                             │
└──────────────────────────┬─────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────────┐
│                   LOCAL INTEGRITY                          │
│ epistemic state                                            │
│ provenance                                                 │
│ continuity                                                 │
│ trusted tool semantics                                     │
│ consequence graph                                          │
│ reality quarantine                                         │
└──────────────────────────┬─────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────────┐
│                    LOCAL AUTHORITY                         │
│ policy                                                     │
│ reservations                                               │
│ proofability                                               │
│ one-use consequence authority                              │
│ credentials broker                                         │
└──────────────────────────┬─────────────────────────────────┘
                           │
                           ▼
                qualified local adapters
                           │
                           ▼
                        REALITY

When network exists:

     ┌────────────────────────────────────────────┐
     │ OPTIONAL ONLINE / LAN CAPABILITIES         │
     │ Conifer / model gateways                   │
     │ OpenAI / Anthropic / Gemini                │
     │ remote tools / SaaS / bank / cloud         │
     │ remote proof providers                     │
     │ signed catalog/policy distribution         │
     │ audit/evidence replication                 │
     └──────────────────────┬─────────────────────┘
                            │
                            ▼
                    zero-authority inputs
                            │
                            ▼
                    LOCAL REVALIDATION
```

## Connectivity states

### OFFLINE

No usable network path.

Allowed:
- deterministic reasoning;
- local models;
- local memory/provenance;
- local policy evaluation;
- local qualified adapters;
- consequences whose required reality and proof are local;
- local settlement;
- durable journaling;
- local recovery.

Not silently allowed:
- cloud-only inference;
- remote APIs;
- fresh bank/cloud reality checks;
- remote credential leases;
- remote-only proof providers.

### LAN_ONLY

CIEAV may use qualified LAN inference/proof/execution services but cannot assume internet availability.

### ONLINE_DEGRADED

Internet is reachable but some providers/routes are unavailable. CIEAV selects only qualified available routes and does not treat provider failure as authority to weaken requirements.

### ONLINE

All configured online capabilities may be considered, subject to local policy and authority.

## Cognitive routing

Cognitive routing is zero-authority.

```text
task
  ↓
local model available and sufficient?
  ├─ yes → local model
  └─ no
      ↓
LAN route allowed and available?
  ├─ yes → LAN model
  └─ no
      ↓
cloud allowed + connected + qualified?
  ├─ yes → cloud model
  └─ no → WAIT / UNAVAILABLE
```

CIEAV must never change a `LOCAL_ONLY` or privacy rule just because a cloud model is the only available model.

Conifer can be one implementation behind the inference gateway, but it is not required. Direct OpenAI, Anthropic, Gemini, Ollama, vLLM, llama.cpp and future gateways can implement the same CIEAV intelligence interface.

## Offline consequence admission

A consequence can proceed to the local authority kernel offline only when all required local preconditions are satisfied:

```text
local authority ready
AND local authoritative state ready
AND local policy ready
AND durable local journal ready
AND local consequence graph ready
AND qualified local adapter available
AND network requirement satisfied
AND fresh reality requirements satisfied
AND credential requirements satisfied
AND proofability requirement satisfied
```

Passing this admission still does not issue authority. It means only `ALLOW_FOR_AUTHORIZATION`.

## Proofability offline

Required proof cannot be casually deferred.

If a proof provider is unavailable, CIEAV normally waits.

A qualified consequence class may permit later proof only when a durable local proof reservation/evidence obligation already exists. This ensures reconnect cannot erase the duty to settle the outcome.

```text
remote proof unavailable
  ↓
qualified durable local proof reservation exists?
  ├─ no  → WAIT_NETWORK
  └─ yes → may continue under consequence-specific policy
           settlement remains constrained by actual evidence
```

## Deferred network work

Offline CIEAV may defer a proposal when the action requires connectivity.

A deferred proposal contains:
- proposal reference;
- consequence identity when known;
- requirement digest;
- why connectivity is required;
- queue timestamp.

It explicitly does **not** contain:
- reusable execution authority;
- executable credentials.

```text
proposal
  ↓
network unavailable
  ↓
DEFERRED PROPOSAL
  authority = 0
  credentials = none
```

## Synchronization

The sync channel replicates tamper-evident local event/evidence history.

A sync envelope is chained by digest and contains event references plus an event-set digest.

It explicitly declares:

```text
authorityStateIncluded = false
executableCredentialIncluded = false
```

The cloud can store, analyze, index and audit the synchronized evidence, but cannot transform the sync envelope into local execution authority.

## Online control updates

The online control plane may distribute signed:
- policy bundles;
- model catalogs;
- qualified tool catalogs;
- revocation sets;
- compatibility metadata.

These are zero-authority updates.

```text
cloud update
  ↓
signature / expiry / provenance validation
  ↓
local compatibility validation
  ↓
local policy/tool state revalidation
  ↓
future local authority decisions may use new state
```

Receiving an update never directly authorizes a consequence.

## Safe reconnect

Reconnect is a reconciliation procedure, not a queue flush.

Required ordering:

```text
1. UPLOAD_LOCAL_LEDGER
2. FETCH_SIGNED_CONTROL_UPDATES
3. REVALIDATE_LOCAL_POLICY_AND_TOOL_STATE
4. RECONCILE_UNKNOWN_CONSEQUENCES
5. REVALIDATE_DEFERRED_PROPOSALS
6. ISSUE_FRESH_LOCAL_AUTHORITY_IF_ALLOWED
```

Outstanding authority from before the disconnect must not automatically resume merely because the network returned.

### Example

A payment attempt times out immediately before internet loss.

Local state:

```text
payment consequence = UNKNOWN
```

While offline the user asks to pay the same invoice through another route.

CIEAV identifies an equivalent consequence and defers/blocks it.

On reconnect:

```text
upload local evidence
  ↓
query bank/processor reality
  ↓
OBSERVED_SUCCESS?
  ├─ yes → settle existing payment; do not retry
  └─ no
      ↓
qualified OBSERVED_FAILURE?
  ├─ yes → new proposal can be re-evaluated
  └─ no  → remain UNKNOWN / quarantined
```

## Local storage

Developer mode can use an embedded local durable store.

Production deployments should use a qualified local/edge authority store with:
- atomic compare-and-swap;
- durable journal;
- tamper evidence;
- crash recovery;
- fencing/leases when multiple writers exist;
- monotonic local sequence numbers;
- backup/restore qualification.

The cloud database is not assumed to be the source of local execution authority.

## Local cognition stack

Recommended optional adapters:

```text
CIEAV Intelligence ABI
  ├─ Conifer
  ├─ Ollama
  ├─ llama.cpp
  ├─ vLLM
  ├─ local OpenAI-compatible endpoint
  ├─ direct OpenAI
  ├─ direct Anthropic
  └─ direct Gemini
```

The cognitive router chooses among them based on capability, policy, privacy, cost, latency, availability and potential consequence severity.

## Offline integrations

Useful fully or partially offline integrations include:
- local filesystem;
- Git repositories;
- local databases;
- IDE/editor tooling;
- LAN services;
- local document analysis;
- local models;
- local industrial/robot control networks where appropriately qualified;
- local browser automation against LAN/local applications.

Internet-native effects such as public email delivery, SaaS mutation, cloud deployment and bank transfers require connectivity to their target reality and must wait when that reality cannot be safely reached or observed.

## Product experience

The user should see a single CIEAV system with explicit capability state:

```text
CIEAV status

Connectivity: OFFLINE
Local authority: READY
Local consequence graph: READY
Local model: READY
Cloud models: UNAVAILABLE
Local adapters: 8 READY
Remote adapters: 17 WAITING_NETWORK
Unknown consequences: 1
Deferred proposals: 3
Sync backlog: 42 events
```

When the network returns:

```text
Connectivity: ONLINE
Reconnect state: RECONCILING
Unknown consequences: 1
Deferred proposals: 3
Authority resume: FORBIDDEN
```

After reconciliation:

```text
Reconnect state: READY
Deferred proposals requiring fresh evaluation: 2
```

## Deployment modes

### Personal / laptop

```text
cieav daemon
embedded authoritative store
OS keystore
local model optional
Conifer/Ollama optional
browser/CLI/filesystem adapters
```

### Edge / enterprise

```text
site-local CIEAV authority node
local SQL authority store
TPM/HSM/KMS-backed signing
local/LAN inference
central cloud control plane optional
remote evidence replication
```

### Disconnected / critical environment

```text
no public internet dependency
local signed policy bundle
local model/runtime
local qualified tools
local proof providers
local ledger/graph/settlement
signed offline update packages
```

## Strategic boundary

CIEAV should not claim that no prior system has ever implemented offline agents, local inference, synchronization or local-first software. Those primitives exist widely.

The CIEAV differentiation to test and substantiate is the integrated architecture:

- interchangeable local/cloud cognition with zero model authority;
- local consequence-bound authority;
- canonical cross-route consequence identity;
- persistent active consequence graph;
- UNKNOWN quarantine;
- proofability before authority;
- deferred proposals that carry no authority;
- safe reconnect with reconciliation before retry;
- zero-authority cloud control updates;
- causal provenance, settlement and recovery across offline/online transitions.

The public claim should remain scoped to what can be demonstrated and compared against prior art.

## Acceptance criteria

The offline-online runtime is production-qualified only after demonstrating:

1. internet loss does not prevent local authority-state recovery;
2. local-only qualified actions can proceed offline;
3. cloud-only cognition waits rather than weakening routing/privacy policy;
4. network-required consequences do not execute offline;
5. deferred proposals carry no authority or executable credential;
6. sync envelopes contain no root authority or executable credentials;
7. control-plane updates cannot mint local authority;
8. crash/restart preserves offline queue, UNKNOWN state and journal chain;
9. reconnect reconciles UNKNOWN before equivalent/conflicting deferred actions;
10. pre-disconnect authority does not silently resume;
11. local and online models produce inspectable provenance;
12. partitions, clock changes, stale policies and revocations are fault-injected;
13. real local model + real offline adapter + reconnect integration tests pass;
14. multi-node/edge conflict behavior is explicitly qualified rather than assumed.
