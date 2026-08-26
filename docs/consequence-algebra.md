# CIEAV Consequence Algebra

CIEAV Consequence Algebra is the deterministic, zero-authority coordination primitive for reasoning about relationships among real-world consequences before execution authority is minted.

It is not an LLM tool-calling wrapper and it is not an authority source.

```text
MODEL / AGENT / TOOL PROPOSAL
        ↓
CONSEQUENCE MATERIALIZATION
        ↓
CANONICAL REALITY ADDRESS
        ↓
SEMANTIC EFFECT IDENTITY + FOOTPRINT
        ↓
CONSEQUENCE ALGEBRA
        ↓
ADMIT | COORDINATE | BLOCK | RECONCILE
        ↓
AUTHORITY / COMMIT / EXECUTION
        ↓
PROOF / SETTLEMENT
```

## Production invariants

- `CONSEQUENCE_ALGEBRA_AUTHORITY = false`.
- Algebra admission never issues execution authority.
- Canonical reality identity is independent of execution protocol.
- Equivalent unsettled effects reconcile rather than redispatch through another route.
- Conflicting or unresolved protected effects require coordination; `UNKNOWN_RELATION` is never silently treated as independence.
- Active reservations are durable and authenticated.
- An UNKNOWN settlement quarantines its reservation instead of reopening the effect.
- Causal fences require predecessor settlement before dependent progress.
- Cumulative budgets include settled history and in-flight reserved effects to resist action fragmentation.
- Proofability admission can require an explicit proof-provider binding before admission.
- Learned/model-generated relation suggestions are advisory only; trusted admission is deterministic or separately qualified.

## V1 deterministic resolver

The built-in V1 resolver establishes high-confidence generic relations that can be derived without domain-specific inference:

- identical semantic effect identity → `EQUIVALENT`;
- overlapping mutation footprints → `CONFLICTS`;
- shared policy/invariant/budget dimensions without direct mutation conflict → `AGGREGATES_WITH`;
- disjoint footprints → `INDEPENDENT`;
- insufficient semantics → `UNKNOWN_RELATION`.

The contract also defines `COMMUTES`, `REQUIRES`, `INVALIDATES`, `SUPERSEDES` and `COMPENSATES`. Those relations require deterministic or qualified domain/adapter rules; V1 deliberately does not hallucinate them from natural language.

## Durable Active Consequence Graph

`CieavConsequenceAlgebraStore` persists:

- active consequence nodes;
- semantic reservations;
- proof-plan reservations;
- causal reality fences;
- cumulative aggregation entries.

The store uses an HMAC-authenticated envelope and atomic/fsync replacement. Corrupt or unauthenticated state fails closed.

## Qualification

Run the core/API tests plus:

```text
node scripts/consequence-algebra-static.mjs
```

Required negative coverage includes cross-route duplicate suppression, mutation conflict detection, cumulative-fragmentation blocking, proofability admission, authenticated persistence/tamper rejection, UNKNOWN quarantine, restart-surviving reservations and causal fences.

A previous CIEAV release qualification does not automatically qualify a later Consequence Algebra commit. Production qualification evidence must bind to the exact head that contains this implementation.
