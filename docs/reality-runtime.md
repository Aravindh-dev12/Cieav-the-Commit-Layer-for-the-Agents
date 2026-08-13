# CIEAV Reality Runtime

CIEAV is evolving from a protected browser commit layer into a provider-independent consequence runtime. The security boundary remains local and deterministic: AI interprets and proposes; CIEAV owns authority and commit.

## Core lifecycle

```text
human / organization intent
        ↓
Intent Contract
        ↓
agent / browser / API proposal
        ↓
Universal Effect Descriptor
        ↓
Consequence Assessment
        ↓
Authority Decision: ALLOW / ASK / BLOCK
        ↓
short-lived single-use Commit Permit
        ↓
trusted execution adapter
        ↓
Proof Mesh
        ↓
PROVEN / PARTIAL / PENDING / CONTRADICTED / UNKNOWN / FAILED
        ↓
Open Loop + reconciliation
        ↓
UNDO / COMPENSATE / ESCALATE
        ↓
SETTLED
```

## Intent Contract

An Intent Contract is machine-enforceable authority derived from what a person or organization wants. It can constrain action types, targets, maximum risk, financial exposure, data categories, recipients, delegation depth, approval thresholds, expiry, and required verification.

Authority is monotonic: delegation may narrow authority but cannot expand the owner's contract. An agent cannot turn research permission into purchase permission or a INR 30,000 ceiling into INR 38,000 by replanning or delegation.

## Universal effect model

Browser clicks, MCP tool calls, APIs, A2A tasks, scripts, payments, desktop actions, and CIEAV's own Companion should eventually normalize into the same semantic effect classes:

- READ
- COMMUNICATE
- PUBLISH
- FINANCIAL
- DATA_TRANSFER
- MUTATE
- DELETE
- ACCESS
- IDENTITY
- EXECUTE
- OTHER

Protocols are adapters. CIEAV's durable abstraction is intent → effect → authority → commit → evidence → settlement.

## Commit permits

A Commit Permit is scoped to one proposal and one intent. It includes the exact normalized effect, a SHA-256 scope hash, short expiry, and `maxUses: 1`. Changing the target, amount, actor, effect, or proposal identity invalidates the permit.

The initial kernel supports HMAC-SHA256 permits using the local authority secret. The production target is Ed25519 device signing backed by the same hardened device identity used by Action Receipts, with replay state persisted atomically by the Gateway.

## Consequence intelligence

The deterministic kernel generates a conservative consequence assessment and an independent verification plan. AI may enrich second-order consequences and recovery hypotheses, but cannot lower the deterministic safety floor.

The long-term intelligence asset is the CIEAV Reality Graph:

1. Intent graph — what humans and organizations want.
2. Authority graph — who may cause which effects under which constraints.
3. Consequence graph — what actions change and what they can indirectly affect.
4. Evidence graph — how outcomes can be proven independently.
5. Recovery graph — safe inverse, compensation, and escalation paths.

## Proof and settlement

CIEAV does not equate tool success with user-goal success. Proof evidence may come from browser state, API readback, payment records, email state, calendar state, filesystem/database state, telemetry, external receipts, or other independent sources.

Tasks do not become settled merely because a tool returned success. Delayed obligations remain Open Loops until the expected state is observed, contradicted, cancelled, or escalated. Examples include refunds, deliveries, offboarding, deployments, reimbursements, and subscription cancellations.

## Personal, business, and developer products

The same runtime supports three product surfaces:

- **CIEAV Personal** — Companion, personal authority, subscriptions, errands, communication, purchases, and open-loop follow-up.
- **CIEAV Business** — company intent/authority graphs, approvals, finance, support, sales, HR, IT/security, engineering, and continuous reconciliation.
- **CIEAV Developer** — Action Lab, simulations, policy tests, MCP/A2A adapters, proof adapters, and recovery adapters.

The Companion itself never bypasses CIEAV. Every first-party or third-party agent remains an untrusted proposer relative to the commit kernel.

## Production invariants

1. Model output never grants authority by itself.
2. A proposal outside an active Intent Contract is blocked.
3. Delegated authority cannot exceed parent authority.
4. High-risk approval thresholds are deterministic.
5. Commit permits are exact, short-lived, single-use capabilities.
6. A successful tool call is not proof of a successful real-world outcome.
7. Unknown evidence remains unknown.
8. Recovery actions are themselves consequential actions and must pass through CIEAV.
9. Durable personal/business state remains under local authority unless explicitly configured otherwise.
10. Compatibility identifiers may remain internally during migration, but the product identity and new public APIs are CIEAV.

## Current implementation tranche

The initial v2 runtime adds typed contracts for Intent Contracts, principals, universal effects, authority decisions, Commit Permits, proof evidence, verification results, Open Loops, and recovery plans. The deterministic core maps existing Action Manifests into effect proposals, assesses consequences, enforces intent constraints, and issues/verifies scoped permits.

The next production tranches bind these contracts into the Gateway/API persistence layer, migrate permit signing to the device Ed25519 identity, add replay-consumption state, expose MCP/A2A adapters, and connect Proof/Open Loop state to the existing receipt and browser outcome pipeline.
