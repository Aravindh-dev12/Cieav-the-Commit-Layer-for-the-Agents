# CIEAV 0.8 Agent Kernel Core v1

The Agent Kernel is the durable, headless task-runtime substrate for CIEAV. It coordinates long-lived work but does not itself own execution authority.

## Lifecycle

```text
CREATED -> QUEUED -> PLANNING
                    |       \
                    |        -> RUNNING -> OBSERVING -> COMPLETED
                    |
                    -> WAITING_FOR_AUTHORITY -> RUNNING

WAITING, FAILED, CANCELLED and RECOVERY_REQUIRED are explicit states.
```

There is no legal direct transition from `RUNNING` to `COMPLETED`. A task must enter `OBSERVING` before verified completion.

## Authority boundary

A consequential task step must call the Commitment hook and move to `WAITING_FOR_AUTHORITY`. The kernel will not enter `RUNNING` while `commitmentRequired=true` unless an `AUTHORIZED` Commitment has been bound.

The Agent Kernel cannot:

- approve a Commitment;
- mint a Commit Capability;
- execute MCP, A2A, browser, shell, API, filesystem, payment or other consequential effects;
- convert model output into authority;
- treat tool success or model claims as proof;
- mark a task complete without observation.

Those powers remain in the CIEAV authority, execution and settlement layers.

## Durable state

`CieavAgentKernelStore` persists tasks and ordered task events in a local authenticated envelope. Writes are serialized and atomically replaced. State corruption or authentication failure is fail-closed.

The event log records creation, state changes, Commitment requirements/binding, retry scheduling, deadline expiry, cancellation and recovery requirements. It is operational task history, not proof that the external world changed.

## Restart semantics

If the process restarts while a task is `PLANNING` or `RUNNING`, startup recovery moves it to `RECOVERY_REQUIRED`. CIEAV never assumes that interrupted work completed successfully.

## Open loops

The kernel reports unresolved work for:

- authority pending;
- external waiting;
- observation pending;
- recovery required;
- deadline exceeded;
- stale active tasks.

Open loops remain visible until they are explicitly resolved through legal task transitions.

## Retry and deadlines

Each task has a bounded retry budget. Retries consume the budget and enter `WAITING` with an explicit next-run timestamp. Expired deadlines fail the task rather than silently continuing.

## Next integration slice

Agent Kernel Core v1 intentionally does not autonomously execute tools. The next slice can attach Model Fabric planning plus MCP/A2A adapters, but consequential steps must still follow:

```text
Agent Task -> Commitment -> Consequence Graph -> Proof Obligation -> Authority -> Capability -> Effect -> Observation -> Settlement
```
