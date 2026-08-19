# CIEAV Trusted Execution Adapters

CIEAV's authorization plane is intentionally separate from downstream execution. An ALLOW decision, Reality-Bound Commit, Operation Mandate, or Execution Ticket does not itself create an external effect. The final effect must cross the in-process `CieavExecutionRouter` into a registered trusted adapter.

## Current built-ins

The current runtime contains:

- hardened `HTTP`, `A2A`, and `CLOUD_API` transport adapters;
- a dedicated downstream **MCP stdio** client adapter using the official Model Context Protocol client SDK;
- a dedicated downstream **MCP Streamable HTTP** client adapter using the official MCP protocol/session implementation with a CIEAV-owned pinned network fetch.

Adapters are configured from `<CIEAV_STATE_DIR>/execution-adapters.json`, or from an explicitly configured `CIEAV_EXECUTION_ADAPTERS_FILE` path. If the normal file is absent, no external adapters are registered. If an explicit file is configured and cannot be read or parsed, adapter construction fails closed.

## Preflight-before-authority invariant

Every adapter performs tool-specific preflight before CIEAV consumes one-use execution authority:

```text
inspect Execution Ticket
        ↓
find trusted protocol adapter
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

Once the consequential downstream request has been sent, uncertainty is handled differently: a timeout, connection loss or ambiguous tool error is `UNKNOWN`, because the real-world consequence may already have occurred.

## Hardened HTTP / A2A / Cloud API transport

The HTTP family accepts only trusted normalized data:

```json
{"body": {}, "query": {}}
```

Agents cannot provide request origins, methods, credentials, proxy configuration, raw headers, redirect targets or arbitrary downstream URLs. Those properties come from the local adapter catalog and must match the `FederatedTool.downstreamRef` exactly.

Internet execution requires HTTPS. Cleartext HTTP is allowed only for explicit loopback adapters. The adapter rejects URL userinfo, private/link-local/multicast destinations, follows no redirects, pins the validated DNS address to the actual connection, caps response bytes and uses bounded timeouts. This reduces SSRF and DNS-rebinding exposure.

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

The agent cannot supply an executable, argv, working directory, downstream MCP tool name, or child environment. The stdio adapter requires an absolute executable and verifies its SHA-256 before authority is consumed and again before process launch. This prevents a mutable PATH lookup or binary substitution from silently changing the program that receives authority.

The child receives only the MCP SDK's conservative inherited environment plus explicitly configured static environment variables and CIEAV-controlled environment bindings. Dangerous process-injection variables such as `NODE_OPTIONS`, `LD_PRELOAD`, `DYLD_INSERT_LIBRARIES`, `PYTHONPATH`, and equivalents are rejected from adapter configuration.

Execution lifecycle:

```text
static/binary/argument preflight
        ↓
Operation Mandate + Ticket consumption
        ↓
spawn trusted MCP server (shell=false)
        ↓
MCP handshake
        ↓
tools/list
        ↓
configured tool advertised?
    no → REJECTED, no tools/call sent
    yes
        ↓
tools/call exact configured name + ticket-bound arguments
        ↓
result digest only
```

The official SDK's stdio transport spawns the child without a shell and enforces a bounded message buffer. CIEAV additionally bounds normalized argument size, connection/tool-call timeouts and stderr accounting.

## Trusted downstream MCP Streamable HTTP

Remote MCP uses the official `StreamableHTTPClientTransport`, but CIEAV supplies its own network primitive instead of allowing the SDK to use the runtime's default fetch. The SDK routes its MCP `POST`, optional `GET`/SSE, and session-management requests through that custom fetch.

Each remote MCP tool is bound to:

```text
CIEAV toolId
    ↓
serverId
    ↓
exact configured MCP endpoint
    ↓
endpoint SHA-256 in downstreamRef
    ↓
exact downstream MCP tool name
```

The Execution Fabric reference is:

```text
mcp+streamable-http:<serverId>@<endpointDigest>#<toolName>
```

The CIEAV fetch enforces:

- exact endpoint equality on every SDK-generated request;
- HTTPS for non-loopback execution;
- explicit loopback-only opt-in for cleartext HTTP;
- DNS resolution before dispatch and connection pinning to the validated address;
- rejection of private, link-local, multicast and other non-public addresses unless loopback was explicitly selected;
- no redirect following;
- no agent-controlled `Host`, `Origin`, cookies, proxy headers or credentials;
- local `BEARER_ENV` / `HEADER_ENV` credential injection;
- bounded request bytes, response bytes, argument bytes, connect timeout and tool timeout;
- no automatic SSE reconnection retries inside the trusted execution attempt.

The remote MCP adapter performs the MCP handshake and `tools/list` before the consequential call. If the configured tool is not advertised, the request is rejected before `tools/call`.

A successful remote MCP result is still only transport acceptance. `tools/call` returning `isError`, timing out, disconnecting, or otherwise becoming ambiguous after dispatch is classified as `UNKNOWN`, so the semantic effect remains quarantined until Proof Mesh reconciles reality.

## MCP proof boundary

Critically:

```text
MCP tools/call returned
        ≠
real-world consequence proven
```

This is true for both stdio and Streamable HTTP. A successful MCP tool result remains `PENDING` until Proof Mesh independently establishes the intended external state.

If `tools/call` has already been sent and the MCP server returns `isError`, times out, disconnects, or otherwise produces an ambiguous result, CIEAV reports `UNKNOWN` rather than assuming the action had no effect. Epistemic Retry Quarantine can then block an equivalent action through another MCP, API, browser or agent until reality is reconciled.

## Multiple adapters for one protocol

`MCP` now has more than one trusted transport implementation. The execution router therefore stores multiple adapters per protocol and performs deterministic adapter selection before preflight. A transport-specific adapter may declare `supports(context)`; if more than one adapter claims the same action, dispatch fails with `execution_adapter_ambiguous` rather than selecting by registration order.

This keeps MCP stdio and MCP Streamable HTTP interoperable without weakening the one-use authority boundary.

## Credential isolation

Current transport credentials:

- HTTP/A2A/Cloud: `NONE` or `CIEAV_INJECTED` via trusted environment mapping;
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
| A2A | hardened HTTP transport implemented; A2A semantic task adapter still pending |
| CLOUD_API | hardened HTTP transport implemented; provider-specific auth modes pending |
| MCP stdio | dedicated trusted client adapter implemented |
| MCP Streamable HTTP | dedicated pinned-network client adapter implemented; cross-platform qualification required before production claim |
| BROWSER | existing browser control path; Universal Execution Fabric qualification pending |
| CLI | pending allowlisted process adapter |
| FILESYSTEM | pending root-bound/symlink-safe filesystem adapter |
| DATABASE | pending transaction/template-bound database adapter |

The remaining rows are intentionally not represented as production-qualified until their concrete execution, proof and recovery semantics are implemented and tested.
