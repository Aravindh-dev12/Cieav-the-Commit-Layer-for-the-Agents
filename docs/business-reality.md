# CIEAV Proof Mesh and Business Reality

CIEAV treats execution success and real-world success as different facts. A model or tool returning `ok` is evidence, not settlement.

## Proof Mesh

A Proof Plan declares the expected world state and the independent evidence classes required to prove it. Evidence observations are explicitly marked as supporting, contradicting, or neutral, with source and confidence. The deterministic evaluator produces:

- `PROVEN` — all required independent evidence is present at the configured confidence.
- `PARTIAL` — credible supporting evidence exists but required proof is incomplete.
- `PENDING` — the verification window remains open and required proof has not arrived.
- `CONTRADICTED` — credible independent evidence conflicts with the expected state.
- `UNKNOWN` — the deadline passed without enough evidence to prove or contradict the outcome.
- `FAILED` — reserved for explicit verifier/execution failure semantics.

This lets a Pally-like CIEAV Companion say “I submitted it” while CIEAV itself continues to ask “did the intended consequence actually happen?” A Reticle-like verifier can contribute observations, but no single verifier owns truth.

## Business Reality

CIEAV Business represents operational expectations as Desired State Assertions over people, agents, customers, vendors, applications, accounts, assets, resources, workflows, payments, subscriptions, contracts, orders, and deployments.

Examples:

```text
employee-42.githubAccess ABSENT
employee-42.awsAccess ABSENT
refund-8271.amount EQUALS 8700
production.errorRate AT_MOST 1
subscription-91.renewal ABSENT
```

Observed facts may come from identity providers, SaaS APIs, databases, payment processors, telemetry, browsers, or verified adapters. The deterministic reconciler classifies each expected state as:

- `MATCH`
- `MISMATCH`
- `MISSING_EVIDENCE`
- `OVERDUE`

This is the foundation for a Company Twin: CIEAV can know that HR marked an employee offboarded while GitHub or AWS still shows active access, or that a refund workflow says complete while the payment system shows the wrong amount.

## Intelligence boundary

AI can help discover second-order consequences, propose expected state assertions, select verifiers, explain mismatches, and suggest recovery. It cannot mark a state proven without evidence that satisfies the deterministic Proof Plan, and it cannot execute a recovery outside the active Intent/Authority contract.

## Product role

- Companion-class agents propose and coordinate work.
- Reticle-class verifiers contribute independent evidence.
- MCP/A2A/API/browser/payment systems are transports and effect adapters.
- CIEAV owns the durable intent, authority, proof, reconciliation, and settlement semantics across all of them.
