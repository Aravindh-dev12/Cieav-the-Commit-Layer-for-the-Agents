# CIEAV Proof and Settlement

CIEAV separates **execution**, **observation**, and **settlement**. A successful tool return or agent message is never sufficient by itself to close a consequential task.

## Proof Case

A durable Proof Case binds:

- one Intent Contract;
- optionally one Action Receipt;
- optionally one Open Loop;
- an expected-state plan;
- required evidence kinds and minimum confidence;
- all observations and their provenance;
- the current deterministic Proof Mesh assessment.

Assessment states are `PROVEN`, `PARTIAL`, `PENDING`, `CONTRADICTED`, `UNKNOWN`, and `FAILED`.

## Provenance

Observations carry one of:

- `CIEAV_OBSERVER`
- `TRUSTED_ADAPTER`
- `EXTERNAL_SIGNED`
- `HUMAN_ATTESTATION`
- `AGENT_REPORT`
- `UNVERIFIED`

Only trusted observer/adapter/external evidence can normally satisfy independent proof requirements. `HUMAN_ATTESTATION` satisfies a requirement only when the plan explicitly asks for `HUMAN_ATTESTATION` evidence. Agent and unverified reports are retained as context but cannot satisfy independent proof.

## Open Loop terminal behavior

When a Proof Case is linked to an Open Loop:

- `PROVEN` → `RESOLVED`
- `CONTRADICTED` or `FAILED` → `BREACHED`
- `PENDING`, `PARTIAL`, or `UNKNOWN` → remains non-terminal and is updated with the latest proof state

Agents cannot directly set an Open Loop to `RESOLVED` or `CANCELLED`.

## Trusted local control

Examples:

```text
cieav proof create \
  --intent <intent-uuid> \
  --open-loop <open-loop-uuid> \
  --expected "Refund appears in the payment account" \
  --require PAYMENT:0.85 \
  --require EXTERNAL_RECEIPT:0.75

cieav proof list
cieav proof get <proof-uuid>
```

For a workflow whose proof plan explicitly accepts human attestation:

```text
cieav proof attest <proof-uuid> \
  --summary "I verified the refund in my account" \
  --confidence 1
```

MCP agents can list/read Proof Cases and report observations, but those reports are forcibly tagged `AGENT_REPORT` by the local API regardless of client input.
