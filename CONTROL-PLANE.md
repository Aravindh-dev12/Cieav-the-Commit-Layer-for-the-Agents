# CIEAV Superset Control Plane

CIEAV is an independent commit layer between intent and real-world digital consequence. It is not an agent framework, model provider, identity product, MCP proxy, or approval UI. It composes those concerns into a single local authority lifecycle that can govern humans, agents, MCP, A2A, browsers, HTTP APIs, CLI tools, filesystems, databases, and cloud APIs.

The architecture is implemented independently in CIEAV. Comparable systems validate that individual problem classes matter; CIEAV's contract is the end-to-end transaction boundary.

## Architecture

```text
OWNER: HUMAN / TEAM / ORGANIZATION / AUTOMATION
                       |
                  ROOT INTENT
                       |
                Intent Contract
                       |
          Intent Attenuation Witness
                       |
                 Agent Kernel
                       |
            verified workload identity
                       |
             scoped credential lease
                       |
          Formal Permission Graph
              default = DENY
                       |
             Execution Proposal
                       |
             ALLOW / ASK / BLOCK
                       |
             consequence drift gate
                       |
            Reversibility Escrow
                       |
               Reality Witness
                       |
            Reality-Bound Commit
                       |
          execution-time revalidation
                       |
              consume commit
                       |
              Operation Mandate
                       |
              Execution Ticket
                       |
           CIEAV Trusted Router
                       |
        +--------------+--------------+
        |              |              |
       MCP            A2A          Browser
        |              |              |
       HTTP      CLI / Filesystem   DB / Cloud
        +--------------+--------------+
                       |
               REAL-WORLD EFFECT
                       |
            Execution Attempt Receipt
                       |
                   Proof Mesh
                       |
          +------------+------------+
          |            |            |
        PROVEN      DISPROVEN      UNKNOWN
          |            |            |
       COMPLETE       FAILED      QUARANTINE
                                      |
                                  RECONCILE
                                      |
                             governed recovery
                                      |
                              verify recovery
```

## What CIEAV absorbs as problem classes

CIEAV deliberately covers the useful security primitives found across modern agent authorization and gateway systems, while keeping them subordinate to one consequence lifecycle.

| Problem class | CIEAV implementation |
|---|---|
| user-to-agent delegation | Intent Contract + Agent Kernel + attenuation witnesses |
| workload identity | Agent Identity Attestation |
| short-lived credentials | Scoped Credential Lease |
| deterministic authorization | Formal Permission Graph, DENY by default |
| structured operation authorization | Execution Proposal + Operation Mandate |
| MCP/A2A/tool gateway | Federated Tool Registry + Trusted Router |
| hidden provider credentials | CIEAV-only credential references/injection |
| execution-time state checking | Reality Witness + Reality-Bound Commit |
| idempotency across channels | Semantic Effect Identity + Epistemic Retry Quarantine |
| mandatory mediation | Interposition Posture with MANDATORY readiness |
| human approval | ASK and trusted approval challenge |
| tamper-evident audit | hash-linked Execution Fabric audit + authenticated local stores |
| proof of outcome | Proof Mesh + proof-gated settlement |
| uncertain outcome | UNKNOWN as a first-class state |
| rollback/compensation | Reversibility Escrow + governed recovery |
| learned permissions/autonomy | Verified Autonomy Ratchet; learning cannot self-expand authority |
| long-running goal drift | Consequence Drift Ledger |
| observability | runtime invariants, task events, execution audit, receipts, open loops |

## Interposition Posture

CIEAV has an explicit deployment posture rather than claiming universal interception merely because an MCP server is registered.

### OBSERVE

CIEAV can inspect/simulate but does not claim it is the exclusive execution boundary.

### GOVERNED

One or more consequence-capable routes use CIEAV controls, but other routes may still exist. This is useful for migration and shadow deployments. It must not be marketed as bypass-proof.

### MANDATORY

CIEAV reports `ready=true` only when every enabled consequence-capable route declared in the posture satisfies all of the following:

- managed by CIEAV;
- no declared direct-access bypass;
- downstream credentials are not agent-visible;
- the route maps to a registered CIEAV tool/protocol boundary.

A ticket or Operation Mandate is not issued on the mandatory execution path when mandatory posture is not ready.

This is a fail-closed readiness contract, not a claim that CIEAV can magically discover every undeclared process on an unmanaged host. Production deployments must pair it with OS/network/orchestrator controls that prevent unregistered consequence routes.

## Operation Mandate

Formal `ALLOW` is not execution authority. CIEAV creates a separate single-use Operation Mandate only after the proposal has passed the authority chain and the exact Reality-Bound Commit was consumed.

The mandate binds:

```text
root Intent
+ task
+ exact proposal
+ subject identity attestation
+ permission graph digest
+ authorization decision digest
+ Reality-Bound Commit
+ semantic effect identity
+ exact route
+ normalized arguments digest
+ expected post-state
+ proof obligation
+ current interposition posture
+ short expiry
+ max uses = 1
```

The mandate is domain-separated and authenticated by local CIEAV authority. Changing the route, arguments, subject, effect, expected state, proof obligation, reality commit, policy graph, or interposition posture invalidates the execution relationship.

## Authorization Witness

The Formal Permission Graph produces an evidence-bearing decision rather than a bare boolean. Its witness records:

- proposal ID;
- graph digest;
- ALLOW / ASK / BLOCK;
- decisive edge IDs;
- evidence references;
- evaluation time;
- witness digest.

This is useful for explaining why an action was permitted while keeping the executable authority separate from the explanation.

## Identity is not authority

A cryptographically verified agent identity proves which workload is making a request. It does not grant the workload permission to act.

```text
verified identity
       !=
execution authority
```

