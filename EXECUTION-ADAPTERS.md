# CIEAV Trusted Execution Adapters

CIEAV's authorization plane is intentionally separate from downstream execution. An ALLOW decision, Reality-Bound Commit, Operation Mandate, or Execution Ticket does not itself create an external effect. The final effect must cross the in-process `CieavExecutionRouter` into a registered trusted adapter.

## Current built-ins

The current runtime contains:

- hardened `HTTP`, `A2A`, and `CLOUD_API` exact-origin transports;
- a dedicated downstream **MCP stdio** client adapter;
- a dedicated downstream **MCP Streamable HTTP** client adapter with CIEAV-owned pinned networking;
- a **Protocol-aware A2A task execution** adapter for A2A 1.0 `SendMessage` / `GetTask` semantics.

Adapters are configured from `<CIEAV_STATE_DIR>/execution-adapters.json`, or from an explicitly configured `CIEAV_EXECUTION_ADAPTERS_FILE` path. If the normal file is absent, no external adapters are registered. If an explicit file is configured and cannot be read or parsed, adapter construction fails closed.

## Preflight-before-authority invariant

Every adapter performs tool-specific preflight before CIEAV consumes one-use execution authority:

```text
inspect Execution Ticket
        ↓
select exact trusted adapter
        ↓
adapter preflight
        ↓
ONLY THEN
consume Operation Mandate
        ↓
consume Execution Ticket
        ↓
downstream transport attempt
```

A missing adapter, missing credential, executable mismatch, endpoint mismatch, invalid argument envelope, blocked destination or other deterministic configuration problem therefore does not spend the one-use authority.

Once the consequential downstream request has been sent, uncertainty is handled differently: a timeout, connection loss, protocol error, failed remote task, or ambiguous result is `UNKNOWN` whenever a partial real-world consequence cannot be excluded.

## Hardened HTTP / Cloud API transport

The HTTP family accepts only trusted normalized data:

```json
{"body": {}, "query": {}}
```

Agents cannot provide request origins, methods, credentials, proxy configuration, raw headers, redirect targets or arbitrary downstream URLs. Those properties come from the local adapter catalog and must match the `FederatedTool.downstreamRef` exactly.

Internet execution requires HTTPS. Cleartext HTTP is allowed only for explicit loopback adapters. The adapter rejects URL userinfo, private/link-local/multicast destinations, follows no redirects, pins the validated DNS address to the actual connection, caps response bytes and uses bounded timeouts.

Provider credentials are injected inside CIEAV through `BEARER_ENV` or `HEADER_ENV` mappings when the tool declares `CIEAV_INJECTED`. Raw response bodies are not retained: CIEAV keeps bounded status metadata and a SHA-256 body digest.

## Trusted downstream MCP stdio

For local MCP servers, the catalog binds a CIEAV `toolId` to one exact trusted server/tool pair:

```text
CIEAV tool ID
    ↓
serverId
    ↓
absolute executable
    ↓
expected executable SHA-256
    ↓
static trusted argv
    ↓
exact downstream MCP tool name
```

The Execution Fabric's downstream reference must match:

```text
mcp+stdio:<serverId>#<toolName>
```

The agent cannot supply an executable, argv, working directory, downstream MCP tool name, or child environment. The stdio adapter requires an absolute executable and verifies its SHA-256 before authority is consumed and again before process launch.

It performs the MCP handshake and `tools/list` before `tools/call`. A successful MCP result is transport acceptance only. `isError`, timeout, disconnect, or ambiguity after `tools/call` becomes `UNKNOWN`.

## Trusted downstream MCP Streamable HTTP

Remote MCP uses the official `StreamableHTTPClientTransport`, but CIEAV supplies its own network primitive instead of allowing the SDK to use the runtime's default fetch.

The Execution Fabric reference is:

```text
mcp+streamable-http:<serverId>@<endpointDigest>#<toolName>
```

The CIEAV fetch enforces exact endpoint equality, HTTPS outside loopback, DNS resolution and connection pinning, private-address rejection, no redirects, CIEAV-only credential injection, bounded requests/responses and timeouts, and no automatic SSE reconnection retries inside a trusted consequence attempt.

