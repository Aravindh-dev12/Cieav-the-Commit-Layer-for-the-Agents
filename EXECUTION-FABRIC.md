# CIEAV Universal Execution Fabric

CIEAV is the commit layer between intent and consequence. The Universal Execution Fabric extends that boundary across heterogeneous agents, MCP servers, A2A peers, browsers, HTTP APIs, CLI tools, filesystems, databases, and cloud APIs without granting any model direct possession of execution authority or downstream credentials.

This architecture is CIEAV-native. It combines identity, formal authorization, tool federation, state-sensitive commitment, execution routing, proof, uncertainty, recovery, and audit into one transaction lifecycle.

## End-to-end boundary

```text
Human / organization / automation
             |
         Root Intent
             |
      Intent Contract
             |
     delegation chain
             |
 Intent Attenuation Witness
             |
       Agent Kernel task
             |
   Agent Identity Attestation
             |
 Scoped Credential Lease
             |
 Formal Permission Graph
       (default DENY)
             |
      Execution Proposal
             |
 formal deterministic decision
     ALLOW / ASK / BLOCK
             |
     Consequence analysis
             |
      Reality Witness
             |
    Reality-Bound Commit
             |
 immediate state revalidation
             |
   consume real-world commit
             |
     Execution Ticket
       single-use / short TTL
             |
       Trusted Router
             |
 MCP / A2A / HTTP / Browser /
 CLI / Filesystem / DB / Cloud
             |
      REAL-WORLD EFFECT
             |
         Proof Mesh
             |
   +---------+----------+
   |         |          |
 PROVEN   DISPROVEN   UNKNOWN
   |         |          |
 COMPLETE   FAILED    QUARANTINE
                         |
                    RECONCILE
                         |
                 governed recovery
```

## Security invariants

1. **Identity is not authority.** A valid agent identity cannot execute a consequence by itself.
2. **Credentials are leased, never delegated wholesale.** A credential lease is short-lived, audience-bound, intent-bound, tool-bound, operation-bound, risk-bounded, usage-bounded, and revocable. The durable fabric stores only a credential reference digest; provider secrets belong in the OS-protected secret layer.
3. **Formal authorization is deny-by-default.** No matching permission edge means BLOCK. Matching DENY dominates ASK, which dominates ALLOW.
4. **Permission graphs are integrity-bound.** The graph digest covers its scope, root Intent, default decision, edges, and timestamps. A changed graph fails verification until local authority stores a newly valid version.
5. **Agents cannot substitute task identity.** Execution proposals are checked against the durable Agent Kernel task's device, root Intent, and actor.
6. **Tool registration is local authority.** The agent may choose among tools already registered inside its lease and permission envelope; it cannot install a new downstream command, URL, credential, or adapter by putting it in an execution proposal.
7. **Arguments are part of authorization.** The normalized argument digest is included in the execution binding and route digest. Argument substitution after authorization requires a different proposal.
8. **Reality is part of authority.** A Reality-Bound Commit binds the observed pre-state and expected post-state. Changed pre-state invalidates the commit.
9. **Formal ALLOW still cannot execute.** A CIEAV Execution Ticket can be issued only after the matching Reality-Bound Commit has been consumed for the exact task, Intent, semantic effect, pre-state, expected post-state, and proof obligation.
10. **Execution Tickets are short-lived and single-use.** Reuse and expiration fail closed.
11. **Credential leases are rechecked at routing time.** Revocation, expiry, or usage exhaustion after authorization but before routing blocks execution.
12. **Transport does not define consequence identity.** The semantic effect is independent of MCP, browser, API, or other transport. UNKNOWN effects therefore remain quarantined across alternate channels.
13. **Execution does not equal success.** A consumed execution ticket means the side-effect attempt crossed the trusted route. Completion still requires independent proof.
14. **UNKNOWN is a first-class state.** Unknown external reality creates semantic-effect quarantine and blocks equivalent retries until reconciliation.
15. **Audit is tamper-evident.** Execution Fabric audit events are linked using `previousHash` / `eventHash` and the whole durable state is authenticated by the local state MAC.
16. **Learning cannot self-authorize.** Verified Autonomy candidates may recommend graph/envelope changes, but only trusted local authority can ratify expansion.

## Agent Identity Attestation

`AgentIdentityAttestation` is CIEAV's local statement that an external or local workload identity was verified. Supported evidence classes are represented as:

- local key
- OIDC
- mTLS
- TPM
- Secure Enclave
- externally signed identity

The durable CIEAV attestation is minted by local authority and signed using a domain-separated local attestation key. Stored attestations are revalidated when loaded and whenever they are used. External OIDC/mTLS/TPM verification adapters are upstream evidence providers; they do not themselves become execution authority.

## Scoped Credential Lease

A lease binds:

```text
agent attestation
+ agent session
+ device
+ audience
+ allowed root Intents
+ allowed federated tools
+ allowed operations
+ maximum risk
+ credential reference digest
+ issue/expiry
+ maximum uses
```

