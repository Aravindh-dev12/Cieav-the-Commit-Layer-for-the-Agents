# LATCH privacy architecture

LATCH minimizes information before any semantic model call.

## Model-visible data

The production AI pipeline may receive the origin/path (query strings and fragments removed), page title, clicked-control semantics, nearby bounded/redacted text, form field names/labels/types, inferred data categories, and generic file descriptors.

## Intentionally excluded

Raw ordinary form values, passwords, card numbers, OTP values, uploaded file contents, and whole-page text are not part of production model analysis. File names are reduced to generic descriptors. URL query parameters are removed before model calls because they frequently contain tokens, identifiers, and private search/form state.

## Responses API state

LATCH sends model requests with `store:false`. Organizations with stronger retention requirements should additionally configure the appropriate OpenAI data-control/retention settings for their account and validate them independently.

## Local state

The dedicated Chromium profile, anonymous device identity, attention state, and local browser controller live under `.latch/` (or `LATCH_STATE_DIR`) and remain separate from the user's normal Chrome profile.

## Receipts

Action Receipts can reveal browsing/action history and are sensitive. Production deployments should use encrypted persistence, explicit retention/auto-delete, key rotation, access controls, and per-site/user exclusion policies.
