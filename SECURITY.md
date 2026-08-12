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

CIEAV uses a dedicated Chromium profile and localhost-only CDP. Mediation logic runs in an isolated JavaScript world. Websites do not receive CIEAV device tokens, Gateway credentials, model credentials, JWT signing keys, receipt-signing private keys, or local audit-integrity material.

Approved top-frame clicks use Chrome input replay. The bypass guard is coordinate-bound (±4 px), single-use, and expires quickly; an unrelated click cannot inherit the approval.

Once CIEAV has intercepted a consequential action, loss of the analysis/control path fails conservative: the protected action is not silently replayed outside the commit boundary.

## Commit is not success

A receipt with status `COMMITTED` means the approved action entered the commit/replay path. It does **not** prove that an arbitrary remote server accepted or completed the action.

Receipts store a separate immutable signed outcome:

- `OBSERVED_SUCCESS` — CIEAV observed evidence strong enough for the supported action class.
- `OBSERVED_FAILURE` — CIEAV observed a failure signal.
- `UNKNOWN` — evidence was insufficient, the page closed, or the verification window expired.

For consequential actions, navigation/redirect alone is evidence but is not treated as proof of payment, deletion, sharing, permission grant, publication, or upload success. Ordinary navigation actions may use a successful top-frame navigation as their outcome.

DOM outcome matching is failure-first and compares before/after state so a pre-existing success banner is not sufficient. Raw DOM snapshots used for comparison remain local and are not persisted as receipt evidence. HIGH and CRITICAL actions do not become `OBSERVED_SUCCESS` from page text alone; a page can still contribute failure evidence, but success remains unresolved until a stronger supported signal exists.

## Undo

Undo is available only when **both** conditions hold:

1. the signed action outcome is `OBSERVED_SUCCESS`; and
2. a trusted inverse implementation is available for the exact committed action.

Generic page-label matching such as finding a button named `Disconnect`, `Restore`, or `Remove` is **not** a production trust mechanism and cannot unlock one-click Undo on arbitrary websites. The label-based inverse discovery used by the synthetic browser E2E is restricted to explicit test-auto mode. Production one-click Undo requires a trusted CIEAV/site adapter; until such an adapter exists, CIEAV does not claim a verified inverse.

The local receipt API independently refuses an `UNDONE` transition unless the receipt has an observed-success outcome. Failed or unknown outcomes therefore cannot expose Undo.

Revocation/compensation is not represented as full reversal when external parties may already have copied data or when a server-side effect cannot be proven reversible.

## Receipt identity and local secrets

New managed local-authority receipts use a persistent per-user Ed25519 device keypair and receipt format v3. The private key remains in the local CIEAV state directory with restrictive filesystem permissions where supported and is used only by the local API process. Each v3 receipt contains the corresponding public verification key and a SHA-256-derived key identifier, so its signature can be verified without sharing the private key.

The local durable receipt store does more than self-verification: it anchors v3 receipts to the locally enrolled public key. A receipt signed correctly by a different keypair is therefore not accepted as part of that user's durable history.

Legacy receipt v1/v2 HMAC-SHA256 signatures remain readable during migration using the existing per-install receipt secret. When an old receipt is subsequently updated by the current local authority it can be re-signed into the v3 device-identity format.

Ed25519 makes new receipts independently verifiable, but the current key is filesystem-protected rather than hardware-backed. A fully compromised OS account may be able to access local key material. OS secure-key storage / hardware-backed identity remains a future hardening layer and must not be implied by product claims.

CIEAV Cloud refuses to start with built-in development secrets or secrets shorter than the configured minimum. Cloud deployment therefore fails closed on this class of misconfiguration.

## Local audit trail

CIEAV writes a bounded, rotated local audit log for lifecycle events including detection, commit/cancel, replay, observed outcome, Undo availability, and Undo execution/failure. Records are metadata-oriented and intentionally exclude raw form values and raw page text.

New audit events use a per-user HMAC-SHA256 integrity chain and are fsync-backed before replay acknowledgment. The current segment is linked to the retained rotated segment, and `cieav audit verify` checks JSON, chain linkage, and keyed event authentication locally. Existing legacy audit segments remain readable during migration.

The audit key is local filesystem-protected material, not a hardware-backed transparency service. This detects accidental/page-level modification and modification without the local key, but does not claim protection against a fully compromised OS user that can read and rewrite CIEAV state. Audit data remains local by default and is not cloud telemetry.

## Cloud and remote deployment

The local controller and semantic service bind to loopback. CIEAV Cloud requires TLS termination, authenticated device enrollment, strong server secrets, rate limiting, monitored infrastructure, and private model endpoints. Cloud receipt routes are disabled as local-only resources.

A public CIEAV download/CDN domain is not part of the code-level security boundary until an actual deployment is configured. Installers require HTTPS and release SHA-256 verification before installing a runtime.
