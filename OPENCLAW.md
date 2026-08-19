# CIEAV + OpenClaw

CIEAV is installed as a prebuilt local runtime. End users do not clone this repository and do not install Node, npm, npx, Python, pip, pnpm, Yarn, or workspace packages to run CIEAV.

## Consumer install

### Windows

The production distribution is designed for a one-command PowerShell install from the rendered CIEAV download origin:

```powershell
irm https://<cieav-download-origin>/stable/install.ps1 | iex
```

The rendered installer:

1. downloads signed CIEAV release metadata over HTTPS;
2. verifies the pinned release trust root;
3. downloads the correct Windows runtime archive;
4. verifies SHA-256 and the pinned Authenticode publisher;
5. installs the prebuilt `cieav.exe` in the current user's local application directory;
6. installs the bundled Node runtime used internally by CIEAV's local API/MCP components;
7. adds the CIEAV command shim to the user's PATH;
8. runs CIEAV runtime and Cloud safety checks;
9. installs the per-user always-on Gateway;
10. if OpenClaw is already installed, registers CIEAV as OpenClaw's governed MCP server and probes the live bridge.

No package manager is invoked by the consumer path.

Use `-NoOpenClaw` to skip automatic OpenClaw registration and `-NoService` to install without the always-on Gateway. OpenClaw auto-registration is skipped when the local authority service is disabled.

### macOS / Linux

The Unix distribution follows the same prebuilt-runtime model:

```sh
curl -fsSL https://<cieav-download-origin>/stable/install.sh | sh
```

It downloads and verifies the platform runtime, installs the bundled runtime, installs the per-user OS service, and opportunistically connects OpenClaw when it is already available. Set `CIEAV_NO_OPENCLAW=1` to suppress registration.

## OpenClaw registration

Automatic registration is equivalent to:

```text
cieav openclaw connect
```

The integration uses OpenClaw's outbound MCP registry. The saved OpenClaw server definition executes the installed CIEAV binary directly:

```text
command = <installed cieav executable>
args    = openclaw serve --intent <intent-id> --max-risk HIGH
```

It does not use `npx`, an npm package, a source checkout, a Python interpreter, or an externally installed Node runtime.

The default managed OpenClaw Intent Contract permits arbitrary semantic action names through an explicit `*` action envelope, but that wildcard does not bypass CIEAV's other constraints. Risk ceilings, human-approval thresholds, enterprise policy, formal permission graphs, scoped credential leases, proof requirements, Reality-Bound Commit enforcement, retry quarantine, and settlement rules remain authoritative.

## Tokenless-at-rest OpenClaw configuration

CIEAV does not save a long-lived CIEAV agent bearer token or downstream provider credentials in OpenClaw configuration.

When OpenClaw starts the registered CIEAV MCP server:

1. OpenClaw executes `cieav openclaw serve`.
2. The installed CIEAV executable talks to the loopback-only local authority.
3. CIEAV creates a fresh short-lived agent session scoped to the saved Intent Contract and maximum risk.
4. The CIEAV MCP launcher removes Gateway, browser-control, audit, signing, model-provider, and other privileged secrets from the child environment.
5. Only the short-lived scoped agent token and loopback API address are given to the MCP bridge.
6. The MCP bridge exits with the OpenClaw stdio session; a future launch gets a new scoped token.

Provider credentials for a CIEAV-controlled downstream adapter remain in CIEAV/OS-protected storage and are referenced by digest/handle from the Execution Fabric. They are not copied into the OpenClaw process.

## Commands

```text
cieav openclaw connect
cieav openclaw status
cieav openclaw doctor
cieav openclaw disconnect
```

`connect` creates/reuses the local OpenClaw Intent Contract, writes the OpenClaw MCP definition, runs OpenClaw's MCP doctor, and performs a live probe unless `--no-probe` is supplied.

`disconnect` removes the CIEAV MCP registration from OpenClaw. It does not uninstall CIEAV or destroy unrelated OpenClaw configuration.

## Governed execution transaction

For consequence-capable work, CIEAV's Universal Execution Fabric adds a second boundary beyond ordinary MCP registration:

```text
OpenClaw agent session
       |
       v
Agent Kernel task + root Intent
       |
       v
CIEAV Agent Identity Attestation
       |
       v
short-lived Scoped Credential Lease
       |
       v
Formal Permission Graph (DENY by default)
       |
       v
Execution Proposal
       |
       v
ALLOW / ASK / BLOCK
       |
       v
Reality Witness + Reality-Bound Commit
       |
       v
state revalidation + commit consumption
       |
       v
single-use Execution Ticket
       |
       v
CIEAV-controlled downstream adapter
       |
       v
real-world effect
       |
       v
Proof Mesh → PROVEN / DISPROVEN / UNKNOWN
```

A formal ALLOW result is not enough to execute. The one-use Execution Ticket is issued only when the proposal remains bound to the same Agent Kernel task, root Intent, semantic effect, pre-state, expected post-state, proof obligation, active credential lease, and consumed Reality-Bound Commit.

## Execution boundary

The OpenClaw registration described here is a governed CIEAV MCP server. It gives OpenClaw access to CIEAV authorization, commitment, proof, recovery, settlement, identity, formal authorization, and Execution Fabric mechanisms without handing OpenClaw the Gateway authority secret or provider credentials.

It is **not** a claim that every other OpenClaw tool becomes automatically interposed. If OpenClaw is separately configured with a direct Gmail, payment, filesystem, GitHub, browser, or other consequential MCP/tool path, that separate path can remain callable unless OpenClaw policy removes it or the tool is placed behind CIEAV.

The mandatory-mediation production topology is:

```text
OpenClaw
   |
   v
CIEAV Universal Execution Fabric
   |
   +--> verified agent identity
   +--> scoped credential lease
   +--> formal permission graph
   +--> Intent attenuation
   +--> state-sensitive Reality-Bound Commit
   +--> single-use Execution Ticket
   +--> tamper-evident audit
   |
   v
CIEAV-controlled downstream MCP/A2A/API/tool adapter
   |
   v
Gmail / payment / GitHub / filesystem / browser / other effect surface
   |
   v
Proof Mesh
   |
   +--> PROVEN
   +--> DISPROVEN
   +--> UNKNOWN → cross-channel quarantine
```

For a bypass-resistant OpenClaw deployment, consequence-capable direct MCP/tool registrations must be removed or denied and their credentials must not be available to OpenClaw. The only consequence path should be the CIEAV-controlled downstream adapter path.

See `EXECUTION-FABRIC.md` for the protocol and security invariants.
