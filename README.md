# CIEAV

**The commit layer for the internet.**

CIEAV is an always-on local control plane that sits between digital intent and digital consequence. The **CIEAV Gateway** starts with the operating system, mediates protected surfaces, keeps deterministic safety policy and execution authority local, tracks cognitive debt, stores Action Receipts locally, and exposes Undo only when a credible inverse exists.

Production semantic intelligence runs on **CIEAV Cloud**. The user does not download Granite or other large model weights. Before cloud inference, the local Gateway/browser path reduces the action to the minimum semantic evidence needed for classification. Durable user state remains on the device.

```text
Human / AI agent / automation
            ↓
      local CIEAV Gateway
            ↓
 deterministic safety floor
            ↓
 local privacy reduction
            ↓
 minimal semantic packet ─────TLS────→ CIEAV Cloud Intelligence
            ↑                              │
            └──── semantic result ─────────┘
            ↓
 conservative local merge
            ↓
 cognitive-friction policy
            ↓
 COMMIT / CANCEL / RECEIPT / UNDO
```

**Cloud = interpretation. Local = authority.** CIEAV Cloud never receives the browser replay/commit capability.

## Production privacy boundary

Durable local state includes Action Receipts, Undo state, cognitive-debt history, browser profile/session state, local policies, Gateway credentials, device enrollment credentials, and execution capabilities.

Normal cloud inference excludes raw form values, passwords, OTPs, card numbers, uploaded file contents, full page text, and URL query strings. The cloud request explicitly declares that raw secrets/form values/full-page text are absent and that durable storage is not requested. Cloud server mode does not expose receipt storage routes.

Because semantic inference is remote, CIEAV does **not** claim that literally every byte remains on-device. The precise promise is: durable user state and raw secrets remain local; only privacy-reduced action evidence is sent transiently for semantic interpretation.

## Consumer installation

Production releases are packaged as small per-OS runtimes. Users do not need Python, Node, npm, or model weights installed separately; the release bundle contains the CIEAV executable and its Node runtime. Google Chrome/Chromium must be installed.

Once the official public download CDN is configured, Windows installation is one command:

```powershell
irm https://<CIEAV-DOWNLOAD-DOMAIN>/install.ps1 | iex
```

macOS/Linux use the native installer:

```bash
curl -fsSL https://<CIEAV-DOWNLOAD-DOMAIN>/install.sh | sh
```

The installer is fail-closed: it requires HTTPS, downloads the release manifest, selects the exact OS/architecture artifact, verifies SHA-256, installs the runtime, enrolls the device with CIEAV Cloud, runs a synthetic CRITICAL-payment cloud safety probe, and only then installs the always-on OS service.

## Runtime commands

```bash
cieav gateway status
cieav cloud status
cieav cloud probe
cieav doctor
cieav dashboard
cieav test-lab

cieav gateway pause
cieav gateway resume
cieav gateway restart-surface
```

The old `latch` command is retained temporarily as a compatibility alias during migration. New documentation and installations use `cieav`.

The Gateway installs as a per-user startup runtime using systemd user services on Linux, launchd agents on macOS, and Task Scheduler on Windows. Closing the Control Center does not stop CIEAV.

## CIEAV Cloud deployment

Run the cloud API with the new CIEAV variables. Legacy `LATCH_*` aliases remain temporarily accepted while the runtime migration is completed:

```text
CIEAV_CLOUD_SERVER=1
HOST=0.0.0.0
PORT=8787
JWT_SECRET=<strong-random-secret>
CIEAV_CLOUD_MODEL_BASE_URL=http://127.0.0.1:8000/v1
CIEAV_CLOUD_MODEL=ibm-granite/granite-4.1-3b
```

Put the public API behind a production TLS reverse proxy/load balancer and expose the resulting HTTPS base URL in release metadata.

Cloud endpoints:

```text
GET  /health
POST /v1/devices/register
POST /v1/inference/analyze   (device token required)
```

Cloud server mode returns `local_only_resource` for receipt routes.

## Release / CDN pipeline

`.github/workflows/release-runtime.yml` builds standalone runtimes on Windows, macOS, and Linux, bundles Node and the semantic/browser bridge, produces SHA-256 metadata, generates the release manifest, renders `install.ps1` and `install.sh`, and emits a `cieav-cdn-publish-layout` artifact.

Configure:

```text
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

CIEAV is the new product identity. Fresh installs use `~/.cieav` and CIEAV-named OS services. If an existing `~/.latch` state directory exists and no `~/.cieav` directory exists, the runtime reuses the legacy state so receipts, credentials, and history are not silently lost. Legacy `LATCH_*` environment variables and the `latch` command are compatibility aliases only and can be removed in a future major release after migration.

## Failure behavior

CIEAV is fail-conservative. If Cloud Intelligence is unavailable, deterministic HIGH/CRITICAL/sensitive protections remain active locally; semantic uncertainty must not silently become safer.

## Optional local/diagnostic models

Normal consumers do not install a local model. Local model mode remains available for enterprise/offline deployments. Direct Hugging Face configuration is an optional diagnostic fallback, not the production consumer path.

## Security invariants

1. Website content is hostile input.
2. Raw secret/form values are not cloud/model context.
3. AI cannot lower the deterministic safety floor.
4. HIGH/CRITICAL/sensitive actions never habituate to passive mode.
5. Approved replay is coordinate-bound, single-use, and short-lived.
6. Undo is offered only when a credible inverse is verifiable.
7. Receipts describe what CIEAV observed; they do not prove arbitrary remote-server behavior.
8. Gateway privileged control binds to loopback and requires its local bearer token.
9. CIEAV Cloud has interpretation authority only, never local execution authority.
10. Closing UI does not stop the Gateway.

## Verification

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

## License

Apache-2.0
