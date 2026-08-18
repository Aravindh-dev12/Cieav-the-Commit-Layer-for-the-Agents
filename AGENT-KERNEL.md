# CIEAV 0.8 Agent Kernel

The Agent Kernel is CIEAV's durable headless task-runtime substrate for long-running agent work. It is integrated into the managed local authority runtime; it is not a second execution authority and it is not a cloud task queue.

## Runtime position

```text
Agent / automation
      |
      v
scoped agent session
      |
      v
Agent Kernel task
      |
      +---- non-consequential planning/waiting
      |
      +---- consequential step
                 |
                 v
       WAITING_FOR_AUTHORITY
                 |
      trusted local Commitment / permit
                 |
                 v
              RUNNING
                 |
                 v
             OBSERVING
                 |
      CIEAV Proof Mesh / trusted evidence
          /        |        \
      PROVEN   DISPROVEN   UNKNOWN
        |          |          |
   COMPLETED     FAILED   RECOVERY_REQUIRED
```

The kernel never converts a model/tool claim into authority or proof.

## Identity and scope

Every durable task is bound to:

- a local `scopeDeviceId`;
- one Intent Contract (`intentId`);
- an agent session when created by an agent;
- an owner derived from the trusted local Intent Contract;
- the concrete agent principal authenticated by the agent-session token.

Agent-facing task reads and mutations require the same device scope, agent session, and allowed Intent ID. A caller cannot supply another device scope to obtain proof or task state.

## Lifecycle

The durable states are:

```text
CREATED
QUEUED
PLANNING
WAITING_FOR_AUTHORITY
RUNNING
OBSERVING
WAITING
COMPLETED
FAILED
CANCELLED
RECOVERY_REQUIRED
```

Important invariants:

1. `COMPLETED` cannot be requested through the normal task transition function.
2. Consequential work cannot enter `RUNNING` while authority is required and not satisfied.
3. `COMPLETED` requires a bound proof case and `PROVEN` settlement.
4. `DISPROVEN` settlement produces `FAILED`.
5. Insufficient/unknown settlement produces `RECOVERY_REQUIRED`, never success.
6. Interrupted `PLANNING` or `RUNNING` work recovers to `RECOVERY_REQUIRED` on managed API startup.
7. Cancellation and authority/proof settlement are trusted local-authority operations, not agent self-service operations.

## Authority boundary

Agents may create scoped tasks, advance legal non-authority transitions, request a Commitment boundary, schedule bounded retries, and inspect their own task/event history.

Agents cannot:

- approve or manufacture a Commitment;
- bind an `AUTHORIZED` Commitment to themselves;
- mint a Commit Permit or execution capability;
- cancel through the trusted-authority path;
- mark work `COMPLETED`;
- select a different local device scope;
- choose the proof scope used for settlement;
- turn an agent/tool report into independent proof.

Gateway-authenticated local authority routes perform Commitment binding, cancellation, and proof settlement. Cloud server mode does not expose Agent Kernel state or authority routes.

## Proof-gated completion

A task must enter `OBSERVING`. Trusted local authority then binds a Proof Mesh case from the same durable device scope and Intent Contract.

Proof assessment maps to task settlement as follows:

```text
Proof PROVEN                 -> task COMPLETED
Proof CONTRADICTED / FAILED  -> task FAILED
Proof PARTIAL / PENDING /
      UNKNOWN                -> task RECOVERY_REQUIRED
```

This preserves the CIEAV rule that dispatch, tool success, navigation, or model claims do not prove that the external world changed.

## Durable state

`CieavAgentKernelStore` persists tasks and ordered events in `agent-kernel-state.json` under the per-user CIEAV state directory.

The store:

- validates all persisted task/event contracts on load;
- authenticates the envelope with an HMAC key derived for the Agent Kernel state domain;
- serializes mutations through one write chain;
- writes a new temporary file with private permissions;
- fsyncs the temporary file;
- atomically renames it over the live state file;
- fsyncs the parent directory on platforms where directory fsync is available;
- fails closed on malformed, corrupted, or unauthenticated state.

The HMAC state key is domain-separated from the receipt use by deriving it from the managed local secret with the fixed `cieav-agent-kernel-state-v1` context. The key is kept in the local API process and is not sent to Chromium or CIEAV Cloud.

## Platform integration

Agent Kernel does not create a separate daemon. It runs inside the existing managed local API supervised by the CIEAV Gateway, so it inherits the existing per-user platform architecture:

- Linux: systemd user service, Secret Service where available, private per-user state.
- macOS: launchd agent, Keychain-backed secret storage, private per-user state.
- Windows: per-user startup runtime, DPAPI-backed secret storage, private per-user state, and the native Windows browser-control bridge where required.

The packaged CIEAV runtime remains the only service lifecycle entry point. This avoids split-brain authority between a separate task daemon and the Gateway.

## Startup and shutdown

At managed API startup, the kernel authenticates durable state and recovers interrupted `PLANNING`/`RUNNING` tasks before serving requests.

At shutdown, the API waits for the kernel mutation chain to finish along with receipts, reality state, Proof Mesh state, policy state, business state and agent sessions.

An abrupt OS/power failure may still interrupt the last operation. CIEAV therefore never infers completion from absence of an error; unresolved work is recovered conservatively.

## Local API surfaces

Agent-session scoped:

```text
POST /v1/agent/tasks
GET  /v1/agent/tasks
GET  /v1/agent/tasks/open-loops
GET  /v1/agent/tasks/:id
GET  /v1/agent/tasks/:id/events
POST /v1/agent/tasks/:id/transition
POST /v1/agent/tasks/:id/require-commitment
POST /v1/agent/tasks/:id/retry
```

Gateway-authenticated authority:

```text
GET  /v1/agent-kernel/tasks
GET  /v1/agent-kernel/tasks/:id
POST /v1/agent-kernel/tasks/:id/cancel
POST /v1/agent-kernel/tasks/:id/bind-commitment
POST /v1/agent-kernel/tasks/:id/settle
```

These are local-authority resources. CIEAV Cloud must return `local_only_resource` rather than storing or mutating them.

## Release gate

Agent Kernel has an explicit release check:

```bash
npm run test:agent-kernel
node scripts/agent-kernel-release.mjs
```

The normal CIEAV release gate invokes the Agent Kernel release check. It verifies lifecycle, authority, durable recovery, proof settlement, device scoping and CIEAV 0.8 version consistency before the broader release verifier runs.

The CI workflow also exposes the Agent Kernel check as a named step so a passing generic unit-test job cannot hide loss of this production boundary.
