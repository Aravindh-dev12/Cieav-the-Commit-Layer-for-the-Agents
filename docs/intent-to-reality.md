# CIEAV Intent-to-Reality Transaction Core

CIEAV is the local commit layer between intelligence and consequence. Models and agents may interpret, plan, and propose. The local CIEAV authority decides whether a consequential action may cross into the world and whether the resulting reality is sufficient to settle the task.

This document describes the production architecture implemented by the Intent-to-Reality core. It is intentionally protocol-neutral: MCP, A2A, browsers, API clients, automations, and future agent runtimes can use the same local authority and settlement primitives.

## System invariants

1. **Intent continuity.** Every governed task is bound to an owner Intent Contract. Delegation may reduce authority but may not enlarge it.
2. **Trusted authority before execution.** An AGENT task cannot enter consequential execution without trusted authority.
3. **Trusted reality witnesses.** An agent cannot self-certify the world state used to authorize its own effect. Reality state witnesses are issued through trusted local Gateway/adapter paths and referenced by ID from agent protocols.
4. **Reality-bound commit.** A commit permit is bound to root intent, task, proposal, actor, semantic effect, pre-state hash, expected consequence, proof kinds, and expiry. If current reality differs from the authorized pre-state, the commit is invalidated.
5. **Single-use effect boundary.** A consumed Reality-Bound Commit transitions the task into observation. Consumption is not completion.
6. **Proof-gated settlement.** Only trusted Proof Mesh settlement can complete a task. Agent reports cannot independently produce completion.
7. **UNKNOWN is first-class.** If an external effect cannot be proved or disproved, the task does not silently succeed.
8. **Semantic retry quarantine.** An unresolved effect produces a quarantine keyed by normalized consequence, not transport request ID. Equivalent attempts through a different agent, MCP server, API, or browser channel remain blocked until reconciliation.
9. **Cumulative consequence drift.** Each proposed consequence can consume a mission-level drift budget. A sequence of individually plausible actions cannot exceed the configured cumulative divergence from the root intent.
10. **Verified autonomy ratchet.** Automatic authority contraction is allowed. Authority expansion is only a candidate after historical safety replay and requires trusted human/organization ratification before it changes the Intent Contract.
11. **Reversibility escrow.** A claimed inverse for a reversible or compensable effect is reserved separately. It remains unavailable until the forward effect is independently PROVEN, after which the exact inverse can be activated and consumed once through governed execution.
12. **Durable local state.** Intent-to-reality records are authenticated at rest and replaced durably. Corrupt or unauthenticated state fails closed.

## Transaction lifecycle

```text
Owner Intent Contract
        |
        v
Agent Kernel task
        |
        v
trusted Commitment / authority
        |
        v
Intent Attenuation Witness (when delegated)
        |
        v
Trusted pre-state witness
        |
        v
Consequence proposal + drift accounting
        |
        v
Reality-Bound Commit permit
        |
        v
Fresh trusted current-state witness
        |
   state unchanged?
      /      \
    no        yes
    |          |
invalidate   consume once
               |
               v
            OBSERVING
               |
               v
            Proof Mesh
        /        |        \
    PROVEN   DISPROVEN   UNKNOWN
       |          |          |
   COMPLETE     FAILED   RECOVERY_REQUIRED
       |                     |
activate inverse       Effect Quarantine
   escrow                    |
                        reconcile reality
```

## Reality-Bound Commit

A normal authorization can remain technically valid after the world changes. CIEAV instead binds authority to an observed pre-state.

For example, an agent may be authorized to pay invoice `INV-44` because it is currently unpaid. Before the effect, a trusted adapter creates a new state witness. If another process has already paid the invoice, the pre-state hash no longer matches and the permit is invalidated even if its identity, scope, and TTL are otherwise valid.

This is an optimistic-concurrency boundary for real-world digital consequences.

## Trusted state witnesses

State facts are hashed locally. The stored witness records provenance (`TRUSTED_LOCAL_OBSERVER`, `TRUSTED_ADAPTER`, or `HUMAN_ATTESTATION`) and a source/observer identifier where available.

Agents receive only the witness ID needed for a transaction. MCP and A2A cannot submit arbitrary facts and label those facts as trusted reality.

Trusted Gateway route:

- `POST /v1/agent-kernel/intent-reality/state-witnesses`

Agent transaction routes:

- `POST /v1/agent/tasks/:taskId/prepare-reality-commit`
- `POST /v1/agent/tasks/:taskId/consume-reality-commit`

## Intent Attenuation Witness

Delegation is represented as a signed authority delta. CIEAV verifies that a child scope cannot widen:

- allowed actions or targets,
- maximum risk,
- financial ceiling,
- external-recipient authority,
- data categories,
- delegation depth,
- independent-verification requirements,
- human-approval thresholds,
- denied action/target sets.

An empty child allow-list is treated conservatively when the parent has a bounded allow-list; it cannot be used as an accidental `allow all` representation.

Trusted Gateway route:

- `POST /v1/agent-kernel/intent-reality/attenuation-witnesses`

