# CIEAV

**The commit layer for the internet.**

CIEAV is an always-on local control plane between digital intent and consequence.

It sits between a human, AI agent, or automation and the browser actions that can create real-world effects. The local Gateway enforces deterministic safety, reduces private context before anything leaves the device, obtains semantic interpretation from CIEAV Cloud Intelligence, and keeps final authority local.

## Architecture

```text
Human / AI agent / automation
            |
            v
     Local CIEAV Gateway
            |
            v
  Deterministic safety floor
            |
            v
     Local privacy reduction
            |
            v
 Minimal semantic packet over TLS
            |
            v
 CIEAV Cloud Intelligence
            |
            v
      Semantic result
            |
            v
 Conservative local merge
            |
            v
 Cognitive-friction policy
            |
            v
          PREVIEW
        /          \
    COMMIT       CANCEL
       |
       v
Trusted replay / submit
       |
       v
 Signed Action Receipt
       |
       v
 Local outcome observer
   /        |         \
SUCCESS   FAILURE    UNKNOWN
   |
   v
Verified inverse
   |
   v
  UNDO
```

### Core principle

**Cloud = interpretation. Local = authority.**

The cloud can interpret privacy-reduced action evidence, but it never receives browser replay or commit capability. The local Gateway is the authority that decides whether an action may proceed.

## Commit is not success

A browser submission or navigation is not proof that the intended consequential action succeeded.

Receipt v3 distinguishes:

- `OBSERVED_SUCCESS`
- `OBSERVED_FAILURE`
- `UNKNOWN`

Redirects, navigation, or a completed browser request alone do not prove consequential success.

Undo requires both:

1. an observed successful outcome; and
2. a credible live inverse action.

The local receipt API independently gates an action as `UNDONE`. If outcome verification is inconclusive, the result remains `UNKNOWN` and Undo is unavailable.

## Production privacy boundary

CIEAV keeps durable user state local.

### Durable local state

The local installation owns:

- receipts and observed outcomes
- Undo state
- cognitive debt
- browser profile and session state
- local policies
- Gateway credentials
- signing secrets
- device enrollment
- execution capabilities
- audit log

### Cloud inference excludes

CIEAV Cloud Intelligence does not receive:

- raw form values
- passwords
- OTPs
- card numbers
- uploaded file contents
- full page text
- URL query strings

Cloud requests explicitly declare the absence of raw secrets, raw form values, and full-page text, and are not intended for durable storage.

Cloud server mode does not expose receipt-storage routes.

Outcome verification may compare local DOM state before and after an action, but raw snapshots are not persisted or sent to the cloud. Evidence is reduced to generic outcome signals.

CIEAV does not claim that literally every byte remains local. The boundary is precise: durable user state and raw secrets remain local; only privacy-reduced action evidence is transiently sent for interpretation.

## Consumer installation

CIEAV is distributed as a small per-OS runtime bundle.

Consumers do **not** separately install Python, Node, npm, or model weights. Chrome/Chromium is required.

### Windows

```powershell
irm https://<CIEAV-DOWNLOAD-DOMAIN>/install.ps1 | iex
```

### macOS / Linux

```bash
curl -fsSL https://<CIEAV-DOWNLOAD-DOMAIN>/install.sh | sh
```

The installer fails closed. It requires:

1. HTTPS transport
2. a release manifest
3. an exact OS/architecture artifact
4. SHA-256 verification
5. runtime installation
6. cloud enrollment
7. a synthetic CRITICAL-payment cloud safety probe
8. OS service installation

There is intentionally no live public CIEAV hostname in this README until the CDN/domain is configured and release artifacts are published.

## Runtime commands

```bash
cieav gateway status
cieav cloud status
cieav cloud probe
cieav doctor
cieav dashboard
cieav test-lab
cieav audit tail --limit 25
cieav gateway pause
cieav gateway resume
cieav gateway restart-surface
```

`cieav audit tail --limit 25` reads a bounded local lifecycle audit log. It is local-only by default and records event metadata rather than raw content.

The old `latch` command is temporarily retained as a compatibility alias.

The Gateway installs as a per-user startup runtime:

- Linux: systemd user services
- macOS: launchd agents
- Windows: Task Scheduler

Closing the Control Center does **not** stop CIEAV.

## Local signing identity

Each installation has a per-install Ed25519 receipt-signing identity.

Receipt v3 includes:

- the signing public key
- a key identifier
- signed receipt data

