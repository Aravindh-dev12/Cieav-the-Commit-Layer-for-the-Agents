# CIEAV Effect Node v1

CIEAV Effect Nodes are execution-capable hosts in the Node Fabric. They advertise where an effect *could* be performed. They do not decide whether an effect *may* be performed.

## Invariant

`NODE AVAILABILITY != EXECUTION AUTHORITY`

A node may be ONLINE and advertise `process.run`, `filesystem.write`, browser, MCP, A2A, database, or cloud operations. None of those advertisements authorize execution. Consequential effects remain gated by CIEAV Commitment, policy, and one-use CommitCapability authority.

## v1 responsibilities

Effect Node v1 provides:

- persistent node identity with an Ed25519 keypair owned by the node host;
- signed capability advertisements;
- one-time local pairing codes;
- signed heartbeats with capability-set digest binding;
- nonce replay protection;
- signed-message freshness enforcement;
- ONLINE / DEGRADED / OFFLINE / QUARANTINED states;
- quarantine that overrides healthy heartbeat state;
- policy-filtered capability discovery that can only narrow advertised capabilities;
- HMAC-authenticated atomic Gateway registry persistence.

Effect Node v1 intentionally does **not** provide:

- arbitrary remote shell execution;
- authority decisions;
- CommitCapability minting or consumption;
- MCP/A2A credential forwarding;
- effect execution receipts;
- settlement or proof.

Those belong to later Tool Broker and Effect Dispatch slices.

## Trust flow

```text
Effect Node private key (node-local)
        |
        +--> signed advertisement
        +--> signed heartbeat
                 |
                 v
          CIEAV Gateway Registry
                 |
          identity/signature check
          nonce/freshness check
          capability digest check
          quarantine/liveness state
                 |
                 v
        policy-filtered discovery
                 |
                 v
             Tool Broker
                 |
                 v
          Agent Kernel Runtime
```

The model must never receive a node private key, pairing secret, Gateway authority secret, CommitCapability signing key, or durable credential merely because the node is connected.

## Capability advertisements are untrusted input

A node capability description declares availability and constraints. The Gateway validates the signed identity and then applies deterministic policy filters. A malicious or compromised node cannot enlarge authority by advertising a new operation.

Example:

```text
Node advertises:
  process.run
  process.status

Policy allows:
  process.status

Model-visible capability:
  process.status
```

Policy cannot manufacture `filesystem.delete`, `process.admin`, or any other operation absent from the signed advertisement.

## Quarantine

Quarantine is monotonic with respect to liveness: a quarantined node remains QUARANTINED even if it continues sending valid healthy heartbeats. Operator/governance restoration is required before discovery can expose it again.

## Next: Tool Broker

Tool Broker will normalize node capabilities, MCP tools, A2A operations, browser capabilities, and local runtime tools into a common CIEAV ToolDescriptor. Consequential tool use will still require Commitment-bound one-use authority before Effect Dispatch.
