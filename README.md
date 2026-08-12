# LATCH

**The commit layer for the internet.**

LATCH is a browser-native safety/control layer for consequential web actions. It understands actions such as **pay, transfer, publish, submit, share, connect, upload, delete, revoke** and turns them into explicit semantic commits with risk, reversibility, receipts, and verified Undo when a credible inverse exists.

LATCH is not an assistant and not an extension. It launches a dedicated Chromium browsing session and mediates actions through Chrome DevTools Protocol.

## Production AI

When `OPENAI_API_KEY` is configured, AI is the semantic core behind LATCH's interpretation layer—not a single optional classifier. The production path uses:

```text
browser-side privacy reduction
        ↓
fast independent AI gate
        +
primary frontier semantic interpreter
        +
independent verifier for high-risk / ambiguous actions
        ↓
conservative consensus
        ↓
deterministic safety floor
        ↓
adaptive HARD / SOFT / PASSIVE friction
```

The hard safety policy remains authoritative: AI can make a classification stricter or add semantic detail, but cannot downgrade deterministic risk/reversibility.

High-risk, sensitive, prompt-injected, or unknown-reversibility actions receive independent verification. Model disagreement lowers confidence and resolves toward the stricter interpretation. Model failures never turn a protected action into an unprotected action.

See [`docs/ai-architecture.md`](docs/ai-architecture.md).

## Run production LATCH

Requirements: Node.js 22+, npm, Chrome/Chromium.

```bash
npm install
export OPENAI_API_KEY=...
npm start
```

`npm start` builds the production TypeScript semantic API, launches it on localhost, then starts the LATCH browser. The no-install standalone service is kept only as a development/offline fallback and is not the production AI path.

### AI profiles

```bash
LATCH_AI_PROFILE=balanced   # default
LATCH_AI_FAST_MODEL=gpt-5-mini
LATCH_AI_PRIMARY_MODEL=gpt-5.1
LATCH_AI_VERIFIER_MODEL=gpt-5-pro
npm start
```

Profiles:

- **economy** — low-cost ordinary-action gate; high-risk actions still escalate.
- **balanced** — gate + primary, with verifier for high-risk/ambiguous/adversarial actions.
- **maximum** — broad independent verification and higher reasoning effort.

For a real production release, pin model snapshots only after they pass the LATCH evaluation set instead of relying indefinitely on moving aliases.

## Privacy and adversarial pages

Raw form values, passwords, card numbers, OTPs, uploaded file contents, whole-page text, and URL query strings are excluded from model analysis. Every model request sets `store:false`. DOM/page text is treated as hostile data; suspected prompt injection triggers conservative handling and independent verification.

## Core product behavior

- Action Manifest: consequence, target, data categories, risk, reversibility, effects, confidence.
- Cognitive friction: hard warnings for high consequence, soft checks for uncertain/new medium risk, passive recording where interruption is unnecessary.
- Signed Action Receipts.
- Verified live Undo only where a credible inverse exists.
- Dedicated LATCH Chromium profile, separate from normal Chrome.
- Deterministic fallback if AI is unavailable.

## Verification

```bash
npm run build
npm run test:ai-orchestration
npm run typecheck
npm run test:core
npm run test:browser
```

`test:ai-orchestration` boots a fake Responses endpoint and the real compiled LATCH API, then verifies multi-stage gate/primary/verifier routing, conservative consensus, prompt-injection escalation, `store:false`, and that URL query secrets never reach model input.

`test:browser` launches real headless Chromium and verifies trusted action replay, CRITICAL/IRREVERSIBLE payment classification, signed receipts, live inverse detection, and an Undo transition to `UNDONE`.

## Security invariants

1. Website content is hostile input.
2. Raw secret/form values are not model context.
3. AI cannot lower the deterministic safety floor.
4. High-consequence actions never habituate to passive mode.
5. Approved replay is coordinate-bound and single-use.
6. Undo is offered only when a credible inverse is verifiable.
7. Receipts describe what LATCH observed; they do not prove remote-server behavior.

See [`SECURITY.md`](SECURITY.md), [`PRIVACY.md`](PRIVACY.md), and [`docs/cognitive-friction.md`](docs/cognitive-friction.md).

## License

Apache-2.0
