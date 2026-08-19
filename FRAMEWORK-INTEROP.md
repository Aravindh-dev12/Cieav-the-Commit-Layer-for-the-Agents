# CIEAV Framework Interoperability Architecture

CIEAV is the commit layer between agent intent and real-world consequence. Agent frameworks are orchestration environments, not execution authority. CIEAV integrates with them without allowing a framework thread, callback, tool result, memory record, trace, or provider-hosted run state to become permission to create a real-world effect.

> **Framework hooks are not the authority boundary.** Hooks are proposal, pause, correlation, and UX surfaces. Consequential execution belongs behind the CIEAV trusted router.

## Universal topology

```text
Human / organization
        |
    Root Intent
        |
   Intent Contract
        |
  Agent / workflow runtime
        |
+-------+------------------------------------------------------+
| MCP | A2A | LangChain | LangGraph | Agno | OpenAI Agents   |
| AutoGen | CrewAI | Semantic Kernel | LlamaIndex            |
| PydanticAI | Google ADK | Claude Agent SDK | DSPy          |
| Temporal | n8n | custom orchestrators                       |
+-------+------------------------------------------------------+
        |
 framework-native hook / proxy / workbench / callback
        |
 FrameworkToolCall
        |
 FrameworkBinding
        |
 CIEAV Agent Task + Intent
        |
 verified identity + scoped credential lease
        |
 Formal Permission Graph
        |
 ALLOW / ASK / BLOCK
        |
 Reality Witness + consequence analysis
        |
 Reality-Bound Commit
        |
 Operation Mandate
        |
 Execution Ticket
        |
 CIEAV Trusted Execution Router
        |
 downstream MCP / A2A / HTTP / Browser / CLI / FS / DB / Cloud
        |
 REAL-WORLD EFFECT
        |
 Proof Mesh
        |
 PROVEN / DISPROVEN / UNKNOWN
        |
 complete / fail / quarantine + recovery
```

The invariant is:

```text
Framework run/thread/session != CIEAV Agent Task != CIEAV execution authority
```

A framework ID can be bound to a CIEAV task. It never substitutes for the Intent, formal policy, Reality-Bound Commit, Operation Mandate, one-use Execution Ticket, or trusted proof.

## Adapter modes

### OBSERVE

The integration can emit redacted telemetry or shadow decisions, but cannot replace consequence execution. It is never sufficient for mandatory mediation.

### GOVERNED_PROXY

The framework submits actions to CIEAV and may pause, edit, reject, or route selected tools through CIEAV, but another consequence-capable path may still exist. This is the safe default for initial framework integrations.

### MANDATORY_PROXY

CIEAV may classify an adapter as mandatory-eligible only if all of these hold:

- consequence coverage is `COMPLETE`;
- no consequential tool can execute directly around CIEAV;
- the agent cannot possess reusable downstream credentials;
- provider-hosted tools cannot bypass the CIEAV route;
- the adapter can replace native execution with the trusted CIEAV route;
- adapter failure is fail-closed;
- each parallel call receives an independent binding, mandate and ticket;
- resume/replay cannot duplicate a prior semantic effect;
- downstream completion remains an observation until Proof Mesh settles it.

Even an eligible adapter requires deployment-level OS, orchestrator, network, secret-management, and tool-registration controls before CIEAV should claim bypass resistance.

## Framework capability matrix

| Framework / protocol | CIEAV integration surface | Default posture | Mandatory-mode requirement |
|---|---|---|---|
| MCP | MCP proxy / tool federation | GOVERNED_PROXY | All consequence-capable MCP servers must be reachable only through the CIEAV proxy; direct registrations and reusable agent credentials must be removed. |
| A2A | A2A gateway + task/context binding | GOVERNED_PROXY | Agent-to-agent delegation must attenuate authority and downstream side effects must return through CIEAV. Remote task `completed` is not proof. |
| LangChain | tool middleware / wrappers | GOVERNED_PROXY | Replace consequence-capable tool execution with CIEAV-backed tools; middleware alone is not a non-bypass boundary. |
| LangGraph | tool wrappers + interrupt/resume + thread binding | GOVERNED_PROXY | Stable call/effect identity across resume/replay; no side effect may happen before a replayable interrupt outside CIEAV. |
| Agno | pre/post tool hooks for agents and teams | GOVERNED_PROXY | Hooks must delegate the real effect to CIEAV and fail closed; raw tools/credentials cannot remain available in parallel. |
| OpenAI Agents SDK | function-tool guardrails/hooks | GOVERNED_PROXY | Every consequential function must route through CIEAV; provider/hosted tools need separate coverage and cannot be assumed intercepted. |
| AutoGen | Workbench `call_tool` boundary | GOVERNED_PROXY | Use a CIEAV-backed workbench or equivalent proxy and remove alternate consequence paths. |
| CrewAI | before/after tool hooks | GOVERNED_PROXY | Tool hooks must block native execution and invoke a CIEAV-backed connector instead. |
| Semantic Kernel | function invocation filters | GOVERNED_PROXY | Filters must cover every consequential function and credentials must remain downstream of CIEAV. |
| LlamaIndex | tool/toolset proxy | GOVERNED_PROXY | Supply only CIEAV-backed consequence tools to agents/workflows. |
| PydanticAI | deferred tools / toolsets | GOVERNED_PROXY | Deferred approval is workflow state, not authority; approved calls still require CIEAV commit and routing. |
| Google ADK | before/after tool callbacks | GOVERNED_PROXY | Consequential callbacks must skip native tool execution and route the exact call through CIEAV. |
| Claude Agent SDK | `PreToolUse` hook | GOVERNED_PROXY | Hook decisions are advisory unless the actual tool and credentials are exclusively behind CIEAV. |
| DSPy | supplied ReAct/tool functions | GOVERNED_PROXY | Give DSPy CIEAV-backed tools, not raw side-effect functions. |
| Langfuse | OpenTelemetry / tracing | OBSERVE | Observability only. Traces never authorize, commit, execute, or settle an effect. |
| Temporal | activity/workflow boundary | GOVERNED_PROXY | Side-effecting activities use stable CIEAV semantic-effect IDs so workflow retries cannot duplicate consequences. |
| n8n | governed connector/tool nodes | GOVERNED_PROXY | External-write nodes must be replaced with CIEAV-governed connectors and direct credentials removed for mandatory mode. |
| Custom runtimes | generic `FrameworkToolCall` binding | GOVERNED_PROXY | Must satisfy the same complete-coverage, credential-isolation, fail-closed and non-bypass requirements. |

