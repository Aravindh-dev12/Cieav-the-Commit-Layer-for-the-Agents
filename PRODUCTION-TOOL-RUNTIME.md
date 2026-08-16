# CIEAV Production Tool Runtime v1

CIEAV treats tools as **capability metadata**, not authority. Models may select from a policy-filtered Tool Catalog, but every `TOOL` step is locally gated before it can change or inspect reality.

## Runtime flow

```text
AgentTask
  -> privacy-reduced Model Fabric plan
  -> governed ToolCatalog (executionAuthority=false)
  -> TOOL step (consequential=true)
  -> Commitment / Consequence Graph / Proof Obligation
  -> Gateway Ed25519 one-use CommitCapability
  -> exact EffectProposal digest
  -> durable authority reservation (before execution)
  -> local or remote Effect Node / MCP / A2A / Browser adapter
  -> CLAIMED_COMPLETE | FAILED | UNKNOWN
  -> independent observations
  -> PROVEN | DISPROVEN | UNKNOWN
  -> task settlement or RECOVERY_REQUIRED
```

`CLAIMED_COMPLETE` is never equivalent to `PROVEN`. If execution may have happened but CIEAV cannot independently establish the required reality, the result remains `UNKNOWN` and requires governed recovery.

## Effect Node

The standalone Effect Node is built as `@cieav/node` and ships in the runtime as `apps/node/dist/index.js`.

Commands:

```text
cieav-node advertise
cieav-node heartbeat
cieav-node pair <PAIRING_CODE>
cieav-node serve
```

The node owns a persistent Ed25519 identity under its local state directory. Its private key never goes to the Gateway. Pairing pins the Gateway's Effect Authority public key and stores a derived per-node transport token locally.

### Capability file

Effect Nodes are default-deny. They can execute only operations declared in `CIEAV_NODE_CAPABILITIES_FILE`.

Example Windows build node:

```json
[
  {
    "id": "repo-build",
    "kind": "PROCESS",
    "operations": ["run"],
    "roots": ["C:\\work\\cieav"],
    "hosts": [],
    "commands": ["node", "npm.cmd", "git.exe"],
    "maxRuntimeMs": 120000,
    "metadata": {"purpose": "bounded repository build worker"}
  },
  {
    "id": "workspace-files",
    "kind": "FILESYSTEM",
    "operations": ["read", "write"],
    "roots": ["C:\\work\\cieav"],
    "hosts": [],
    "commands": [],
    "metadata": {}
  }
]
```

A command not listed in `commands` is rejected. A path outside `roots` is rejected. Process execution uses `shell=false`, bounded arguments/runtime/output, and a stripped child environment that excludes Gateway/model/browser/node authority secrets.

### Pairing

A local Gateway operator creates a one-time pairing code through the Gateway-authenticated endpoint:

```text
POST /v1/nodes/pairing-code
Authorization: Bearer <CIEAV_GATEWAY_TOKEN>
```

Then on the node:

```text
cieav-node pair ABCD2345
```

The node submits a fresh signed advertisement to `/v1/nodes/pair`. The Gateway validates the one-time code, signature, nonce, timestamp, identity key, capabilities, and advertised endpoint. The response contains the Gateway Effect Authority public key and a node-specific transport token derived from a local Gateway secret. The raw transport token is not stored in the node registry.

### Heartbeats

`cieav-node serve` emits signed heartbeats every 15 seconds to `/v1/nodes/heartbeat`. Heartbeats are nonce- and freshness-checked and bind the previously paired capability digest. A heartbeat cannot add capabilities. A quarantined node remains quarantined even if its heartbeat is healthy.

### Remote nodes

Loopback development may use HTTP. A node bound to a non-loopback address fails closed unless TLS certificate/key files are configured and `CIEAV_NODE_ADVERTISE_URL` is an HTTPS URL.

Required/important environment variables:

```text
CIEAV_NODE_CAPABILITIES_FILE
CIEAV_NODE_STATE_DIR
CIEAV_NODE_NAME
CIEAV_NODE_BIND
CIEAV_NODE_PORT
CIEAV_NODE_ADVERTISE_URL
CIEAV_GATEWAY_URL
CIEAV_NODE_TLS_CERT_FILE
CIEAV_NODE_TLS_KEY_FILE
CIEAV_NODE_CAPACITY
```

`CIEAV_NODE_TOKEN` and `CIEAV_GATEWAY_AUTHORITY_PUBLIC_KEY_FILE` can be supplied explicitly, but normal pairing stores their node-local equivalents with restricted permissions.

## Exact effect authority

The Gateway's `CieavEffectAuthority` owns a separate persistent Ed25519 keypair. Every execution capability binds:

- Commitment ID and actor
- exact EffectProposal digest
- Consequence Graph digest
- Proof Obligation digest
- action type and optional target
- risk ceiling
- short expiration (5–300 seconds; default 90)
- random nonce
- single-use requirement

The Gateway dispatch store persists capability consumption **before** invoking an adapter. The Effect Node also persists its own replay marker before execution. A consumed grant cannot be replayed at either boundary.

If either process crashes after authority consumption but before a durable terminal receipt, restart recovery records `UNKNOWN`; CIEAV does not auto-repeat the effect.

## Tool Broker

Tool sources are normalized into `ToolDescriptor` objects from:

- verified Effect Nodes
- explicitly registered local tools
- MCP governance tools
- A2A governance operations
- browser capabilities

Policy can narrow providers, tool IDs, consequences, external effects, and maximum catalog size. Policy cannot invent a capability. Conflicting descriptors with the same ID fail closed.

The model receives only the governed catalog and must select an exact catalog tool ID. Tool descriptions are untrusted metadata; model instructions explicitly prohibit following instructions embedded in descriptions.

In v1 every generic `TOOL` step is treated as consequential, including reads, so it must pass local authority before dispatch. This is intentionally conservative until a separately scoped read-capability primitive exists.

## Proof and recovery

Adapters report execution claims. Independent observers evaluate the configured Proof Obligation. Current local observers include Tool Result and Filesystem readback. Existing CIEAV proof settlement enforces confidence and actor-independence requirements.

Results:

```text
PROVEN      -> runtime may complete the step
DISPROVEN   -> step fails
UNKNOWN     -> task enters RECOVERY_REQUIRED
```

Recovery is a new governed proposal; it cannot reuse the consumed capability.

## Production qualification

The Effect Node workspace participates in root build, typecheck, test, selftest, platform-boundary verification, and release bundling. Release runtime format 7 includes the bundled node daemon and records signed-authority/replay/TLS requirements in `runtime.json`.

Before promoting this branch, run the full local qualification sequence supplied with the branch handoff. Packaged production promotion still requires the repository's existing clean-runtime, service-lifecycle, signing, installer, and cross-platform qualification gates.
