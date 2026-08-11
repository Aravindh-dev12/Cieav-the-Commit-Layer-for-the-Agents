# LATCH security model

LATCH is a high-trust browser product. It mediates consequential actions, so the security boundary is part of the product.

## Hostile page content / prompt injection

All page text, DOM attributes, and site-provided semantics are attacker-controlled. Optional model analysis receives a bounded, redacted action snapshot and structured output cannot reduce deterministic risk or make reversibility more optimistic than the hard policy.

## Browser isolation

LATCH launches a dedicated Chromium profile and attaches through localhost-only CDP. The observer runs in a named isolated world. Website JavaScript does not share that global object space and never receives LATCH's device token or model/API credentials.

## Trusted replay without a bypass window

Approved top-frame clicks are replayed using Chrome `Input.dispatchMouseEvent`. The replay exemption is bound to the exact approved coordinates and expires after 750 ms. It is consumed only by a matching replay; unrelated user actions cannot use it.

## Secret/data minimization

Analysis includes semantic metadata such as URL/origin, title, element label, nearby redacted text, form field names/types/labels, inferred categories, and generic file descriptors. It intentionally excludes raw password, card, OTP, and ordinary input values.

## False reversibility

LATCH never promises universal rollback. Undo appears only when exactly one credible inverse is found in the same live semantic scope. If the page disappears or the inverse becomes ambiguous, Undo is refused.

## Cognitive-debt / warning-fatigue safety

HIGH/CRITICAL actions and sensitive categories never habituate to passive mode. Prior cancellation increases future friction. Low model confidence cannot reduce friction.

## Local control plane

The controller and semantic API bind to `127.0.0.1`. Browser state-changing control requests enforce same-origin checks. DevTools uses a localhost-only ephemeral port by default. Remote production deployments require TLS, authenticated accounts/devices, infrastructure rate limits, secret rotation, encrypted persistence, and security logging.

## Receipt integrity

Connected receipts are signed server-side and re-signed when status changes (for example `COMMITTED` → `UNDONE`). Receipts establish what LATCH observed and recorded; they do not prove a third-party server performed or reversed an operation.

## Reporting

Please report vulnerabilities privately and allow maintainers reasonable time to remediate before disclosure.