The remote adapter performs the MCP handshake and `tools/list` before the consequential `tools/call`. `isError` or ambiguity after dispatch becomes `UNKNOWN`.

## Protocol-aware A2A task execution

For A2A 1.0, CIEAV no longer has to treat agent delegation as an opaque HTTP body. A protocol-aware tool uses:

```text
a2a+jsonrpc:<agentId>@<endpointDigest>
```

CIEAV constructs the A2A request itself. It forces:

```text
method = SendMessage
message.role = ROLE_USER
message.messageId = Execution Ticket id
configuration.returnImmediately = true
```

The ticket-bound caller supplies only bounded message parts, optional context/metadata, accepted output modes, and history length. It cannot switch the consequential RPC method to cancellation, streaming, task administration, or another operation.

If `SendMessage` returns a direct `Message`, CIEAV records transport `ACCEPTED`. If it returns a `Task`, CIEAV observes that task with `GetTask` within a bounded polling budget. `GetTask` is observation and consumes no new consequence authority.

A2A state is not reality proof:

```text
TASK_STATE_COMPLETED
        ≠
real-world consequence PROVEN
```

`TASK_STATE_COMPLETED` is transport `ACCEPTED` and still requires independent Proof Mesh settlement. Failed, canceled, rejected, input-required, auth-required, still-working, unspecified, timeout, redirect, transport failure, or protocol-error outcomes after `SendMessage` are conservatively `UNKNOWN` because partial consequences cannot be excluded.

See `A2A-EXECUTION.md` for the detailed task-state matrix and network boundary.

## Multiple adapters for one protocol

The execution router stores multiple adapters per protocol and performs deterministic selection before preflight. Transport-specific adapters may declare `supports(context)`; if more than one explicitly claims the same action, dispatch fails with `execution_adapter_ambiguous` instead of selecting by registration order.

This allows:

- MCP stdio + MCP Streamable HTTP under `MCP`;
- generic hardened A2A HTTP + protocol-aware `a2a+jsonrpc:` execution under `A2A`.

## Credential isolation

Current transport credentials:

- HTTP/Cloud: `NONE` or `CIEAV_INJECTED` via trusted environment mapping;
- generic A2A HTTP: `NONE` or `CIEAV_INJECTED` via trusted environment mapping;
- protocol-aware A2A: `NONE` or `CIEAV_INJECTED` via CIEAV-owned A2A headers;
- MCP stdio: `NONE` or `CIEAV_INJECTED` via child environment bindings;
- MCP Streamable HTTP: `NONE` or `CIEAV_INJECTED` via CIEAV-owned HTTP header injection.

Secrets are resolved only inside trusted adapters. They are not returned to agents, included in attempt metadata, or copied into Proof Mesh observations.

`DOWNSTREAM_OAUTH`, `MTLS`, and `SIGNED_REQUEST` remain fail closed until dedicated implementations are added.

## Response and proof boundary

Adapters persist only bounded transport metadata and digests. A provider response, MCP result, HTTP 2xx, A2A task state, or process exit is not independently sufficient to complete a CIEAV Agent Task.

```text
transport accepted
      ↓
Execution Attempt Receipt
      ↓
Proof Mesh
      ↓
PROVEN / DISPROVEN / UNKNOWN
```

## Protocol status

| Protocol | Current adapter status |
|---|---|
| HTTP | hardened exact-origin transport implemented |
| A2A generic | hardened exact-origin transport implemented |
| A2A 1.0 task execution | protocol-aware `SendMessage` / `GetTask` adapter implemented; cross-platform qualification required before production claim |
| CLOUD_API | hardened HTTP transport implemented; provider-specific auth modes pending |
| MCP stdio | dedicated trusted client adapter implemented |
| MCP Streamable HTTP | dedicated pinned-network client adapter cross-platform green |
| BROWSER | existing browser control path; Universal Execution Fabric qualification pending |
| CLI | pending allowlisted process adapter |
| FILESYSTEM | pending root-bound/symlink-safe filesystem adapter |
| DATABASE | pending transaction/template-bound database adapter |

The remaining rows are intentionally not represented as production-qualified until their concrete execution, proof and recovery semantics are implemented and tested.
