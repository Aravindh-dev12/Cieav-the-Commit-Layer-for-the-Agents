# CIEAV security model

CIEAV mediates consequential browser actions and treats page content, model output, inferred outcomes, and undo candidates as untrusted until deterministic checks accept them.

## Deterministic authority

Models interpret semantics; deterministic local code controls execution. Model output cannot downgrade deterministic risk or make reversibility more optimistic. Once a consequential interaction is intercepted, control/analysis failure blocks execution rather than failing open.

Cloud inference has no browser replay capability. The local Gateway remains the authority that starts/stops the protected surface, owns provider/control secrets, and requires the durable managed local API in production.

Managed production surfaces also forcibly disable `CIEAV_TEST_AUTO_APPROVE` and its legacy alias even when inherited from a polluted parent environment.

## Browser isolation and replay

CIEAV uses a dedicated Chromium profile and isolated-world mediator. Approved top-frame click replay is coordinate-bound, one-shot, and short-lived. Chromium never receives Gateway bearer credentials, model provider credentials, API-signing secrets, receipt private keys, or audit-integrity keys.

The current implementation still uses loopback Chrome DevTools Protocol transport. Loopback reduces network exposure but is not as strong as a private inherited pipe. Chromium supports `--remote-debugging-pipe`; migrating the managed production browser to a private pipe is a remaining local-authority hardening item and should be completed before making a strongest-possible local isolation claim.

## Privacy boundary

Every supported remote model egress uses an explicit privacy reducer. URL credentials/query/fragment data, raw form values, full-page text, raw filenames, file contents, and common secret patterns are removed before inference. The Python Cloud provider independently reconstructs an allowlisted packet and refuses non-HTTPS remote Cloud URLs.

Authenticated CIEAV Cloud requests do not follow redirects. CIEAV Cloud independently validates the minimized context and deterministic baseline instead of trusting privacy booleans supplied by the client.

## Prompt injection

Page text and site-declared semantics are hostile data. CIEAV limits/redacts context, detects common injection patterns, constrains model output, and retains the deterministic minimum. Page content cannot grant authorization, enable a site adapter, or reduce required friction.

## Outcome truth boundary

`COMMITTED` means the approved action entered replay; it does not prove a remote service succeeded. Post-action outcome is separately signed as `OBSERVED_SUCCESS`, `OBSERVED_FAILURE`, or `UNKNOWN`.

HIGH/CRITICAL actions cannot become successful from generic DOM success text alone. Navigation alone does not prove payment, deletion, publication, sharing, permission grant, or upload success.

## Trusted Undo

One-click Undo requires a signed `OBSERVED_SUCCESS` and a trusted bundled adapter. Generic button labels cannot unlock production Undo. Adapter capabilities are bound to adapter ID/version, exact action type, origin/path rules, expiry, and a deterministic resource fingerprint; the capability is revalidated at execution time.

Compensation/revocation is not described as complete reversal when copies, fees, third-party access, or other effects may persist.

## Receipt and audit integrity

Managed receipt v3 uses a persistent per-user Ed25519 keypair. Receipts can be publicly verified from their embedded public key, while the durable store additionally anchors them to the locally enrolled key. Legacy HMAC receipts remain readable for migration.

The Ed25519 private key is filesystem-protected, not hardware-backed. A fully compromised OS account may obtain it.

Audit events use a per-user HMAC-SHA256 chain, cross-rotation linkage, and fsync before replay acknowledgement. `cieav audit verify` checks integrity locally. This is tamper evidence against modification without the local key, not a hardware-backed transparency log.

## Local services

Gateway, local API, Control Center, and current CDP transport bind to loopback. Loopback is not a sandbox against a fully compromised same-user local process. Local-service authentication and private browser-control transport remain important defense-in-depth areas; product claims must not equate loopback binding with OS-level isolation.

## Distribution and cloud deployment

Installers require HTTPS-controlled distribution, SHA-256 artifact verification, same-origin bootstrap/runtime downloads, redirect rejection, and transactional rollback. A final production release still needs real-domain TLS/CDN deployment, platform signing/notarization where applicable, signed release provenance/manifest hardening, monitoring, backups, and operational rate limits.
