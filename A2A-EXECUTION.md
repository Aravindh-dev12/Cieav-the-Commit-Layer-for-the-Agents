# CIEAV Protocol-Aware A2A Execution

CIEAV treats A2A as an agent-to-agent task protocol, not as a generic HTTP POST surface.

The protocol-aware adapter is used when a federated tool is registered with an `A2A` protocol and a downstream reference of the form:

```text
a2a+jsonrpc:<agentId>@<sha256(exact-rpc-endpoint)>
```

The endpoint, protocol version, authentication source, network policy, limits, and polling policy come from the trusted local execution-adapter catalog. They are not selected by the agent at execution time.

## Intent-to-A2A boundary

The normalized, ticket-bound arguments contain only message parts, optional context, accepted output modes, bounded history length, and optional metadata. CIEAV constructs the consequential A2A request itself:

```text
Execution Ticket
      ↓
trusted A2A adapter preflight
      ↓
Operation Mandate + Ticket consumption
      ↓
SendMessage
  role = ROLE_USER
  messageId = Execution Ticket id
  returnImmediately = true
      ↓
Message OR Task
      ↓
if Task: GetTask observations
      ↓
A2A transport classification
      ↓
Proof Mesh settlement
```

The caller cannot switch the operation to `CancelTask`, `GetTask`, streaming, push configuration, or another RPC method. CIEAV owns the protocol method and lifecycle.

## Why CIEAV forces `returnImmediately`

A2A 1.0 permits `SendMessage` to return either a direct `Message` or a tracked `Task`. A task can continue asynchronously. CIEAV asks for immediate task creation so the one-use consequence attempt does not depend on an arbitrarily long blocking request. When a task is returned, CIEAV observes it with `GetTask`.

`GetTask` is observation only. It does not create fresh authority and does not count as a second consequence attempt.

## Task-state semantics

A2A task state is execution-transport evidence, not proof of the real-world consequence.

| A2A result | CIEAV transport result | Reason |
|---|---|---|
| direct `Message` | `ACCEPTED` | the remote agent accepted/responded; independent proof still required |
| `TASK_STATE_COMPLETED` | `ACCEPTED` | A2A reports successful task completion; Proof Mesh still verifies reality |
| `TASK_STATE_WORKING` / `SUBMITTED` after polling budget | `UNKNOWN` | the remote agent may still be acting |
| `TASK_STATE_FAILED` | `UNKNOWN` | partial consequences may have occurred before failure |
| `TASK_STATE_CANCELED` | `UNKNOWN` | cancellation does not prove that prior effects did not occur |
| `TASK_STATE_REJECTED` | `UNKNOWN` | once `SendMessage` was dispatched, CIEAV does not assume zero side effects |
| `INPUT_REQUIRED` / `AUTH_REQUIRED` | `UNKNOWN` | the task may already have produced partial consequences |
| transport/protocol error after `SendMessage` | `UNKNOWN` | the request may have reached and affected the remote agent |

This is deliberately conservative. A failed remote task is not equivalent to a proven absence of consequences.

## Preflight-before-authority

Before CIEAV consumes the one-use Operation Mandate or Execution Ticket, the adapter validates:

- exact tool ID and A2A downstream reference;
- A2A version `1.0`;
- normalized argument schema and byte limits;
- credential availability and credential mode;
- HTTPS for non-loopback execution;
- DNS resolution and public-address policy;
- exact configured endpoint.

Deterministic configuration failures therefore do not spend the one-use authority.

## Network hardening

The A2A adapter uses CIEAV-owned Node HTTP/TLS requests rather than an agent-controlled client. It:

- resolves DNS before dispatch;
- rejects private, link-local, multicast and other non-public addresses unless explicit loopback mode is configured;
- pins the validated address to the actual socket lookup;
- never follows redirects;
- forbids agent-controlled `Host`, `Origin`, cookie, proxy, connection, transfer-encoding, content-length, A2A-version, content-type, and authorization headers;
- injects configured credentials inside CIEAV;
- bounds request and response bytes;
- uses explicit timeouts.

## Proof boundary

Neither a direct A2A message nor `TASK_STATE_COMPLETED` completes a CIEAV Agent Task by itself.

```text
A2A says COMPLETED
       ≠
real-world consequence PROVEN
```

The A2A state becomes an Execution Attempt signal. Proof Mesh must independently establish the expected external state before CIEAV can settle the parent task as `PROVEN`.

## Coexistence with the generic A2A HTTP transport

CIEAV still retains the hardened HTTP-family `A2A` transport for explicitly configured raw transport integrations. The protocol-aware A2A task adapter declares `supports(context)` for `a2a+jsonrpc:` tools, so the trusted router selects it ahead of the generic A2A fallback. Ambiguous adapter claims fail closed.

This lets CIEAV move from “A2A-shaped HTTP traffic” to actual task-aware A2A consequence governance without breaking existing integrations.
