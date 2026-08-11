# LATCH privacy architecture

LATCH minimizes data before model/API access.

## Action analysis can include

URL/origin, page title, clicked element text/ARIA label, nearby redacted text, form field names/labels/types, inferred categories such as credential/identity/financial/health/biometric/file, and generic file descriptors.

## Intentionally excluded

LATCH does not send raw form input values for semantic classification. Passwords, card numbers, OTPs, uploaded file contents, and ordinary typed values are not part of the `ActionContext`.

## Local browser state

The dedicated Chromium profile, anonymous device identity, and attention-learning state live under `.latch/` (or `LATCH_STATE_DIR`) and are separate from the user's ordinary Chrome profile.

## Optional model use

LATCH works deterministically without a model. If `OPENAI_API_KEY` is configured, only the reduced action context is sent for structured semantic classification.

## Receipts

Receipts can contain source URL/origin/title, semantic action/effects, risk, reversibility, timestamps, and status. They therefore reveal action history and should be treated as sensitive data.

Before broad consumer distribution, add configurable URL minimization, retention/auto-delete, encrypted at-rest storage, per-site exclusions, account/device key management, and explicit telemetry controls.
