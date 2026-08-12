# CIEAV security model

CIEAV mediates consequential browser actions and treats page content, model output, inferred outcomes, and undo candidates as untrusted inputs until deterministic checks accept them.

## Deterministic safety floor

The model cannot downgrade deterministic risk or make reversibility more optimistic. Financial commitments, credentials, sensitive identity data, destructive operations, and other hard-policy classes remain protected even if every semantic model call fails.

Cloud inference has interpretation authority only. It never receives the browser replay/commit capability. The local Gateway remains the authority that can allow, replay, record, pause, or stop protected execution.

## Multi-stage semantic verification

Production semantic routing uses deterministic policy first, cloud/local semantic interpretation where configured, and stricter merging at the local boundary. Disagreement resolves toward the stricter risk/reversibility result. Model failure or low confidence never silently lowers protection.

## Prompt injection

DOM text, attributes, and site-declared semantics are hostile. CIEAV strips/limits context, detects common injection patterns, labels snapshots as untrusted data, constrains structured output, and retains the deterministic minimum. Page text cannot grant authorization or instruct CIEAV to weaken its policy.

## Browser isolation and trusted replay

CIEAV uses a dedicated Chromium profile and localhost-only CDP. Mediation logic runs in an isolated JavaScript world. Websites do not receive CIEAV device tokens, Gateway credentials, model credentials, JWT signing keys, or receipt-signing keys.

Approved top-frame clicks use Chrome input replay. The bypass guard is coordinate-bound (±4 px), single-use, and expires quickly; an unrelated click cannot inherit the approval.

## Commit is not success

A receipt with status `COMMITTED` means the approved action entered the commit/replay path. It does **not** prove that an arbitrary remote server accepted or completed the action.

Receipt v2 stores a separate immutable signed outcome:

- `OBSERVED_SUCCESS` — CIEAV observed evidence strong enough for the supported action class.
- `OBSERVED_FAILURE` — CIEAV observed a failure signal.
- `UNKNOWN` — evidence was insufficient, the page closed, or the verification window expired.

For consequential actions, navigation/redirect alone is evidence but is not treated as proof of payment, deletion, sharing, permission grant, publication, or upload success. Ordinary navigation actions may use a successful top-frame navigation as their outcome.

DOM outcome matching is failure-first and compares before/after state so a pre-existing success banner is not sufficient. Raw DOM snapshots used for comparison remain local and are not persisted as receipt evidence.

## Undo

Undo is available only when **both** conditions hold:

1. the signed action outcome is `OBSERVED_SUCCESS`; and
2. exactly one credible live inverse is available for the current page/action.

The browser host keeps discovered inverse controls as candidates until success is verified. The local receipt API independently refuses an `UNDONE` transition unless the receipt has an observed-success outcome. Failed or unknown outcomes therefore cannot expose Undo.

Revocation/compensation is not represented as full reversal when external parties may already have copied data or when a server-side effect cannot be proven reversible.

## Receipt integrity and local secrets

The Python Gateway generates separate high-entropy per-install secrets for local API token signing and receipt HMAC signing. They are stored in the local CIEAV state directory with restrictive filesystem permissions where supported and are passed only to the semantic/API process, not Chromium.

CIEAV Cloud refuses to start with the built-in development secrets or secrets shorter than the configured minimum. Cloud deployment therefore fails closed on this class of misconfiguration.

Current receipt integrity uses HMAC-SHA256. This provides strong local integrity when the per-install secret remains protected, but it is not an independently verifiable hardware-backed device signature. Per-device asymmetric signing and OS secure-key storage remain future hardening work and must not be implied by current product claims.

## Local audit trail

CIEAV writes a bounded, rotated local audit log for the protected action lifecycle: detection, commit/cancel, replay, observed outcome, Undo availability, and Undo result. Audit records are metadata-oriented and intentionally exclude raw form values and raw page text. The log remains local by default and is not cloud telemetry.

New audit events use a per-user local HMAC-SHA256 integrity chain. Each event authenticates its metadata plus the previous event hash, writes are flushed with `fsync` before replay acknowledgment, and the active log remains linked to the retained rotated segment. `cieav audit verify` checks JSON structure, keyed event authentication, ordering, and retained cross-rotation linkage. Missing or modified retained history therefore fails verification.

The audit integrity key is stored in the same per-user CIEAV state boundary with restrictive filesystem permissions where supported. This protects against accidental corruption and raises the bar against page-level or unprivileged modification, but it is **not** a hardware-backed security boundary and does not protect against an attacker who fully controls the user's OS account and can read/replace both the audit log and its local key. Hardware/OS-keychain-backed audit identity is future hardening work.

## Cloud and remote deployment

The local controller and semantic service bind to loopback. CIEAV Cloud requires TLS termination, authenticated device enrollment, strong server secrets, rate limiting, monitored infrastructure, and private model endpoints. Cloud receipt routes are disabled as local-only resources.

A public CIEAV download/CDN domain is not part of the code-level security boundary until an actual deployment is configured. Installers require HTTPS and release SHA-256 verification before installing a runtime.
