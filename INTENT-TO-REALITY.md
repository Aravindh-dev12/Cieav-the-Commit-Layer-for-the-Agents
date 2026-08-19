# CIEAV Intent-to-Reality Architecture

CIEAV is the commit layer between digital intent and real-world consequence. This document defines the production architecture that extends the Agent Kernel from task authorization into an intent-to-reality transaction protocol.

The design is deliberately independent of any one agent, model, MCP server, browser, API, or operating system. Models may interpret and plan. Local CIEAV authority decides when a consequential effect may become real, records the effect, waits for independent evidence, and settles or recovers without treating uncertainty as success.

## System boundary

```text
Human / organization / automation
              |
          Root Intent
              |
        Intent Contract
              |
       delegation chain
              |
  Intent Attenuation Witnesses
              |
        Agent Kernel task
              |
         Commitment
              |
     Consequence proposal
              |
      consequence-drift gate
              |
   optional Reversibility Escrow
              |
       pre-state witness
              |
      Reality-Bound Commit
              |
      state revalidation
              |
       atomic consumption
              |
          REAL EFFECT
              |
          OBSERVING
              |
           Proof Mesh
              |
      +-------+-------+
      |       |       |
    PROVEN DISPROVEN UNKNOWN
      |       |       |
  COMPLETE  FAILED  QUARANTINE
      |               |
 escrow active      reconcile
```

## Non-negotiable invariants

1. **Intent is durable.** A task is bound to a root `intentId`; a descendant delegation may narrow authority but must not broaden it.
2. **Authority is not execution.** An `AUTHORIZED` Commitment is necessary but not sufficient for consequential agent execution.
3. **Reality is part of authorization.** Consequential execution requires a short-lived Reality-Bound Commit tied to the exact proposal, semantic effect, proof obligation, observed pre-state, and expected post-state.
4. **Commit is state-sensitive.** Immediately before execution, the current Reality Witness must equal the authorized pre-state witness. If reality changed, the commit is invalidated.
5. **Commit is single-use.** A Reality-Bound Commit can transition from `ISSUED` to `CONSUMED` only once.
6. **Equivalent unresolved effects cannot be retried.** `UNKNOWN` or changed-reality outcomes create an effect quarantine that survives agent/tool/channel changes.
7. **Completion is proof-gated.** `COMPLETED` requires independently settled `PROVEN`. An agent self-report cannot directly complete a consequential task.
8. **UNKNOWN is not failure and not success.** It creates governed recovery and effect quarantine until reconciliation.
9. **Cumulative drift is bounded.** A sequence of locally plausible actions cannot exceed the root Intent's consequence-drift budget.
10. **Learning cannot grant itself authority.** Autonomy learning can create a candidate only. Expansion requires verified clean outcomes, historical safety replay, and an explicit ratification transition.
11. **Undoable/compensable actions can require a reserved inverse.** A Commitment whose recovery policy is `UNDO` or `COMPENSATE` cannot receive a Reality-Bound Commit without a matching Reversibility Escrow.
12. **Durable authority state fails closed.** Integrity failure in the authenticated local store prevents state loading rather than silently resetting authority.

## Core mechanisms

### Reality Witness

A Reality Witness is a canonical set of observed facts. Individual fact values are represented by SHA-256 digests. Observation timestamps remain audit metadata and do not change the state identity. This prevents an unchanged world observed one second later from invalidating a commit.

```text
RealityWitness
  observedAt
  facts[]
    key
    valueDigest
    source
    observedAt
  digest
```

The witness digest is derived from `(key, valueDigest, source)` tuples in canonical order.

### Semantic Effect Identity

CIEAV computes an `effectKey` from the root Intent plus normalized semantic effect:

```text
SHA256({ version, intentId, semanticEffect })
```

The semantic effect describes the consequence, not the transport. A bank API payment, browser payment, and MCP payment can therefore map to the same consequence identity when their normalized effect matches.

This is the basis for cross-channel retry quarantine.

### Intent Attenuation Witness

A child authority envelope must not broaden the parent envelope. Current deterministic checks cover:

- maximum risk
- action types
- targets
- monetary ceiling
- delegation depth

A valid attenuation produces a durable witness containing parent digest, child digest, removed scopes, delegation depth, and witness digest. This lets an execution path demonstrate that authority only narrowed through delegation.

### Consequence Drift Ledger

Each Intent can carry a cumulative drift budget. The runtime records bounded drift increments with a human/machine-readable basis. Once cumulative drift exceeds the budget, new Reality-Bound Commit issuance fails closed even if the individual proposal would otherwise be authorized.

This protects against multi-step goal drift where every individual action appears locally reasonable but the sequence moves away from the owner's original intent.

