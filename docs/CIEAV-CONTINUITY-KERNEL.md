# CIEAV Continuity Kernel

Status: architecture contract for production implementation

## Purpose

Autonomous systems increasingly change models, tool sets, workflows, skills, runtimes and execution routes while a task is still active. CIEAV must preserve safety and semantic invariants across those changes without pretending the underlying components are identical.

The Continuity Kernel is therefore not an orchestrator. It is an integrity boundary that asks whether a change in the execution stack preserves the meaning, authority and reality-state assumptions of an already materialized consequence.

## Constitutional rules

1. Conversation continuity does not imply semantic continuity.
2. Semantic continuity does not imply authority continuity.
3. Authority continuity does not imply reality continuity.
4. A model fallback never inherits execution authority merely because it inherits conversation state.
5. A tool-set change never inherits authority merely because the agent session continues.
6. An execution-route failover is forbidden when the original route may already have crossed a commit point and the consequence is unresolved.
7. Continuity evidence is zero-authority evidence. Only the local authority kernel may mint execution authority.
8. Any continuity state that cannot be established is UNKNOWN, never silently equivalent.

## Continuity domains

### IntelligenceContinuity

Used when the requested or serving model changes.

Examples:
- Claude requested, fallback model serves the turn.
- GPT snapshot changes.
- OpenClaw moves to a configured fallback model.
- A multi-agent runtime delegates a subtask to another model.

Questions:
- Did the actual serving model change?
- Did the model snapshot/version change?
- Did the effective tool set change?
- Did the model produce a materially different consequence interpretation?

Possible result:
- PRESERVED
- REQUIRES_REINTERPRETATION
- BROKEN
- UNKNOWN

### ContextContinuity

Used when memory, retrieved context, evidence or source state changes.

Questions:
- Did a source become stale, revoked or contradicted?
- Did the context digest change after consequence materialization?
- Did a later context update invalidate a material premise?

A broken context continuity can trigger re-materialization or causal recall.

### ToolContinuity

Used when a tool, skill, plugin, workflow node or MCP capability changes.

Questions:
- Did the trusted consequence contract digest change?
- Did the semantic compiler change?
- Did the canonical resolver change?
- Did the adapter artifact/runtime identity change?
- Did the declared effect set expand?

A changed trusted semantic surface invalidates old authority.

### WorkflowContinuity

Used for n8n-like workflow graphs, agent plans and durable orchestration graphs.

Questions:
- Did the workflow graph digest change?
- Were consequential nodes inserted or removed?
- Did ordering or branching change the consequence bundle?
- Did a fallback path introduce a new execution route?

### AuthorityContinuity

Used whenever identity, policy, permission, tool contract, workflow, context or consequence semantics change.

The rule is strict:

```
change that can alter permitted consequence
    -> old authority does not automatically survive
```

### ConsequenceContinuity

Used to compare an old and new materialization.

Relations reuse the Consequence Algebra:
- EQUIVALENT
- COMMUTES
- CONFLICTS
- REQUIRES
- INVALIDATES
- SUPERSEDES
- COMPENSATES
- AGGREGATES_WITH
- UNKNOWN_RELATION

Only proven semantic equivalence can preserve a consequence identity across a model/tool/workflow change.

### RealityContinuity

Used when switching execution routes.

```
PROVEN_PRE_COMMIT_FAILURE
    -> alternate qualified route may be considered

COMMIT_POINT_MAY_HAVE_BEEN_CROSSED + UNKNOWN
    -> equivalent routes quarantined
    -> reconcile reality
    -> no blind failover

OBSERVED_SUCCESS
    -> equivalent route requests reconcile to existing success

OBSERVED_FAILURE + qualified negative evidence
    -> alternate route may receive fresh authority
```

## Core contract

