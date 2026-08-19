# Intent-to-Reality compatibility note

This path is retained for compatibility with the earlier `agent/intent-to-reality-core` branch.

The canonical production architecture is now documented in the repository-root documents:

- `INTENT-TO-REALITY.md`
- `CONTROL-PLANE.md`
- `EXECUTION-FABRIC.md`
- `FRAMEWORK-INTEROP.md`
- `OPENCLAW.md`

The earlier PR #8 implementation was reconciled against the newer universal control-plane architecture already on `main`. Overlapping runtime, contract, API, MCP/A2A, test, workflow, and release-gate files intentionally use the newer `main` implementations rather than carrying two competing Intent-to-Reality stacks.

Canonical execution invariant:

`Intent → attenuation → identity → scoped credential authority → formal authorization → framework/protocol binding → Reality Witness → Reality-Bound Commit → Operation Mandate → one-use Execution Ticket → trusted CIEAV router → real effect → Proof Mesh → PROVEN/DISPROVEN/UNKNOWN → completion/recovery.`

`COMMITTED` is not success. Framework or transport completion is not proof. A deployment may claim `MANDATORY` mediation only when consequence-capable direct routes are actually unavailable outside CIEAV.
