# CIEAV MCP bridge

CIEAV exposes MCP as an **agent ingress**, not as an authority bypass. The bridge speaks the current MCP 2026-07-28 stdio protocol through `@modelcontextprotocol/server` v2 and forwards only CIEAV-governed Reality operations to the local authority.

## Trust model

An MCP host never receives the Gateway bearer token, receipt-signing secret, audit-integrity key, provider token, or browser-control capability. `cieav mcp` uses the Gateway credential once to mint a short-lived agent session, scrubs privileged secrets, and replaces itself with the bundled MCP bridge carrying only `CIEAV_AGENT_TOKEN`.

Every session is bound to:

- one CIEAV agent identity;
- the local owner device scope;
- explicit Intent Contract UUIDs;
- explicit semantic action types (or `*` only when deliberately requested);
- a maximum risk level;
- an expiry between 60 and 3600 seconds.

Sessions are durably revocable. Agent tokens cannot use device receipt routes or create new Intent Contracts.

## Tools

The stdio server exposes:

- `list_intents`
- `get_intent`
- `evaluate_action`
- `get_approval`
- `claim_approved_permit`
- `consume_permit`
- `list_open_loops`
- `create_open_loop`
- `update_open_loop_progress`

There is intentionally no arbitrary shell, browser-click, payment, email-send, or generic executor tool. Execution remains the responsibility of a trusted effect adapter or the host after a one-use permit has been atomically consumed.

Agents cannot mark an Open Loop `RESOLVED` or `CANCELLED`; terminal settlement belongs to CIEAV Proof/Reconciliation or trusted human control.

## Launch example

Configure an MCP host to spawn CIEAV with explicit authority scope:

```text
cieav mcp \
  --agent-id travel-agent \
  --provider mcp \
  --intent <intent-uuid> \
  --action navigation.open \
  --action financial.commit \
  --max-risk HIGH \
  --ttl 900
```

For packaged installs, the same entrypoint is also available as `cieav-mcp`.

The local CIEAV Gateway/API must already be running. The session token is minted at process start and is never intended to be copied into a static MCP configuration file.