Private signing material remains local and is encrypted at rest using installation-secret-derived protection.

Legacy HMAC-SHA256 is supported for migration.

CIEAV also uses distinct high-entropy secrets for:

- local API token signing
- durable-state authentication
- other scoped integrity functions

Where supported, OS-backed secret storage and restrictive filesystem permissions are used.

Signing keys and provider credentials are never passed to Chromium.

CIEAV makes no claim of hardware-backed keys or remote attestation unless those capabilities are explicitly provided and independently verified.

## CIEAV Cloud deployment

Set the cloud service environment:

```bash
CIEAV_CLOUD_SERVER=1
HOST=0.0.0.0
PORT=8787
JWT_SECRET=<strong-random-secret>
RECEIPT_SIGNING_SECRET=<different-strong-random-secret>
CIEAV_CLOUD_MODEL_BASE_URL=http://127.0.0.1:8000/v1
CIEAV_CLOUD_MODEL=ibm-granite/granite-4.1-3b
```

Cloud refuses built-in development secrets and undersized secrets.

Production deployments should put the cloud service behind a TLS reverse proxy or load balancer. Release metadata must use the HTTPS production base URL.

### Cloud endpoints

- `GET /health`
- `POST /v1/devices/register`
- `POST /v1/inference/analyze` — device token required

Cloud server mode returns `local_only_resource` for receipt routes.

## Release and CDN pipeline

`.github/workflows/release-runtime.yml` builds standalone Windows, macOS, and Linux runtimes.

The release pipeline:

- bundles Node and the semantic/browser bridge
- generates SHA-256 metadata
- generates a release manifest
- builds installers
- emits `cieav-cdn-publish-layout`

Configure:

```bash
CIEAV_CLOUD_URL=https://<your-production-cloud-api>
CIEAV_DOWNLOAD_BASE_URL=https://<your-public-download-domain>
```

Published layout:

```text
/install.ps1
/install.sh
/stable/manifest.json
/stable/cieav-runtime-<version>-<platform>.zip
```

## Migration from LATCH

CIEAV is the new product identity.

Fresh installations use:

```text
~/.cieav
```

and CIEAV-named services.

If `~/.latch` exists and `~/.cieav` does not, CIEAV reuses the legacy state to avoid data loss.

After a future major migration, legacy `LATCH_*` variables, compatibility identifiers, and the `latch` command can be removed.

## Failure behavior

CIEAV fails conservative.

If the cloud is unavailable, deterministic HIGH/CRITICAL/sensitive protections remain active.

Semantic uncertainty must never silently become a safer policy.

If outcome verification is inconclusive:

```text
UNKNOWN
```

Undo is unavailable until success can be observed and a credible live inverse exists.

## Optional local and diagnostic models

Normal consumers do not install a local model.

A local model mode is available for enterprise and offline deployments.

Direct Hugging Face models can be used as an optional diagnostic fallback, but they are not the consumer production path.

## Security invariants

1. **Website content is hostile.**
2. **Raw secret and form values never enter cloud/model context.**
3. **AI cannot lower the deterministic safety floor.**
4. **HIGH, CRITICAL, and sensitive actions never habituate into passive mode.**
5. **Approved replay is coordinate-bound, single-use, and short-lived.**
6. **COMMITTED is not a remote-success claim.**
7. **UNKNOWN stays UNKNOWN; navigation is not proof.**
8. **Undo requires observed success plus one credible live inverse.**
9. **Receipts describe what CIEAV observed, not arbitrary remote-server behavior.**
10. **The Gateway privileged control loop is loopback-only and protected by a local bearer token.**
11. **Cloud interpretation never performs local execution.**
12. **Closing the UI does not stop the Gateway.**

## Verification

Run the platform and test suite with:

```bash
npm run platform:check
npm run build
npm run test:cloud
npm run test:ai-orchestration
npm run test:cognitive-debt
npm run typecheck
npm run test:core
npm run test:browser
```

CI additionally:

- syntax-checks the browser execution boundary
- runs synthetic browser E2E coverage for success, failure, and unknown outcomes

## License

Apache-2.0.

## About

CIEAV is the commit layer for the internet: a local-first control plane designed to make consequential digital actions safer, observable, reversible where possible, and privacy-conscious by construction.

### Resources

- Readme
- Apache-2.0
- Security policy

### Activity

- Stars: 0
- Watchers: 0
- Forks: —

---

**Cloud interprets. Local authority commits.**
