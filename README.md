# LATCH

**The commit layer for the internet.**

LATCH is an always-on local platform that sits between digital intent and digital consequence. The **LATCH Gateway** starts with the operating system, supervises protected surfaces, runs deterministic safety policy and semantic intelligence, tracks cognitive debt, stores Action Receipts, and exposes verified Undo only when a credible inverse exists.

The browser is the first LATCH surface, not the product boundary. LATCH launches a dedicated Chromium session and mediates consequential actions through Chrome DevTools Protocol while the Python Gateway owns lifecycle and supervision.

```text
Human / AI agent / automation
            ↓
      LATCH Gateway
            ↓
 deterministic safety kernel
            ↓
 semantic intelligence
            ↓
 cognitive-friction policy
            ↓
 COMMIT / CANCEL / RECEIPT / UNDO
            ↓
 browser today; more surfaces later
```

## Platform runtime

Requirements: Python 3.11+, Node.js 22+, npm, Chrome/Chromium.

Install the Python control plane and build the production semantic runtime:

```bash
python -m pip install -e .
npm install
npm run build:api
```

Run the Gateway in the foreground while developing:

```bash
latch gateway run
```

Or install it as a per-user startup service:

```bash
latch gateway install
latch gateway status
```

The service implementation uses systemd user services on Linux, launchd agents on macOS, and a per-user Task Scheduler entry on Windows.

Useful commands:

```bash
latch doctor
latch dashboard
latch test-lab
latch gateway pause
latch gateway resume
latch gateway restart-surface
latch gateway uninstall
```

`latch test-lab` opens synthetic payment, access-grant, publication, deletion, upload, prompt-injection, and repeated-medium-risk scenarios. They exercise the real LATCH interception path but do not perform real external effects.

## Production AI

When `OPENAI_API_KEY` is configured, the production semantic layer uses a fast gate, primary semantic interpreter, and independent verifier for high-risk/ambiguous/adversarial actions. Deterministic risk and reversibility floors remain authoritative.

```text
privacy-reduced browser evidence
        ↓
fast gate + primary interpreter
        ↓
independent verifier when needed
        ↓
conservative consensus
        ↓
deterministic safety floor
```

The architecture is deliberately model-agnostic. A future local open-weight LATCH model can become the first semantic tier, with frontier inference used only for escalation. Model promotion must pass the LATCH eval corpus rather than relying on benchmark reputation.

See [`docs/ai-architecture.md`](docs/ai-architecture.md) and [`docs/model-evals.md`](docs/model-evals.md).

## Cognitive debt

LATCH measures whether its own warnings are becoming harmful through repetition. HIGH, CRITICAL, credential, financial, identity, health, and biometric actions never habituate to PASSIVE. Repeated safe MEDIUM actions can become passive; cancellation or Undo restores attention; repeated near-instant approvals trigger refocus instead of weaker protection.

See [`docs/cognitive-friction.md`](docs/cognitive-friction.md).

## Privacy and adversarial pages

Raw form values, passwords, card numbers, OTPs, uploaded file contents, whole-page text, and URL query strings are excluded from model analysis. Model requests use `store:false`. Website content is always untrusted input; prompt-injection indicators increase scrutiny rather than changing LATCH policy.

## Security invariants

1. Website content is hostile input.
2. Raw secret/form values are not model context.
3. AI cannot lower the deterministic safety floor.
4. HIGH/CRITICAL/sensitive actions never habituate to passive mode.
5. Approved replay is coordinate-bound, single-use, and short-lived.
6. Undo is offered only when a credible inverse is verifiable.
7. Receipts describe what LATCH observed; they do not prove arbitrary remote-server behavior.
8. The Gateway binds local control to loopback and privileged operations require its local bearer token.
9. Closing the Control Center does not stop the Gateway.

## Verification

```bash
npm run platform:check
npm run build
npm run test:ai-orchestration
npm run test:cognitive-debt
npm run typecheck
npm run test:core
npm run test:browser
```

## License

Apache-2.0