The actual password, OAuth refresh token, API key, private key, or session credential is not part of the agent-facing contract. Credential material is injected only by a trusted downstream adapter when that adapter consumes a valid execution ticket.

## Formal Permission Graph

The Formal Permission Graph is a deterministic authority representation, not an LLM judgment.

Example:

```text
subject: collections-agent
intent: collect-overdue
operation: gmail.send
recipient prefix: existing-customer/*
max risk: MEDIUM
result: ALLOW
source evidence:
  intent:collect-overdue:v3
  policy:customer-contact:v8
```

Another edge can force ASK, and any matching DENY overrides both.

Natural-language interpretation may propose graph updates, but the runtime only evaluates the stored deterministic graph.

## Federated Tool Registry

CIEAV normalizes downstream capabilities into a local registry. A tool declaration contains:

- stable tool ID
- protocol
- operation
- downstream reference
- credential mode
- maximum risk
- whether it can create a consequence
- expected independent proof sources
- enabled/disabled state

Supported protocol classes are MCP, A2A, HTTP, Browser, CLI, Filesystem, Database, and Cloud API.

A registry entry is not executable authority. It only identifies a downstream capability that may be selected after every other boundary passes.

## Execution Proposal

The proposal binds the agent's desired tool call to the existing CIEAV transaction:

```text
taskId
intentId
device
subject
identity attestation
credential lease
tool + protocol + operation + target
risk
normalized arguments digest
semantic consequence
current Reality Witness
expected post-state digest
proof obligation digest
attenuation witnesses
```

The agent cannot overwrite `taskId`, `intentId`, device scope, or subject identity through the agent API. Those values are forced from the authenticated Agent Kernel task.

## Execution Ticket

A formal ALLOW result is not a ticket.

Ticket issuance additionally proves:

```text
formal authorization = ALLOW
AND
same Agent Kernel task
AND
same consumed Reality-Bound Commit
AND
same root Intent
AND
same Semantic Effect identity
AND
same pre-state witness
AND
same expected post-state
AND
same proof obligation
AND
credential lease still active
```

The ticket then binds a route digest containing the exact registered tool/protocol/operation/target/argument digest. It is valid for seconds, not hours, and is consumed once at the trusted routing boundary.

## Credential isolation

The model/agent environment must not receive durable provider credentials. The intended deployment is:

```text
Agent process
    |
    | no provider secret
    v
CIEAV execution proposal
    |
    v
Execution Ticket
    |
    v
trusted adapter process / local Gateway
    |
    | obtains credential from OS secret store
    v
provider
```

Windows uses the CIEAV per-user authority boundary and OS-protected secret storage; macOS uses Keychain-backed local authority; Linux uses Secret Service where available with the existing fail-closed CIEAV fallback policy. The Execution Fabric contract itself is OS-independent.

## Mandatory interposition

The fabric is bypass-proof only for downstream consequence paths that are exposed exclusively through CIEAV. A deployment that gives OpenClaw both a governed `cieav.gmail.send` route and an unrestricted direct Gmail MCP route still has a bypass path.

The production topology is therefore:

```text
OpenClaw / agent / automation
          |
          v
 CIEAV Universal Execution Fabric
          |
          +-- identity
          +-- credential lease
          +-- formal graph
          +-- Intent continuity
          +-- state witness
          +-- Reality-Bound Commit
          +-- Execution Ticket
          |
          v
 CIEAV-controlled downstream adapter
          |
          v
 external tool/service
```

For high-assurance deployment, direct consequence-capable credentials and direct downstream MCP/tool registrations must be removed from the agent runtime or blocked by the surrounding OS/network/application policy.

## Audit and observability

The fabric records phases such as:

```text
IDENTITY
AUTHORIZE
STATE_REVALIDATE
COMMIT
ROUTE
EXECUTE
OBSERVE
SETTLE
RECOVER
```

The audit answers:

- Which root Intent caused this action?
- Which agent identity was verified?
- Which credential lease constrained it?
- Which formal rule allowed/asked/blocked it?
- Which Reality Witness existed at authorization time?
- Which one-use commit and execution ticket crossed the boundary?
- Which downstream tool was selected?
- What evidence later proved or contradicted the result?
- Was recovery or Undo needed?

## Relationship to Proof Mesh and recovery

The Execution Fabric governs how a side effect is allowed to start. Proof Mesh governs whether reality ultimately matches the expected consequence. These are deliberately separate.

```text
ExecutionTicket CONSUMED
        !=
Task COMPLETED
```

Only independent proof can settle the task. `UNKNOWN` remains unresolved and quarantined; it is never silently promoted to success because an HTTP call, MCP tool, browser action, or process returned without an error.

## Current implementation boundary

The repository implements the protocol contracts, formal deterministic authorization, identity attestation, scoped credential leases, federated tool registry, proposal binding, Reality-Bound Commit linkage, one-use Execution Tickets, durable authenticated state, and tamper-evident audit.

Protocol-specific downstream transport adapters must obey the same ticket boundary. A deployment must not claim universal non-bypass interposition until every consequence-capable downstream path is actually routed exclusively through a CIEAV-controlled adapter.