```ts
type ContinuityDimension =
  | "INTELLIGENCE"
  | "CONTEXT"
  | "TOOL"
  | "WORKFLOW"
  | "AUTHORITY"
  | "CONSEQUENCE"
  | "REALITY";

type ContinuityState =
  | "PRESERVED"
  | "REQUIRES_REINTERPRETATION"
  | "REQUIRES_REAUTHORIZATION"
  | "REQUIRES_RECONCILIATION"
  | "BROKEN"
  | "UNKNOWN";

interface ContinuityWitnessV1 {
  version: "CIEAV_CONTINUITY_WITNESS_V1";
  dimension: ContinuityDimension;
  previousRef: string;
  currentRef: string;
  state: ContinuityState;
  basisDigest: string;
  evidenceRefs: string[];
  affectedConsequenceRefs: string[];
  createdAt: string;
  authority: false;
  mayMintExecutionAuthority: false;
}
```

## Model provenance contract

```ts
interface ModelExecutionProvenanceV1 {
  version: "CIEAV_MODEL_EXECUTION_PROVENANCE_V1";
  provider: string;
  requestedModel: string;
  servingModel: string;
  servingModelSnapshot?: string;
  fallbackOccurred: boolean;
  fallbackReason?: string;
  harnessId: string;
  harnessVersion: string;
  contextDigest: string;
  toolSetDigest: string;
  startedAt: string;
  completedAt?: string;
  provenanceDigest: string;
  authority: false;
  mayMintExecutionAuthority: false;
}
```

The requested model and the serving model must be separately recorded. A fallback must never be hidden behind the originally requested model identity.

## Tool capability epoch

```ts
interface ToolCapabilityEpochV1 {
  version: "CIEAV_TOOL_CAPABILITY_EPOCH_V1";
  sessionRef: string;
  epoch: number;
  previousToolSetDigest?: string;
  currentToolSetDigest: string;
  addedToolRefs: string[];
  removedToolRefs: string[];
  authorityImpact:
    | "NONE"
    | "REQUIRES_REEVALUATION"
    | "INVALIDATES_EXISTING_AUTHORITY";
  createdAt: string;
  authority: false;
}
```

Adding a consequential capability mid-session must not silently widen an existing authority envelope.

## Integration behavior

### Model fallback

```
model A fails or is declined
    -> model B serves
    -> record actual model provenance
    -> recompute consequence interpretation
    -> compare semantic identity

EQUIVALENT
    -> previous consequence can remain active, subject to authority revalidation policy

MATERIAL_CHANGE
    -> re-materialize + re-authorize

UNKNOWN
    -> do not execute
```

### Tool-set mutation

```
tool set epoch N
    -> tool set epoch N+1
    -> calculate added/removed consequential capability surface
    -> invalidate authority whose permitted route/tool set is no longer exact
```

### Workflow revision

```
workflow graph digest changes
    -> compile old/new consequence bundles
    -> compare bundle identity and relation
    -> preserve only if proven equivalent under trusted rules
```

### Route failover

Route switching is never treated like model switching. It is reality-sensitive and uses consequence-preserving failover rules.

## Non-goals

The Continuity Kernel does not:
- choose the smartest model by itself;
- replace an agent framework;
- replace n8n or workflow engines;
- provide generic retries;
- declare two model outputs equivalent by lexical similarity;
- allow a model to approve its own continuity witness;
- rewrite physical history after later invalidation.

## Production acceptance criteria

A production implementation is not complete until it can demonstrate:

1. requested model != serving fallback model is recorded and externally inspectable;
2. model fallback that changes consequence semantics blocks execution;
3. model fallback that preserves consequence semantics still revalidates authority policy;
4. tool contract drift invalidates outstanding execution authority;
5. adding a consequential tool mid-session cannot inherit old authority;
6. workflow revision changes are compared at consequence-bundle level, not node-name level;
7. route failover after an ambiguous commit point is quarantined rather than retried;
8. continuity evidence is persisted, tamper-evident and zero-authority;
9. later evidence invalidation can identify consequences that depended on a now-invalid continuity assumption.

## Strategic role

The Continuity Kernel is the subsystem that lets CIEAV remain stable while models, agents, workflows, skills and routes are replaceable.

Core invariant:

> Intelligence may change. Tools may change. Routes may change. CIEAV must preserve the integrity of the consequence and the truth of reality.
