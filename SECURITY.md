# LATCH security model

LATCH mediates consequential browser actions and must treat both page content and model output as untrusted inputs.

## Deterministic safety floor

The model cannot downgrade deterministic risk or make reversibility more optimistic. Financial commitments, credentials, sensitive identity data, destructive operations, and other hard-policy classes remain protected even if every model call fails.

## Multi-stage AI verification

Production AI uses an independent fast gate, primary semantic interpreter, and verifier for high-risk/ambiguous/adversarial actions. Disagreement resolves toward the stricter result and lowers confidence. Failed verification on high-risk actions is surfaced rather than treated as success.

## Prompt injection

DOM text, attributes, and site-declared semantics are hostile. LATCH strips/limits context, locally detects common injection patterns, labels the supplied snapshot as untrusted data, constrains outputs with strict schemas, and forces independent verification when injection is suspected. Page text cannot grant authorization.

## Browser isolation

LATCH uses a dedicated Chromium profile and localhost-only CDP. Mediation logic runs in an isolated JavaScript world. Websites do not receive LATCH device tokens or model credentials.

## Trusted replay

Approved top-frame clicks use Chrome input replay. The bypass is coordinate-bound, single-use, and short-lived; unrelated clicks cannot inherit approval.

## Undo

Undo is offered only when exactly one credible live inverse is found. Revocation is not represented as full reversal when external parties could already have copied data.

## Model operations

API requests have bounded timeouts, transient retry limits, unique client request IDs, `store:false`, strict structured outputs, per-stage telemetry, and model-profile controls. Production model snapshots must pass an eval gate before promotion.

## Local control plane

The controller and semantic service bind to localhost in the browser product. Remote/server deployments require TLS, authenticated devices/users, secret rotation, infrastructure rate limits, encrypted databases, audit logging, and monitored key management.
