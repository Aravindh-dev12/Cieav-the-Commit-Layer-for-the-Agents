# CIEAV privacy architecture

CIEAV minimizes information before any remote semantic-model call. The production design is **cloud interpretation, local authority**: durable user state and execution capability stay on the device; only privacy-reduced semantic evidence is sent transiently for interpretation.

## Model-visible data

Production semantic inference may receive the origin/path with query strings and fragments removed, page title, clicked-control semantics, bounded/redacted nearby text, form field names/labels/types, inferred data categories, and generic file descriptors.

The cloud request explicitly declares that raw form values, raw secrets, whole-page text, and durable storage are not included/requested. The cloud service has no browser replay capability.

## Intentionally excluded

Production model analysis excludes raw ordinary form values, passwords, card numbers, OTP values, uploaded file contents, full browsing history, Action Receipt storage, and whole-page text. File names are reduced to generic descriptors. URL query parameters are excluded because they frequently contain tokens, identifiers, and private form/search state.

CIEAV does not claim that literally every byte stays on-device: remote inference necessarily transmits a privacy-reduced semantic packet. The precise promise is that durable user state and raw secrets remain local while minimized action evidence is sent transiently for semantic interpretation.

## Post-action outcome verification

Outcome verification runs locally. CIEAV may compare bounded before/after DOM state and observe browser navigation to decide whether an approved action has a credible success or failure signal.

Raw page snapshots used for this comparison are not written to receipts, audit logs, or cloud requests. Persisted outcome evidence is deliberately generic, for example: "a new local page message matched an action-specific success signal." When the evidence is inconclusive, the outcome is recorded as `UNKNOWN`; CIEAV does not convert uncertainty into a success claim.

## Local state

Fresh installations use `~/.cieav/` (or `CIEAV_STATE_DIR`; Windows installers use the per-user CIEAV application directory). Existing `.latch` state may be reused during migration so receipts, credentials, and history are not silently lost.

Local durable state includes the dedicated Chromium profile, device identity, Action Receipts, outcome state, Attention Health/cognitive-debt history, local policies, Gateway credentials, per-install signing secrets, and the bounded local audit log. The protected Chromium profile is separate from the user's normal Chrome profile.

The audit log stores event metadata such as origin, action type, risk, and lifecycle stage. It does not intentionally store raw form values or raw page text and is rotated locally.

## Receipts and local secrets

Action Receipts reveal browsing/action history and are sensitive. Receipt v2 separates `COMMITTED` (the approved action entered the commit/replay path) from the signed post-action `outcome` (`OBSERVED_SUCCESS`, `OBSERVED_FAILURE`, or `UNKNOWN`).

The local Gateway generates distinct per-install API-signing and receipt-signing secrets and stores them with restrictive filesystem permissions where supported. Those signing keys and provider credentials are not passed to Chromium.

Filesystem permissions are not the same as hardware-backed or OS-keychain protection. A future hardening step is OS secure-storage/device-key integration and asymmetric receipt identity. Production deployments that require stronger local-at-rest guarantees should additionally use full-disk/device encryption and appropriate endpoint controls.