### Reversibility Escrow

For `UNDO` or `COMPENSATE` recovery policies, CIEAV can reserve the inverse before execution. The escrow is bound to the exact `effectKey` and includes digests of:

- inverse descriptor
- pre-effect snapshot
- optional inverse capability

Escrow states:

```text
RESERVED -> ACTIVATED -> RELEASED
    |             
    +-> INVALIDATED
```

`RESERVED` means the inverse has been prepared but the forward effect has not yet been independently proven. `ACTIVATED` occurs only after a trusted `PROVEN` settlement. A disproven effect releases the escrow. The actual secret/capability may remain in the OS-protected local secret store; the Intent-to-Reality state stores only its digest/reference semantics.

### Reality-Bound Commit

A Reality-Bound Commit binds:

- task ID
- Intent ID
- trusted Commitment ID
- actor principal
- proposal digest
- consequence-graph digest
- proof-obligation digest
- pre-state digest
- expected post-state digest
- semantic effect key
- optional reversibility escrow
- issue time and short expiry

Issuance is blocked when:

- the Commitment is not `AUTHORIZED`
- Commitment Intent does not match task Intent
- cumulative consequence drift exceeds budget
- the semantic effect is quarantined
- required reversibility escrow is absent or mismatched

Consumption is blocked when:

- it was already consumed or invalidated
- it expired
- current reality differs from the authorized pre-state
- the semantic effect is quarantined

Changed reality invalidates the permit and opens a `REALITY_CHANGED` quarantine rather than blindly re-authorizing.

### Epistemic Retry Quarantine

Effect quarantine states are `OPEN` and `RESOLVED`. Reasons are:

- `UNKNOWN_OUTCOME`
- `CONFLICTING_EVIDENCE`
- `REALITY_CHANGED`

An Agent Kernel task carrying a quarantined effect cannot enter `RUNNING` and cannot schedule a retry. The durable Intent-to-Reality store also blocks issuance/retry by `effectKey`, so changing agents or execution channels does not erase the unresolved consequence.

Only the trusted local Gateway reconciliation endpoint can resolve a quarantine. Resolution clears matching task quarantine flags but leaves tasks in governed recovery/replanning state; it does not silently resume execution.

### Proof-Gated Settlement

The existing Agent Kernel settlement invariant remains authoritative:

```text
RUNNING -> OBSERVING -> trusted proof -> settlement
```

`PROVEN` -> `COMPLETED`

`DISPROVEN` -> `FAILED`

`UNKNOWN` -> `RECOVERY_REQUIRED` + semantic-effect quarantine

Direct agent transition to `COMPLETED` remains forbidden.

### Verified Autonomy Ratchet

The learning plane cannot mutate the authority plane. It can only produce an `AutonomyCandidate` after:

- at least 20 independently `PROVEN` outcomes
- zero `DISPROVEN`
- zero `UNKNOWN`
- zero undone outcomes in the candidate evidence set
- historical replay reports zero previously denied actions that would become allowed
- historical replay reports zero critical actions that would become allowed

The candidate remains `CANDIDATE` until trusted local authority explicitly moves it to `RATIFIED` or `REJECTED`.

This makes autonomy expansion asymmetric: learning may recommend more authority, but it cannot grant it.

## Agent Kernel lifecycle

For consequential agent work:

```text
CREATED
  -> QUEUED
  -> PLANNING
  -> WAITING_FOR_AUTHORITY
       bind AUTHORIZED Commitment
       reserve inverse if required
       issue Reality-Bound Commit
       re-read current reality
       consume Reality-Bound Commit
  -> RUNNING
  -> OBSERVING
       bind independent proof
  -> COMPLETED | FAILED | RECOVERY_REQUIRED
```

A process restart while `PLANNING` or `RUNNING` moves work to `RECOVERY_REQUIRED`; CIEAV does not infer success after a crash.

A retry from recovery requires the quarantine to be resolved and receives a fresh Reality-Bound Commit. Old reality authorization is never reused.

## Trusted Gateway API

All `/v1/agent-kernel/*` routes are local-authority resources and are not exposed by CIEAV Cloud.

Operational read endpoints:

```text
GET  /v1/agent-kernel/runtime
GET  /v1/agent-kernel/tasks
GET  /v1/agent-kernel/quarantines
GET  /v1/agent-kernel/reversibility-escrows
GET  /v1/agent-kernel/autonomy-candidates
GET  /v1/agent-kernel/intents/:intentId/attenuation
GET  /v1/agent-kernel/intents/:intentId/drift
```

Authority/write endpoints:

