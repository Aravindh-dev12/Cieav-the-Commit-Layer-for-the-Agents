# CIEAV Production Tool Runtime v1

CIEAV treats tools as **capability metadata**, not authority. Models may select from a policy-filtered Tool Catalog, but every managed `TOOL` step is locally gated before it can inspect or change reality.

## Runtime flow

```text
AgentTask
  -> privacy-reduced Model Fabric plan
  -> governed ToolCatalog (executionAuthority=false)
  -> TOOL step (consequential=true)
  -> durable PROPOSED Commitment
  -> local operator AUTHORIZED Commitment
  -> Gateway Ed25519 one-use CommitCapability
  -> exact EffectProposal digest
  -> durable authority reservation before execution
  -> verified Effect Node
  -> CLAIMED_COMPLETE | FAILED | UNKNOWN
  -> independent observation
  -> PROVEN | DISPROVEN | UNKNOWN
  -> task settlement or RECOVERY_REQUIRED
```

`CLAIMED_COMPLETE` is never equivalent to `PROVEN`. If execution may have happened but CIEAV cannot independently establish the required reality, the result remains `UNKNOWN` and requires governed recovery.

## Managed Agent + Commitment Runtime

The local-authority API starts a long-lived managed Agent Runtime inside the Gateway-supervised Node service. The scheduler owns durable AgentTask, plan/receipt, Commitment, and Effect Dispatch stores. Interrupted dispatched work is reconciled to `UNKNOWN`; a consumed effect is never silently replayed.

Gateway-authenticated administration is intentionally placed under the existing local node-control authority surface:

```text
GET  /v1/nodes/runtime/status
GET  /v1/nodes/runtime/tools
GET  /v1/nodes/runtime/tasks
POST /v1/nodes/runtime/tasks
GET  /v1/nodes/runtime/tasks/<task-id>
GET  /v1/nodes/runtime/commitments
POST /v1/nodes/runtime/commitments/<commitment-id>/authorize
POST /v1/nodes/runtime/commitments/<commitment-id>/cancel
```

These routes require the local Gateway bearer. They are **not** exposed by the optional remote Effect Node TLS ingress.

For this production runtime version, managed plans are deliberately restricted to `TOOL` steps. The underlying Agent Kernel has broader step contracts, but MODEL/WAIT/OBSERVE/MCP/A2A planning will not be admitted into the always-on managed scheduler until those step types have equally complete production dispatch/settlement assemblies.

## Model Fabric

The selected primary open-weight model is:

```text
Qwen/Qwen3.6-27B
```

Model choice is not part of the authority boundary. CIEAV talks to models through an OpenAI-compatible `/v1/chat/completions` contract, so the same Agent Runtime can use a local/self-hosted CPU or GPU server, private infrastructure, or a compatible hosted provider such as Hugging Face Inference Providers.

Examples:

```text
# local/private OpenAI-compatible server
CIEAV_CLOUD_MODEL_BASE_URL=http://127.0.0.1:8000/v1
CIEAV_CLOUD_MODEL=Qwen/Qwen3.6-27B

# hosted Hugging Face Inference Providers
CIEAV_CLOUD_MODEL_BASE_URL=https://router.huggingface.co/v1
CIEAV_CLOUD_MODEL=Qwen/Qwen3.6-27B
CIEAV_CLOUD_MODEL_API_KEY=<fine-grained inference token>
```

Remote model endpoints require HTTPS. The model-visible Tool Catalog is minimized before inference: CIEAV sends semantic tool identity, consequences, commitment requirements and input schema, but does not send Effect Node endpoints, filesystem roots, command allowlists, host allowlists, runtime limits, authority tokens or signing material.

The planner has `executionAuthority=false`; model output can never authorize a Commitment or mint a CommitCapability.

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

### Pairing and heartbeats

A local Gateway operator creates a one-time pairing code through the Gateway-authenticated endpoint:

```text
POST /v1/nodes/pairing-code
Authorization: Bearer <CIEAV_GATEWAY_TOKEN>
```

Then on the node:

```text
cieav-node pair ABCD2345
```

The node submits a fresh signed advertisement. The Gateway validates the one-time code, signature, nonce, timestamp, identity key, capabilities and signed advertised endpoint. The response contains the Gateway Effect Authority public key and a node-specific transport token derived from a local Gateway secret. The raw transport token is not stored in the node registry.

`cieav-node serve` emits signed heartbeats every 15 seconds. Heartbeats are nonce- and freshness-checked and bind the previously paired capability digest. A heartbeat cannot add capabilities. A quarantined node remains quarantined even if its heartbeat is healthy.

### Remote nodes

Loopback development may use HTTP. A node bound to a non-loopback address fails closed unless TLS certificate/key files are configured and `CIEAV_NODE_ADVERTISE_URL` is HTTPS.

The local authority API remains loopback-only. Optional remote pairing/heartbeat uses a separate TLS-only ingress configured with:

```text
CIEAV_NODE_INGRESS_BIND
CIEAV_NODE_INGRESS_PORT
CIEAV_NODE_INGRESS_TLS_CERT_FILE
CIEAV_NODE_INGRESS_TLS_KEY_FILE
```

That ingress exposes only signed pairing and heartbeat endpoints.

## Exact effect authority

The Gateway's `CieavEffectAuthority` owns a separate persistent Ed25519 keypair. Every execution capability binds the Commitment ID/actor, exact EffectProposal digest, Consequence Graph digest, Proof Obligation digest, action type/target, risk ceiling, short expiry, nonce, and single-use requirement.

The Gateway dispatch store persists capability consumption **before** invoking an adapter. The Effect Node independently persists its replay marker before execution. A consumed grant cannot be replayed at either boundary.

If either process crashes after authority consumption but before durable settlement, Agent step, Effect Receipt and Commitment recovery all become `UNKNOWN`; CIEAV does not auto-repeat the effect.

## Tool Broker and proof

Tool sources are normalized into `ToolDescriptor` objects from verified Effect Nodes and explicit trusted registrations. Policy can narrow providers, tool IDs, consequences, external effects and catalog size; it cannot invent capabilities. Conflicting descriptors fail closed.

Every generic managed `TOOL` step is consequential in v1, including reads. This is deliberately conservative until CIEAV has a separately scoped read-capability primitive.

Adapters report execution claims. Independent observers evaluate the predefined Proof Obligation. Current local observation supports exact Tool Result evidence and filesystem readback for **loopback/local Effect Nodes only**. A remote filesystem path is never read from the Gateway machine and presented as proof; remote filesystem effects remain `UNKNOWN` unless an independent remote/connector observer is configured.

```text
PROVEN      -> runtime may complete the step
DISPROVEN   -> step fails
UNKNOWN     -> task enters RECOVERY_REQUIRED
```

Recovery is a new governed proposal; it cannot reuse the consumed capability.

## Production qualification

The release builder creates self-contained bundled production API, MCP and Effect Node JavaScript entrypoints. Runtime bundle format **8** records managed Agent Runtime, durable Commitment Runtime, Tool Broker, proactive scheduler, signed Effect Node authority, replay resistance and remote-TLS requirements.

Source PASS alone is not release evidence. Packaged production promotion still requires the repository's clean-runtime extraction test, service-lifecycle test, signing, installer and cross-platform qualification gates.
