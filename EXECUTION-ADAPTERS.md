# CIEAV Trusted Execution Adapters

CIEAV's authorization plane is intentionally separate from its downstream execution adapters. An ALLOW decision, Reality-Bound Commit, Operation Mandate, or Execution Ticket does not itself create an external effect. The final effect must cross the in-process `CieavExecutionRouter` into a registered trusted adapter.

## Current qualified built-ins

The first built-in transport family covers `HTTP`, `A2A`, and `CLOUD_API` tools through a hardened HTTP transport. The adapter is configured from the local authority state directory at `execution-adapters.json`, or from an explicitly configured `CIEAV_EXECUTION_ADAPTERS_FILE` path.

The runtime remains fail-closed when the file is absent: no external adapter is registered. If `CIEAV_EXECUTION_ADAPTERS_FILE` is explicitly set and cannot be read or parsed, local authority startup/adapter construction fails rather than silently dropping enforcement.

## Adapter configuration

Example:

```json
{
  "version": 1,
  "http": [
    {
      "toolId": "cieav.github.merge",
      "protocol": "HTTP",
      "endpoint": "https://api.github.com/repos/acme/service/merges",
      "method": "POST",
      "timeoutMs": 8000,
      "maxResponseBytes": 65536,
      "allowLoopback": false,
      "staticHeaders": {
        "accept": "application/vnd.github+json"
      },
      "credential": {
        "kind": "BEARER_ENV",
        "env": "CIEAV_GITHUB_TOKEN"
      }
    }
  ]
}
```

The `FederatedTool.downstreamRef` registered in the Execution Fabric must exactly equal the configured endpoint. A proposal cannot substitute a different URL.

## Trusted arguments

The hardened HTTP family accepts only:

```json
{
  "body": {},
  "query": {}
}
```

Agents cannot provide arbitrary request headers, methods, origins, proxy configuration, credentials, or redirect targets. Method, endpoint, static headers, credential source, timeout, response cap and status-success range come from the trusted local adapter catalog.

## Preflight-before-authority invariant

The router performs tool-specific adapter preflight before consuming any one-use authority:

```text
inspect ticket
    ↓
find protocol adapter
    ↓
adapter preflight
  - tool config exists
  - exact endpoint matches
  - credential is present
  - scheme is permitted
  - DNS resolves to permitted addresses
  - normalized arguments are valid
    ↓
ONLY THEN
consume Operation Mandate
    ↓
consume Execution Ticket
    ↓
transport attempt
```

A missing adapter, missing credential, endpoint mismatch, invalid scheme, or blocked destination therefore does not consume the one-use permit.

After authority has been consumed, transport exceptions are treated as `UNKNOWN`, because the external consequence may have occurred even when the client did not receive a trustworthy result.

## SSRF and origin controls

Internet execution requires HTTPS. Cleartext HTTP is allowed only when a tool explicitly sets `allowLoopback: true` and DNS resolves to loopback.

The adapter:

- rejects URL userinfo;
- resolves the hostname before dispatch;
- rejects private, link-local, multicast and other non-public destination ranges unless explicit loopback mode is active;
- pins the connection lookup to the validated address for the request, reducing DNS-rebinding exposure;
- never follows redirects;
- does not use agent-supplied Host, Authorization, Cookie, proxy, connection, content-length or transfer-encoding headers;
- caps response bytes;
- uses explicit request timeouts.

A `3xx` response is `REJECTED`; it is never automatically followed to a second origin.

## Credential isolation

Supported credential modes in this initial adapter family are:

- `NONE`
- `CIEAV_INJECTED` backed by `BEARER_ENV` or `HEADER_ENV`

Secrets are resolved inside the trusted adapter and injected only at dispatch. They are not returned to the agent, stored in the execution attempt metadata, or copied into Proof Mesh evidence.

`DOWNSTREAM_OAUTH`, `MTLS`, and `SIGNED_REQUEST` remain fail-closed until dedicated implementations are added and qualified.

## Response handling and proof

The adapter does not persist response bodies. It records only bounded transport metadata such as HTTP status, response size, content type, request/correlation ID when available, and a SHA-256 digest of the body.

```text
HTTP 2xx / A2A transport accepted
          ≠
Intent proven
```

Transport acceptance creates an execution attempt that remains `PENDING` until independent Proof Mesh settlement. A network timeout, response-cap breach, connection reset or adapter exception after dispatch becomes `UNKNOWN` and must be reconciled before an equivalent semantic retry.

## Protocol status

| Protocol | Current adapter status |
|---|---|
| HTTP | built-in hardened transport |
| A2A | built-in hardened HTTP transport; higher-level A2A task proof remains separate |
| CLOUD_API | built-in hardened HTTP transport |
| MCP | pending dedicated downstream MCP client/proxy adapter |
| BROWSER | existing browser control path; Universal Execution Fabric adapter qualification pending |
| CLI | pending allowlisted process adapter |
| FILESYSTEM | pending sandbox/root-bound filesystem adapter |
| DATABASE | pending transaction-bound database adapter |

These remaining adapters are intentionally not represented as production-qualified until their concrete execution and recovery semantics are implemented and tested.