Delegated proposals must supply the corresponding attenuation witness before CIEAV can prepare a Reality-Bound Commit.

## Semantic retry quarantine

Transport-level idempotency cannot protect against the same consequence being attempted through another execution channel. CIEAV derives a normalized semantic effect key from the effect class, semantic operation, target, amount, recipients, data categories, and stable business-object metadata.

If a consumed effect settles to `UNKNOWN`, CIEAV creates an OPEN effect quarantine. A different task or agent proposing the same semantic consequence is rejected until trusted local reconciliation marks the prior effect as applied, not applied, or cancelled.

This is deliberately conservative for payments, deletion, permission changes, messages, deployments, and other consequences where blind retry can duplicate harm.

Trusted reconciliation route:

- `POST /v1/agent-kernel/intent-reality/quarantines/:id/reconcile`

## Consequence Drift Ledger

Every prepared commit records a drift delta and cumulative mission drift. The profile defines a maximum cumulative drift. Once the budget is exceeded, further commits fail closed until the intent is changed by trusted authority.

The ledger exists to catch multi-step goal drift where each individual action appears locally plausible but the sequence no longer serves the owner’s original intent.

## Verified Autonomy Ratchet

The learning plane and authority plane are separate.

A proposed expansion must pass historical replay with:

- enough independently verified expected outcomes,
- zero previously denied actions becoming autonomous,
- zero disproven actions becoming autonomous,
- zero unresolved UNKNOWN actions becoming autonomous,
- zero HIGH/CRITICAL actions silently becoming autonomous.

Passing replay only creates a `CANDIDATE`. It does not modify authority. A trusted local human/organization principal must ratify the candidate before CIEAV writes the expanded Intent constraints.

Authority contraction can be applied automatically because it only removes power.

Trusted routes:

- `POST /v1/agent-kernel/intent-reality/autonomy-candidates`
- `POST /v1/agent-kernel/intent-reality/autonomy-candidates/:id/ratify`
- `POST /v1/agent-kernel/intent-reality/autonomy-candidates/:id/reject`

## Reversibility Escrow

Reversibility is not inferred from a button label. For reversible or compensable effects CIEAV can reserve an exact inverse descriptor and the artifact digests required to perform it. An inverse bound to another target is rejected.

An escrow stays `RESERVED` until the forward task reaches trusted `PROVEN` settlement. It then becomes `ACTIVATED`. Only the bound inverse effect can consume the escrow. Expired, cancelled, unproven, or already consumed escrows cannot be reused.

Trusted routes:

- `POST /v1/agent-kernel/reversibility-escrows`
- `GET /v1/agent-kernel/reversibility-escrows`
- `POST /v1/agent-kernel/reversibility-escrows/:id/consume`

The inverse action itself should still pass the normal CIEAV authority/commit boundary; escrow proves that an inverse was reserved and bound, not that arbitrary recovery execution is authorized.

## MCP and A2A

MCP exposes durable task lifecycle operations plus `prepare_reality_commit` and `consume_reality_commit`. These operations require trusted state-witness IDs; MCP agent reports cannot create those witnesses.

The loopback A2A 1.0 bridge exposes the same task and Reality-Bound Commit lifecycle. The A2A client capability and the scoped agent token remain separate. A2A also cannot settle proof from agent self-report.

CIEAV therefore uses the same authority semantics regardless of whether planning originated in an MCP client, an A2A peer, a browser integration, a local API consumer, or another agent runtime.

## Local persistence and OS behavior

The Agent Kernel derives domain-separated state secrets and stores:

- `agent-kernel-state.json`,
- `intent-reality-state.json`,
- `reversibility-escrow-state.json`.

Stores use authenticated envelopes, serialized mutations, private state directories/files, temporary exclusive creation, file fsync, atomic replacement, mode hardening where supported, and directory fsync on non-Windows platforms. Corrupt or unauthenticated state aborts loading.

The architecture runs inside the existing per-user CIEAV service model:

- Windows: Task Scheduler/service lifecycle plus DPAPI-backed secret handling,
- macOS: launchd plus Keychain-backed secret handling,
- Linux: systemd plus Secret Service-backed secret handling/fallbacks.

The dedicated GitHub Actions matrix builds and tests this core on Windows, macOS, and Linux. CI validates architecture and code paths; it is not a substitute for signed/notarized clean-machine release qualification.

## Adapter contract

A production downstream adapter should provide two distinct channels:

1. **Trusted observation channel** — obtains current state directly from the external system and asks the local Gateway to mint a state witness.
2. **Effect channel** — consumes the bound CIEAV commit immediately before performing the exact effect.

The agent/planner must not possess credentials that allow it to bypass both channels for the same consequential system. Otherwise CIEAV can govern its own path but cannot make bypass technically impossible.

## Production status terminology

This branch implements the production architecture/hardening path. Public production qualification still requires clean-machine tests, installer/service restart/reboot/upgrade/rollback tests, platform signing/notarization where applicable, and real release/CDN/cloud configuration.
