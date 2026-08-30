# CIEAV Agent Runtime Integration

Status: integration design for n8n/OpenClaw-class runtimes and frontier-model agent systems

## Objective

CIEAV should be adoptable by existing agent runtimes without replacing their model selection, memory, workflow graph or user interface.

The runtime keeps its existing orchestration. CIEAV becomes the integrity boundary for consequential actions.

## Runtime roles

The integrating runtime may provide:
- model selection and fallback;
- prompts and reasoning;
- memory and retrieval;
- workflow orchestration;
- skills/plugins;
- tool discovery;
- MCP/A2A/API/browser/CLI access;
- retries and local error handling.

CIEAV owns or verifies:
- actual model/tool/workflow provenance relevant to consequence integrity;
- trusted tool consequence contracts;
- semantic consequence compilation;
- canonical reality resolution;
- consequence relation and cumulative invariant evaluation;
- uncertainty quarantine;
- proofability reservation;
- local consequence-bound authority;
- one-use execution capability;
- consequence-preserving route failover;
- independent observation and settlement;
- recovery/causal recall evidence.

## Integration principle

The public integration should be proposal-first, not arbitrary execution-first.

A runtime submits a proposal. It does not mint authority.

```ts
interface AgentRuntimeProposalV1 {
  version: "CIEAV_AGENT_RUNTIME_PROPOSAL_V1";

  runtime: {
    id: string;
    version: string;
    instanceRef: string;
    artifactDigest?: string;
  };

  modelProvenance?: {
    provider: string;
    requestedModel: string;
    servingModel: string;
    servingModelSnapshot?: string;
    fallbackOccurred: boolean;
    fallbackReason?: string;
    contextDigest: string;
    toolSetDigest: string;
  };

  workflow?: {
    workflowId: string;
    workflowVersion?: string;
    graphDigest: string;
    nodeRef?: string;
  };

  taskRef: string;
  intentRef: string;
  subjectRef: string;

  requestedTool: {
    toolId: string;
    protocol: string;
    operation: string;
    target?: string;
    argumentsDigest: string;
  };

  predictedEffects?: unknown[];
  evidenceRefs?: string[];

  authority: false;
}
```

## Decision contract

```ts
type CieavRuntimeDecision =
  | "ALLOW_FOR_AUTHORIZATION"
  | "ASK"
  | "BLOCK"
  | "WAIT"
  | "RECONCILE"
  | "REINTERPRET";

interface AgentRuntimeDecisionV1 {
  version: "CIEAV_AGENT_RUNTIME_DECISION_V1";
  proposalRef: string;
  consequenceBundleRef?: string;
  canonicalRealityRefs: string[];
  relations: string[];
  continuityState?: string;
  proofabilityState?: string;
  decision: CieavRuntimeDecision;
  reasonCodes: string[];
  executionAuthorityIssued: false;
  authority: false;
}
```

`ALLOW_FOR_AUTHORIZATION` is intentionally not execution authority.

## Trusted execution handoff

Only after local authority evaluation may CIEAV create a one-use execution capability bound to:
- consequence identity/bundle digest;
- canonical reality refs;
- exact permitted effect classes and deltas;
- trusted tool contract digest;
- semantic compiler/resolver identity;
- adapter artifact/runtime identity;
- exact route/operation/target/arguments digest;
- proof plan;
- relevant continuity witnesses;
- expiry and one-use semantics.

The runtime must not be able to expand these fields.

## n8n integration profile

Recommended integration surfaces:

### CIEAV Consequence Node
Placed before consequential nodes.

Inputs:
- workflow execution id;
- workflow graph digest;
- current node id;
- selected model provenance if AI-generated;
- target node/tool;
- normalized arguments;
- declared/predicted effects.

Outputs:
- consequence bundle reference;
- decision;
- reason codes;
- wait/reconcile state;
- authorization reference when available.

### CIEAV Governed Tool Wrapper
Wraps existing n8n nodes rather than requiring replacement.

```
AI Agent
  -> CIEAV Governed Tool
      -> existing Stripe/Gmail/HTTP/etc node
      -> CIEAV Observer
```

### Semantic retry policy

n8n's existing retry/error handling remains useful, but mutating external operations must pass a semantic retry decision:

