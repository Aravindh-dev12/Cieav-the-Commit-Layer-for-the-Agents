# LATCH production AI architecture

LATCH uses AI as a semantic interpretation layer, but never as the sole security authority. The deterministic policy is the minimum safety floor; AI can add detail or make a result stricter, never silently make it safer.

## Pipeline

```text
privacy-reduced ActionContext
        ↓
local injection detector
        ↓
fast independent gate
        +
primary frontier interpreter
        +
independent verifier for high-risk / ambiguous / injected actions
        ↓
conservative consensus
        ↓
deterministic risk + reversibility floor
        ↓
Action Manifest + AI telemetry
```

### Fast gate

Uses the fast model with low reasoning effort to independently classify the action family, minimum risk, reversibility, and whether deeper review is needed.

### Primary interpreter

Builds the complete Action Manifest from observable, privacy-reduced evidence. Page text is always marked as untrusted data, never instructions.

### Verifier

For HIGH/CRITICAL, sensitive, unknown-reversibility, prompt-injection, maximum-profile, or disputed actions, a separate verification call attempts to falsify optimistic assumptions. High-risk verification runs in parallel with the primary path to limit latency.

### Consensus

Risk and reversibility are monotonic: stricter interpretations win. Disagreement lowers confidence and is surfaced in warnings/telemetry. If an AI stage fails on a high-risk action, deterministic high-risk rules remain active and the manifest records degraded verification.

## Profiles

- `economy`: fast gate for ordinary actions; high-risk actions still receive primary + verifier protection.
- `balanced`: gate + primary by default; verifier for high-risk, injected, or disputed actions.
- `maximum`: gate + primary + verifier broadly, with higher reasoning effort.

## Privacy

Before any model request LATCH strips query strings and fragments from URLs, omits whole-page text, keeps form values redacted, truncates contextual text, and sends no uploaded file contents. Responses requests set `store:false`.

## Prompt injection

The browser DOM is attacker-controlled. LATCH uses a local detector, system-level classifier instructions, strict structured schemas, independent verification, and a deterministic safety floor. Prompt-injection-like text cannot authorize an action or lower risk.

## Operational reliability

Model requests have bounded timeouts, limited retry on transient errors, unique client request IDs, strict JSON-schema outputs, stage latency/error metadata, conservative failure behavior, and short semantic caching only for non-sensitive lower-risk actions.

## Model promotion

Do not promote a new model alias/snapshot directly to production. Pin a model version after it passes a LATCH eval set containing finance, identity, credentials, publishing, destructive actions, permissions, uploads, ambiguous forms, adversarial page text, and benign controls. Compare false-negative rate first; latency and cost are secondary for high-consequence actions.
