# LATCH

**The commit layer for the internet.**

LATCH is a browser-native safety and control layer for consequential web actions. It understands actions such as **pay, transfer, publish, submit, share, connect, upload, delete, revoke** and turns them into explicit semantic commits with risk, reversibility, receipts, and—when a reliable inverse exists—Undo.

LATCH is **not a browser extension and not an AI assistant**. It launches a dedicated Chromium browsing session and mediates actions through Chrome DevTools Protocol (CDP). AI is optional and invisible: deterministic policy always establishes the minimum safety level; a model may add semantic detail but cannot make an action safer than the hard rules allow.

## Working product flow

```text
User browses normally in LATCH Chromium
        ↓
Consequential action is detected
        ↓
Browser-side privacy reduction
        ↓
Deterministic semantic/risk policy
        ↓
Optional frontier-model enrichment
        ↓
Adaptive friction: HARD / SOFT / PASSIVE
        ↓
User commits or cancels
        ↓
Approved top-frame click is replayed as trusted browser input
        ↓
Signed Action Receipt
        ↓
Verified live inverse → optional Undo
```

## Why it is different

Browsers have page history, downloads, passwords, and permissions, but no universal model of **what a user just did**. LATCH adds that missing primitive:

- **Action Manifest** — consequence, data involved, risk, reversibility, confidence, effects.
- **Commit check** — only when the consequence deserves attention.
- **Action Receipt** — durable record of what LATCH observed and what the user committed/cancelled.
- **Undo capability** — only when an unambiguous live inverse can be verified.
- **Cognitive-friction engine** — avoids warning fatigue while never habituating away high-consequence actions.

## Repository

- `apps/browser` — primary product runtime: Chromium launch, isolated-world mediation, trusted replay, Undo, control dashboard.
- `apps/api` — semantic analysis, device auth, signed receipts, optional structured model enrichment, memory/Postgres persistence.
- `apps/dashboard` — reusable receipt timeline.
- `packages/contracts`, `packages/core`, `packages/sdk` — schemas, deterministic policy/redaction, integration helpers.
- `docs/browser-architecture.md` and `docs/cognitive-friction.md` — implementation boundaries and anti-warning-fatigue policy.

## Run LATCH

Requirements: **Node.js 22+** and Chrome/Chromium.

```bash
npm start
```

LATCH starts its local semantic/receipt service, creates a dedicated browser profile under `.latch/`, chooses an ephemeral localhost-only DevTools port, launches Chrome/Chromium, protects normal web tabs, and serves the local action dashboard at `http://127.0.0.1:8790`.

If Chrome is not auto-detected:

```bash
LATCH_CHROMIUM=/path/to/chrome npm start
```

Optional model enrichment:

```bash
export OPENAI_API_KEY=...
export LATCH_MODEL=gpt-5.1
npm start
```

LATCH remains functional without a model key.

## Attention modes

- **Balanced** — default. High/critical/sensitive actions stay hard; uncertain/new medium-risk actions get a soft check; understood lower-risk actions can become passive.
- **Strict** — commit check on every intercepted consequential action.
- **Quiet** — hard checks only for high/critical/sensitive actions plus uncertain medium-risk actions.

High/critical or sensitive actions **never habituate away**.

## Reversibility

`REVERSIBLE`, `DELAYABLE`, `COMPENSABLE`, `IRREVERSIBLE`, and `UNKNOWN` are explicit semantics. LATCH never claims magic rollback. For example, revoking shared access cannot erase copies another party already made, so generic sharing is conservatively `COMPENSABLE`.

## Verification

```bash
npm run test:browser
npm run selftest:noinstall
npm test
```

The real-browser E2E launches headless Chromium and verifies a trusted payment click is intercepted, classified `CRITICAL / IRREVERSIBLE`, replayed after approval as trusted browser input, recorded as a signed receipt, and that an access grant can discover a live `Disconnect` inverse, execute Undo, and transition the receipt to `UNDONE`.

## Security invariants

1. Website DOM/content is hostile input.
2. Raw form values are not sent for semantic analysis.
3. Model output cannot downgrade deterministic risk or reversibility.
4. LATCH logic runs in a named isolated JavaScript world.
5. Controller/API bind to localhost only.
6. Approved click replay is coordinate-bound and single-use—not a global bypass timer.
7. Undo is offered only for exactly one credible live inverse.
8. Receipts record LATCH's observation; they are not proof that a remote server honored an action.

See `SECURITY.md` and `PRIVACY.md`.

## Current boundaries

Privileged pages such as `chrome://` are intentionally outside injection. Top-frame clicks get trusted CDP replay; nested iframe/form semantics still have browser-specific limitations. A browser client cannot reverse inherently irreversible server-side effects.

## License

Apache-2.0