```
PROVEN_PRE_COMMIT_FAILURE -> retry/alternate route may proceed
UNKNOWN_AFTER_POSSIBLE_COMMIT -> no blind retry; reconcile
OBSERVED_SUCCESS -> reconcile duplicate request to existing success
OBSERVED_FAILURE -> fresh authority may be considered
```

### Workflow revision

CIEAV should store the workflow graph digest used at authorization. A changed workflow graph must not silently reuse old authority.

## OpenClaw integration profile

Recommended integration surface: a CIEAV gateway/plugin that intercepts consequential tools.

### Preserve OpenClaw's strengths

OpenClaw may continue to own:
- channels;
- sessions;
- selected model and configured fallbacks;
- skills;
- tools;
- sandboxing;
- subagents.

CIEAV adds consequence integrity.

### Model fallback hook

When the serving model differs from the requested model:
1. record actual model provenance;
2. create an IntelligenceContinuity witness;
3. compare the new materialized consequence against the active consequence;
4. reauthorize if semantics or effective authority surface changed.

A fallback is not treated as transparent merely because the runtime continues the same turn/session.

### Skill/plugin qualification

A consequential skill/plugin should have:
- artifact/source digest;
- declared effect classes;
- permitted tool classes;
- semantic compiler compatibility;
- qualification state.

Changing the artifact digest invalidates authority bound to the prior artifact when the change can alter consequence semantics.

### Sandbox relationship

Sandboxing and CIEAV solve different problems:

```
sandbox -> where code/processes may execute
CIEAV   -> what real-world consequence may be authorized
```

CIEAV should consume sandbox/runtime identity as evidence but not treat sandbox presence as semantic authorization.

## Frontier model integration profile

Frontier models can participate as zero-authority cognition/evidence providers.

### Required provenance
- provider;
- requested model;
- actual serving model;
- snapshot/version when available;
- fallback/delegation indication;
- harness/runtime identity;
- context digest;
- available tool-set digest.

### Model switching

```
model A -> model B
```

requires semantic continuity evaluation when an active materialized consequence exists.

### Dynamic tool set

If tools are added/removed during an active session, CIEAV advances a ToolCapabilityEpoch and checks whether existing authority remains exact. Adding a consequential capability must not widen old authority.

### Models as evidence interpreters

A model may interpret screenshots, UI state, messages or documents as an evidence provider. Model interpretation alone should not automatically establish high-consequence observed success when independent provider/system evidence is required.

## Cross-runtime canonical identity

The integration protocol must never use runtime-local tool IDs as the final identity of reality.

Example:

```
n8n Stripe node
OpenClaw browser skill
custom bank MCP tool
```

may all map to one canonical economic consequence.

Therefore CIEAV resolves route-native identity into Canonical Reality Addresses before coordination.

## Adoption strategy

The first integration should avoid forcing users to replace their workflow/agent stack.

Target developer experience:

```ts
const decision = await cieav.propose(runtimeProposal);
```

For consequential operations, the trusted local CIEAV execution boundary later performs/authorizes the exact bound action.

This enables incremental adoption:
1. observe-only/shadow mode;
2. consequence materialization and audit;
3. warn/ask mode;
4. mandatory authorization for selected effect classes;
5. full trusted routing and settlement.

Shadow mode must never be represented as production enforcement.

## First heterogeneous benchmark

A useful production benchmark should demonstrate one semantic consequence across different runtimes/routes, for example:

- n8n calls a payment API;
- OpenClaw uses a browser to initiate the same payment;
- another agent attempts an ERP state transition that depends on payment success.

Required demonstration:
1. API and browser payment resolve to the same canonical economic target/consequence;
2. duplicate/equivalent second execution is blocked or reconciled;
3. ERP dependent action waits when payment is UNKNOWN;
4. unrelated action remains allowed;
5. successful independent observation releases dependent consequences;
6. complete provenance records which model/runtime/tool/route actually participated.

## Product boundary

CIEAV should be sold/integrated as infrastructure that existing runtimes use:

> Keep your models, agents, workflows, skills and integrations. Route consequential actions through CIEAV when they can change shared reality.

Core statement:

> Models compete on intelligence. Agent runtimes compete on orchestration. Tools compete on execution. CIEAV preserves integrity across all of them.