CIEAV requires identity + scoped session + Intent + permission graph + effect/state binding + mandate + routing authority.

## Credential isolation

The model/agent should not possess durable downstream credentials. The execution plane stores a digest/reference to provider credentials. A trusted adapter obtains the credential only at routing time after all CIEAV checks pass.

The intended boundary is:

```text
agent
  |
  | no Gmail/Stripe/AWS secret
  v
CIEAV proposal
  v
CIEAV local authority
  v
single-use routing authority
  v
trusted adapter injects scoped provider credential
  v
provider
```

Where provider-native OAuth/token exchange supports stronger attenuation, CIEAV should prefer a short-lived provider credential over injecting a long-lived secret.

## Formal Permission Graph

Natural-language Intent can be interpreted into a candidate policy, but runtime authorization is deterministic. Permission edges bind subject, root Intent, tool, operation, target constraints, risk ceiling, reason, and evidence references.

Decision precedence is:

```text
matching DENY
    >
matching ASK
    >
matching ALLOW
    >
no match = BLOCK
```

An LLM cannot override this ordering.

## State-sensitive commit

Authorization is valid only for the observed reality against which it was granted.

```text
observe pre-state S0
      |
authorize consequence C
      |
create Reality-Bound Commit(S0,C)
      |
observe current state S1 immediately before effect
      |
S1 == S0 ? consume : invalidate + quarantine
```

This prevents an authorized operation from silently executing after the facts that justified it changed.

## Semantic retry quarantine

CIEAV identifies the intended external effect separately from transport. If the outcome of a payment, email, deletion, deployment, or other effect becomes UNKNOWN, an equivalent action cannot be retried merely by switching from MCP to browser, HTTP, CLI, or another agent.

The unresolved semantic effect remains quarantined until trusted reconciliation establishes reality.

## Trusted Router

The Trusted Router is the in-process boundary from an execution ticket to registered adapters. Adapter availability is checked before authority is consumed. Exact normalized arguments are rechecked at routing time. Adapter exceptions are treated as `UNKNOWN`, not as safe failure.

Protocol classes currently represented by the execution contracts are:

- MCP
- A2A
- HTTP
- Browser
- CLI
- Filesystem
- Database
- Cloud API

Protocol adapters are trusted infrastructure. Agents may select only registered capabilities that are already inside their lease and formal permission envelope; they cannot install a new executable command, downstream URL, provider credential, or adapter by placing it in a proposal.

## Execution Attempt Receipt

Crossing the trusted router is recorded separately from successful settlement. The receipt binds the consumed mandate, execution ticket, task, Intent, route and exact argument digest to the transport result.

```text
transport accepted != consequence proven
```

The attempt starts unsettled and is later associated with trusted proof. A provider accepting an API request is not by itself sufficient to mark the user-level Intent complete.

## Proof and settlement

The lifecycle after execution remains mandatory:

```text
attempt
  |
OBSERVING
  |
trusted evidence
  |
+---------+------------+
|         |            |
PROVEN  DISPROVEN    UNKNOWN
|         |            |
DONE     FAILED      QUARANTINE
```

Agent reports may contribute observations but cannot independently satisfy proof requirements. `COMMITTED`, `HTTP 200`, `tool success`, or an LLM statement are not equivalent to `PROVEN`.

## Recovery

Recovery is a new governed consequence, not an unrestricted escape hatch. Where an action is declared undoable/compensable, CIEAV can require a Reversibility Escrow before forward execution. A safe inverse can be activated only after the forward effect is independently established.

An UNKNOWN forward effect must be reconciled before an equivalent retry or potentially conflicting inverse is blindly executed.

## Learning and autonomy

CIEAV may learn from verified consequence history, but learning belongs to a separate advisory plane.

```text
verified outcomes
      |
learning
      |
candidate policy/autonomy change
      |
historical safety replay
      |
trusted human/org ratification
      |
deterministic authority update
```

The learning component is technically unable to directly widen runtime authority. Failures/anomalies may contract authority automatically; expansion requires a trusted ratification transition.

## Deployment with OpenClaw and other agents

Registration of CIEAV as an ordinary MCP server is `GOVERNED`, not automatically `MANDATORY`. A deployment becomes mandatory only when consequence-capable downstream tools are routed behind CIEAV and direct credentials/routes are removed or blocked by the orchestrator/OS/network boundary.

Target topology:

```text
OpenClaw / Claude / Gemini / custom agents
                    |
             CIEAV agent session
                    |
              CIEAV MCP/A2A
                    |
           CIEAV Control Plane
                    |
           MANDATORY posture
                    |
            Trusted Router
                    |
          downstream adapters
                    |
             external world
```

The agent-facing MCP surface can create/read Agent Kernel tasks and request formal execution evaluation. It does not expose privileged endpoints for identity attestation minting, credential leases, permission graph mutation, Operation Mandates, Execution Tickets, trusted proof, or settlement.

## OS deployment

The authority/state-machine code is platform-independent TypeScript/Node and is exercised on Windows, macOS, and Linux. Consumer releases bundle the runtime so end users do not install npm, Node, Python, or workspace dependencies themselves.

OS-specific work remains at the secure-storage, service, code-signing/notarization, native browser-control and clean-install qualification boundaries. MANDATORY interposition additionally requires environment-specific controls that prevent bypass of CIEAV's declared routes.

## Production claim boundary

The correct claim for this branch is:

> CIEAV production architecture/hardening implements an intent-to-reality transaction core and a universal execution/control fabric with explicit mandatory-interposition readiness.

It is not a claim that every third-party tool on an arbitrary host is automatically intercepted, nor that public distribution is fully production-qualified. Public production qualification still requires clean-machine install/start/reboot/upgrade/rollback/uninstall evidence, real release signing/notarization, and production Cloud/CDN configuration.