```text
POST /v1/agent-kernel/tasks/:id/bind-commitment
POST /v1/agent-kernel/tasks/:id/reversibility-escrow
POST /v1/agent-kernel/tasks/:id/reality-commit
POST /v1/agent-kernel/tasks/:id/consume-reality-commit
POST /v1/agent-kernel/tasks/:id/settle
POST /v1/agent-kernel/quarantines/:id/resolve
POST /v1/agent-kernel/intents/:intentId/attenuation
POST /v1/agent-kernel/intents/:intentId/drift
POST /v1/agent-kernel/autonomy-candidates
POST /v1/agent-kernel/autonomy-candidates/:id/ratify
POST /v1/agent-kernel/autonomy-candidates/:id/reject
```

Agent bearer tokens do not receive these trusted mutation routes. Agents continue to use `/v1/agent/tasks/*` for task lifecycle operations within device/session/Intent scope.

## Persistence and integrity

The Agent Kernel keeps its existing authenticated durable state. Intent-to-Reality state is stored separately as `intent-reality-state.json` under the same per-user local state directory using a domain-separated key:

```text
HMAC(agentKernelStateSecret, "cieav-intent-reality-state-v1")
```

The file is wrapped in an HMAC-SHA256 authenticated envelope. Mutations are serialized. Persistence uses:

1. private state directory creation
2. exclusive temporary-file creation (`wx`)
3. write
4. file `fsync`
5. atomic rename
6. restrictive file mode where supported
7. directory `fsync` on non-Windows platforms where supported

Unreadable, malformed, tampered, or unauthenticated state fails closed.

## Operating-system architecture

The new protocol does not introduce a second daemon. It runs inside the existing CIEAV local authority process and therefore uses the existing CIEAV platform lifecycle on all supported systems.

### Windows

- local authority is per-user and loopback-only
- service/startup lifecycle remains managed by the existing Windows platform layer / Task Scheduler integration
- secrets continue to use the existing Windows protected-secret path
- atomic file replace is used; directory `fsync` is intentionally skipped because Windows directory handles do not provide the same portable Node semantics

### macOS

- local authority remains managed through the existing launchd integration
- secrets continue to use the existing Keychain path
- file and directory durability barriers are attempted before acknowledging state mutation

### Linux

- local authority remains managed through the existing systemd user-service integration
- secrets continue to use the existing Secret Service / configured fallback path
- file and directory durability barriers are attempted before acknowledging state mutation

The protocol code is TypeScript/Node 22 and is shared across the three operating systems; OS-specific process lifecycle and secret storage remain isolated in the platform layer.

## Cross-platform release gate

`scripts/intent-reality-release.mjs` validates static invariants, executes the Intent-to-Reality/Agent Kernel test suites, and typechecks contracts, core, and API packages.

`.github/workflows/intent-reality-cross-platform.yml` runs the gate on:

- `ubuntu-latest`
- `macos-latest`
- `windows-latest`

The root release gate also invokes the Intent-to-Reality gate, so a release candidate cannot bypass these invariants.

## Failure semantics

| Failure | Required behavior |
|---|---|
| state changed after authorization | invalidate commit; quarantine effect |
| commit expired | refuse execution; issue fresh authorization after re-evaluation |
| commit replay | refuse second consumption |
| task/process crash during active work | `RECOVERY_REQUIRED`; never assume success |
| proof contradicts expected consequence | `DISPROVEN` -> `FAILED` |
| proof insufficient | `UNKNOWN` -> quarantine + recovery |
| same effect attempted through another tool | block by semantic effect key while quarantine is open |
| drift budget exceeded | refuse new Reality-Bound Commit |
| delegation broadens parent | refuse attenuation witness/delegation |
| autonomy model asks for expansion | candidate only; no authority change |
| authenticated state is tampered | fail state load closed |
| undo/compensation requires inverse but none is reserved | refuse Reality-Bound Commit |

## Threat model

The design assumes agent output, model output, MCP tool descriptions, browser content, and downstream API responses may all be wrong or adversarial. No such component is a root of authority.

The local Gateway token, signing/secret material, durable authority state, reconciliation endpoints, and settlement transitions are privileged. Cloud semantic interpretation remains advisory; it cannot consume a local Reality-Bound Commit or settle trusted proof.

The protocol does not claim to make an arbitrary downstream service trustworthy. It makes uncertainty explicit and prevents CIEAV from silently converting uncertain external behavior into success or repeat execution.

## Release status language

Passing unit tests and the three-OS GitHub matrix means the **production architecture/hardening gate is green**. It does not by itself constitute public-production qualification. Final release qualification still requires clean-machine install/start/reboot/upgrade/rollback/uninstall evidence on Windows, macOS, and Linux, plus signing/notarization and real production Cloud/CDN configuration where applicable.
