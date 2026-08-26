# CIEAV application agent layer

This layer adds a Rillet-style application/agent architecture above CIEAV's existing intelligence and execution stack without changing CIEAV's trust model.

## Core principle

Foundation models may interpret, reason, plan, explain, extract, critique, draft, and propose tool calls. They are not a source of truth and they cannot mint execution authority.

```text
External systems / domain data
        ↓
Domain services + deterministic business logic
        ↓
Verified / privacy-bounded context builder
        ↓
Application agent runtime
        ↓
Model gateway / provider registry
   ┌──────────────┬───────────────┬────────────────────┐
   │ external API │ local runtime │ qualified CIEAV ML │
   └──────────────┴───────────────┴────────────────────┘
        ↓
Answer or zero-authority tool proposal
        ↓
CIEAV consequence normalization
        ↓
policy / permissions / commitments / continuing authority
        ↓
required human approval for effectful proposals
        ↓
execution router + trusted adapters
        ↓
proof providers + intent/reality settlement
        ↓
audit / consequence graph / verified experience
```

The model gateway is intentionally provider-neutral. OpenAI, Anthropic, locally hosted models, or CIEAV-qualified models can be implemented as adapters without embedding provider credentials or transport logic in `@cieav/core`.

## Layer boundaries

### Domain and data layer

Domain services own the source of truth. Examples include accounting ledgers, CRM records, infrastructure state, robotics state, repositories, files, and business workflows. The model receives only the context necessary for the objective.

### Context builder

Every context datum carries a source reference, privacy class, optional digest, and verification flag. `LOCAL_ONLY` data is rejected for remote providers. Privacy policy is enforced before model invocation rather than delegated to the model.

### Model gateway

`ApplicationModelProviderRegistry` exposes a common provider contract with health and invoke operations. Providers declare supported models, locality, privacy boundary, and capabilities. Every descriptor, health result, invocation request, invocation result, and tool proposal is structurally constrained to `authority:false` and `mayMintExecutionAuthority:false`.

### Agent orchestration

`CieavApplicationAgentRuntime` converts a domain request into a model invocation, validates that every proposed tool and operation is in the declared tool surface, and returns either an answer, proposal, missing-context state, or rejection.

Effectful proposals can require human approval. The returned decision always has `executionAuthorityIssued:false`; it is a proposal for the downstream CIEAV authority pipeline, never permission to execute.

### Tool boundary

Models never receive direct database credentials, shell authority, cloud credentials, or trusted adapter handles. They receive tool descriptors. A proposal identifies the tool and operation and binds its normalized arguments by digest. The actual arguments and execution remain under deterministic CIEAV services.

### Existing CIEAV layers remain authoritative

The application layer feeds proposals into existing CIEAV mechanisms such as consequence normalization, commitment requirements, continuing authority, execution routing, proof collection, intent/reality settlement, recovery, and consequence intelligence. Models stay above these controls.

## Example: accounting-style workflow

```text
User: "Why did software expense increase?"
        ↓
Accounting service queries verified ledger data
        ↓
Context builder emits bounded, source-referenced facts
        ↓
Application agent selects/invokes a model
        ↓
Model explains the variance
        ↓
Answer shown with evidence references
```

For an effectful request:

```text
User: "Accrue 18,000 over 12 months"
        ↓
Model proposes `ledger.draft_journal_entry`
        ↓
Deterministic accounting validation
        ↓
CIEAV consequence + authority checks
        ↓
Human approval
        ↓
Trusted ledger adapter executes
        ↓
Proof / settlement / audit
```

The model may calculate or draft, but it cannot post directly.

## Provider adapters

Provider adapters belong outside the core trust boundary. A production adapter should provide bounded timeouts, retry policy, strict structured outputs, secret-store integration, request correlation, provider/model identity checking, cost/latency telemetry, and redaction before transport.

No assumption is made about whether a provider authenticates with an API key, cloud identity, enterprise gateway, workload identity, or another mechanism.

## Qualification workflow

Changes to this layer should at minimum run:

1. contracts build and typecheck;
2. core build, typecheck, and application-agent tests;
3. provider-boundary static checks;
4. existing consequence / authority / production qualification suites;
5. provider-specific live qualification only when the provider is configured.

A model/provider must never be treated as production authority merely because it is reachable or returns valid output. CIEAV model qualification and the downstream authority gates remain separate concerns.
