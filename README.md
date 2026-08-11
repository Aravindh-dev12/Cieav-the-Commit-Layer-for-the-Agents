# LATCH

**LATCH is a semantic commit layer for consequential actions on the web.**

Instead of treating a browser as a stream of pages, LATCH treats important interactions as structured actions: share, submit, publish, delete, grant access, upload, connect, transfer, and other consequential operations.

Before a candidate action commits, LATCH creates an `ActionManifest` describing what may happen, who/what is affected, which data categories are involved, risk, and reversibility. After the user continues or cancels, LATCH records an `ActionReceipt` so the action is traceable later.

The model is **an interpreter, not the security authority**. Deterministic policy can only be made stricter by model output, never weaker.

## Repository

- `apps/extension` — Chrome Manifest V3 extension; global DOM interception, redaction, preview UI, local fallback, receipt cache.
- `apps/api` — HTTP API, anonymous device authentication, structured model analysis, signed receipts, Postgres persistence.
- `apps/dashboard` — action timeline and receipt inspector.
- `packages/contracts` — shared action/receipt schemas.
- `packages/core` — deterministic risk/reversibility policy and redaction utilities.
- `packages/sdk` — API client plus native website action declarations.

## What works today

- Runs on arbitrary `http`/`https` pages through a Manifest V3 content script, including matching child/related frames.
- Detects candidate actions using DOM semantics and form characteristics.
- Never sends raw form values for semantic analysis; passwords/card values are not intentionally collected into the semantic snapshot.
- Redacts common emails, phones, card-like strings, OTP-like values and secret patterns from nearby text.
- Builds deterministic action semantics on-device.
- Optionally enriches classification through an OpenAI Responses API call constrained by a strict JSON schema.
- Prevents model output from downgrading deterministic risk.
- Uses a balanced intervention policy by default; strict and high-risk-only modes are available.
- Records committed and cancelled action receipts and re-signs connected receipts when status changes.
- Falls back to local-only operation when the backend is unavailable.
- Stores receipts in Postgres when configured.
- Signs server receipts with HMAC-SHA256.
- Provides a standalone local timeline and a React dashboard.
- Detects a narrow class of unambiguous live-page inverse controls and can route an undo back to the exact tab/frame; ambiguous inverses are refused.
- Allows websites to declare native action semantics through `data-latch-*` attributes or `declareWebAction()`.

## What no browser extension can guarantee

LATCH cannot truthfully promise automatic reversal of every action on every website. A website may execute irreversible server-side side effects, require trusted browser events, expose no inverse API, or deliberately obscure its semantics. LATCH therefore models reversibility explicitly:

- `REVERSIBLE` — a reliable inverse is expected to exist.
- `DELAYABLE` — action may be held before final commit.
- `COMPENSABLE` — an inverse action can mitigate but not erase the original effect.
- `IRREVERSIBLE` — no safe inverse is expected.
- `UNKNOWN` — LATCH cannot prove the semantics.

Native site adapters can provide stronger guarantees where a service exposes a reliable inverse operation.

## Quick start

### 1. Install dependencies

```bash
npm install
```

### 2. Build the Chrome extension

```bash
npm run build:extension
```

Then open Chrome → `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select:

```text
apps/extension/dist
```

### 3. Run the lightweight local backend

```bash
node apps/api/standalone.mjs
```

It serves the API at `http://127.0.0.1:8787` and the standalone action timeline at:

```text
http://127.0.0.1:8787/dashboard
```

The extension's **Timeline** button passes its anonymous device token through the URL fragment; the dashboard immediately removes the fragment from browser history.

### 4. Optional AI-enhanced interpretation

Set `OPENAI_API_KEY` in the backend environment. Without it, LATCH continues using deterministic semantic policy.

```bash
export OPENAI_API_KEY="..."
node apps/api/standalone.mjs
```

### 5. Scalable Postgres/API path

```bash
cp .env.example .env
# replace development secrets in .env

docker compose up --build
```

Or run the TypeScript API without Postgres (in-memory receipt persistence):

```bash
npm run dev:api
```

### 6. React dashboard

```bash
npm run dev:dashboard
```

## Native website integration

A website can give LATCH a semantic hint:

```html
<button
  data-latch-action="document.share"
  data-latch-summary="Share this document with the selected collaborator"
  data-latch-reversibility="REVERSIBLE">
  Share
</button>
```

Or with the SDK:

```ts
import { declareWebAction } from "@latch/sdk";

declareWebAction(button, {
  actionType: "document.share",
  summary: "Share this document with the selected collaborator",
  reversibility: "REVERSIBLE"
});
```

Declarations are **untrusted hints**. A hostile page cannot use them to lower LATCH's deterministic risk classification.

## API

- `POST /v1/devices/register`
- `POST /v1/analyze`
- `POST /v1/receipts`
- `GET /v1/receipts`
- `PATCH /v1/receipts/:id/status`
- `GET /health`

See [`docs/action-manifest.md`](docs/action-manifest.md) for the protocol.

## Security principles

1. Do not ship raw secrets to a model.
2. Treat page content and site declarations as hostile input.
3. Structured model output only.
4. Deterministic policy is the minimum risk floor.
5. Model confidence never creates authorization.
6. User consent remains explicit for intercepted actions.
7. Local-only operation must remain possible.
8. Receipts describe what LATCH observed; they are not proof that a third-party server honored an action.

See [`SECURITY.md`](SECURITY.md) and [`PRIVACY.md`](PRIVACY.md).

## Development

```bash
npm run build
npm run typecheck
npm test
```

The repository also contains standalone/self-test scripts under `scripts/`; the normal source checkout path is to install dependencies and build the extension before running those checks.

## License

Apache-2.0