## LangGraph resume/replay rule

Graph durability is valuable but creates a special consequence hazard: a resumed graph may replay computation around an interrupt or retried node. CIEAV therefore treats the framework call ID and **semantic effect** as separate identities.

```text
LangGraph thread/run
      |
   tool call
      |
FrameworkToolCall(call-123)
      |
semantic effect = send invoice reminder to customer A
      |
CIEAV effectKey
      |
one active consequence transaction
```

If the framework replays the node, the same real-world effect cannot obtain a second live route while the previous effect is PROVEN, pending, UNKNOWN, or quarantined. UNKNOWN remains an epistemic state, not permission to retry on another channel.

## Parallel tool calls

Parallel orchestration never shares an Execution Ticket.

```text
parallel call A -> binding A -> mandate A -> ticket A
parallel call B -> binding B -> mandate B -> ticket B
parallel call C -> binding C -> mandate C -> ticket C
```

Budgets and authority must be checked with concurrency-safe accounting. A batch-level approval must still compile into exact operation-level authority before effect.

## Delegation

Framework-native delegation is mapped into CIEAV attenuation:

```text
owner envelope
   ↓ narrow only
primary agent
   ↓ narrow only
sub-agent / team member
   ↓ narrow only
worker tool call
```

A child agent cannot increase allowed actions, targets, monetary ceiling, risk, data access, duration, or delegation depth. Identity proves who is acting; it does not create authority.

## Human approval

Framework approval features are useful UX but CIEAV does not equate `approved=true` in arbitrary framework state with execution authority.

Human approval must be bound to the exact CIEAV proposal and then compiled into the same local authority path. Changing arguments, route, recipient, amount, agent, expected post-state, or proof obligation requires fresh authority.

## Provider-hosted tools

Some SDKs can execute tools inside a model/provider runtime rather than through a local function. Such tools are `GOVERNED_PROXY` at best unless CIEAV controls the provider-side authorization and consequence path. A local pre-tool callback cannot prove that an unrelated hosted tool was intercepted.

## Langfuse and observability

CIEAV supports trace correlation, but telemetry is intentionally one-way and redacted:

```text
CIEAV lifecycle event
   -> redacted FrameworkTelemetryEnvelope
   -> OpenTelemetry / Langfuse / other observability backend
```

Never export raw credentials, authorization tokens, Operation Mandates, Execution Tickets, full sensitive prompts/forms, or local signing keys as trace attributes. A trace event is not Proof Mesh evidence unless an independently trusted proof adapter explicitly validates the underlying external state.

## Framework Interop Registry

`FrameworkAdapterManifest` is a machine-readable declaration of what an adapter can actually enforce. `FrameworkInteropAssessment` computes whether the declaration is eligible for mandatory proxying. `FrameworkBinding` links framework-native execution identity to CIEAV consequence identity.

The registry is durable and authenticated locally. It is deliberately separate from framework memory/checkpoints so a compromised or buggy orchestration runtime cannot rewrite CIEAV authority state.

## Failure semantics

- Adapter unavailable before authority consumption: fail closed; no effect attempt.
- Framework crashes before routing: no effect attempt; restart can re-evaluate.
- CIEAV consumes one-use authority and adapter outcome is indeterminate: `UNKNOWN`, quarantine the semantic effect, reconcile before retry.
- Framework says success but independent proof contradicts it: `DISPROVEN`, not completed.
- Framework says failure but external state is uncertain: `UNKNOWN`, not automatic retry.
- Recovery is a new governed consequence transaction and must itself be proven.

## Integration sequence

For every supported framework:

1. create or resolve the CIEAV Intent and Agent Task;
2. normalize the framework tool request into `FrameworkToolCall`;
3. create a durable `FrameworkBinding`;
4. generate the exact CIEAV `ExecutionProposal`;
5. evaluate deterministic authority;
6. if ASK, pause through the framework's native UX while preserving the CIEAV proposal identity;
7. observe/revalidate reality;
8. consume Reality-Bound Commit;
9. issue the one-use Operation Mandate and Execution Ticket;
10. dispatch only through the CIEAV trusted router;
11. record the attempt independently from success;
12. feed provider/readback evidence into Proof Mesh;
13. settle PROVEN / DISPROVEN / UNKNOWN;
14. bind settlement back to the framework run for UX and continuation;
15. generate recovery/undo as a fresh governed transaction when required.

## Production claim boundary

Framework support means CIEAV understands and can bind that framework's execution lifecycle. It does **not** mean every installation is automatically bypass-proof. `MANDATORY_PROXY` is a deployment property that must be proven for the concrete tool topology, credential topology, host/orchestrator controls, and provider-hosted execution paths.

Production architecture/hardening can be green while external release qualification remains pending.
