# CIEAV Tool Broker v1

The Tool Broker is the model-visible capability catalog for CIEAV. It normalizes heterogeneous capability sources without turning discovery into authority.

## Invariant

`TOOL VISIBILITY != EXECUTION AUTHORITY`

A tool appearing in a catalog means only that the capability is currently available under broker policy. It does not mean the agent may execute it.

## Providers

- `LOCAL`
- `EFFECT_NODE`
- `MCP`
- `A2A`
- `BROWSER`

Effect Node descriptors may only originate from the verified Effect Node registry. Other providers must be explicitly registered by trusted CIEAV integration code.

## Pipeline

```text
Capability source
      |
      v
trusted registration / verified node discovery
      |
      v
ToolDescriptor normalization
      |
      v
monotonic ToolBrokerPolicy
      |
      v
ToolCatalog
executionAuthority=false
      |
      v
Agent Runtime planning
      |
      v
Commitment / Authority / Effect Dispatch
```

The broker cannot mint CommitCapability objects, consume permits, dispatch effects, settle proof, or mark task completion.

## Conflict handling

Two different descriptors with the same tool id fail closed. Policy may remove providers, tools, consequences, commitment-required tools, or external-effect tools; it cannot invent a capability absent from the trusted source set.

## Effect Node mapping

Each verified node capability operation is normalized to an individual descriptor. Process execution and other mutating operations are marked commitment-required. Node discovery is filtered by node liveness/quarantine before the broker sees it.

## Model boundary

A model may receive a ToolCatalog for planning. The catalog digest gives the plan/runtime a stable description of the tool surface used for that planning decision. The catalog explicitly carries `executionAuthority=false`.

Future Effect Dispatch must bind any consequential tool invocation to a one-use CommitCapability and exact effect digest before the target tool or Effect Node is invoked.
