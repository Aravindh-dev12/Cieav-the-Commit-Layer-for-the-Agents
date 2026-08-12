# CIEAV production control plane

CIEAV production is built around one invariant:

> **Cloud = interpretation. Local = authority.**

The public download service distributes software. CIEAV Cloud interprets privacy-reduced action evidence. Neither service receives browser replay authority, local signing secrets, receipt history, or Undo capability.

## Production topology

```text
                         CIEAV-controlled infrastructure

  https://downloads.<cieav-domain>/          https://api.<cieav-domain>/
  ┌──────────────────────────────┐            ┌──────────────────────────┐
  │ install.ps1 / install.sh     │            │ device enrollment        │
  │ stable/manifest.json         │            │ transient semantic API   │
  │ stable/bootstrap-*.txt       │            │ Granite/model routing    │
  │ stable/cieav-runtime-*.zip   │            │ NO execution capability  │
  └──────────────┬───────────────┘            └────────────┬─────────────┘
                 │ verified bootstrap                       │ TLS
                 ▼                                          │
  ┌─────────────────────────────────────────────────────────▼────────────┐
  │                         USER DEVICE                                  │
  │                                                                     │
  │  CIEAV Gateway                                                      │
  │  ├─ per-user Gateway bearer token                                   │
  │  ├─ per-user local API signing secret                               │
  │  ├─ per-user receipt signing secret                                 │
  │  ├─ process supervisor                                              │
  │  ├─ deterministic safety floor                                      │
  │  ├─ local semantic/API bridge                                       │
  │  ├─ protected Chromium profile                                      │
  │  ├─ Action Receipts                                                 │
  │  ├─ lifecycle audit                                                 │
  │  └─ cognitive-debt state                                            │
  │                                                                     │
  │  Only this device can COMMIT / replay / execute / Undo.             │
  └─────────────────────────────────────────────────────────────────────┘
```

The download host and Cloud API may use different hostnames. They have different trust roles and should be operated separately even if they share the same parent domain.

## Consumer bootstrap

Once the production download hostname is configured and the release has passed qualification, Windows users should install CIEAV from the controlled domain root:

```powershell
irm https://downloads.<cieav-domain>/install.ps1 | iex
```

macOS/Linux:

```bash
curl -fsSL https://downloads.<cieav-domain>/install.sh | sh
```

These are examples of the URL shape only. Do not publish them until the actual hostname is configured, TLS is active, the artifacts are present, and the production publish gate passes.

## Download-origin contract

`CIEAV_DOWNLOAD_BASE_URL` is a **clean HTTPS origin**, for example:

```text
https://downloads.<cieav-domain>
```

It must not contain:

- a username or password;
- a path prefix;
- a query string;
- a fragment;
- an HTTP scheme.

The installer is rendered with this origin and trusts bootstrap/release objects only from that same origin.

Bootstrap downloads do **not** follow HTTP redirects. This is deliberate. CDN/origin configuration must directly serve the requested CIEAV object at the public hostname instead of redirecting the installer to another host.

Runtime metadata contains relative artifact paths only. Absolute artifact URLs, `..` traversal, query strings, fragments, and paths outside the selected channel are rejected by the installers.

## Required public object layout

For the `stable` channel:

```text
/
├── install.ps1
├── install.sh
└── stable/
    ├── manifest.json
    ├── bootstrap-windows-x64.txt
    ├── bootstrap-macos-arm64.txt
    ├── bootstrap-linux-x64.txt
    ├── cieav-runtime-<version>-windows-x64.zip
    ├── cieav-runtime-<version>-macos-arm64.zip
    └── cieav-runtime-<version>-linux-x64.zip
```

Only targets that are actually built, clean-machine tested, and included in the cross-platform qualification should be published.

## Publication ordering

A stable-channel release must be promoted in an order that never exposes metadata pointing at a missing runtime:

1. Build the exact source commit on each target platform.
2. Run local release verification and packaged install/upgrade/rollback tests.
3. Collect PASS reports for the same version and commit.
4. Run `npm run release:qualify`.
5. Upload versioned runtime ZIPs to the download origin.
6. Upload matching `bootstrap-*.txt` and `manifest.json` only after all referenced runtimes are available.
7. Publish/replace root `install.ps1` and `install.sh` last.
8. Run real-domain installation probes from clean machines.

CDN cache invalidation must not create a window where new metadata is served with old or missing artifacts. Prefer immutable runtime object names and short/no-cache metadata during promotion.

## Installer safety boundary

The bootstrap performs these checks before installing the OS service:

```text
controlled HTTPS origin
→ no redirect escape
→ platform-specific metadata
→ CIEAV brand/version/path validation
→ SHA-256 verification
→ staged runtime extraction
→ runtime self-check
→ CIEAV Cloud enrollment
→ CRITICAL-payment safety probe
→ per-user Gateway installation
```

If a post-replacement step fails during an upgrade, the previous runtime is restored.

SHA-256 detects corruption or mismatch against trusted metadata. It is **not by itself publisher identity** if an attacker controls the download origin. Production 1.0 should additionally use platform-native code signing/notarization and/or signed release metadata before treating the supply-chain story as complete.

## Local control authority

All normal production starts must route through:

```text
CIEAV Gateway
→ managed local API (`cieav-local-api`)
→ protected browser surface
```

The protected browser must not silently fall back to the standalone development API. `npm start` in repository mode and the packaged OS service both use the Gateway control plane.

The browser child never receives:

```text
Gateway bearer token
JWT/local API signing secret
receipt signing secret
HF/provider token
```

The semantic/API child receives only the local secrets required for its role. CIEAV Cloud never receives these local authority secrets.

## Per-user privacy boundary

Every OS user/install has independent local authority and durable state. At minimum these are distinct:

```text
state directory
installation/device identity
Gateway bearer token
local API signing secret
receipt signing secret
protected browser profile
Action Receipts
lifecycle audit
cognitive-debt history
```

Another local OS user must not inherit or share these files merely because CIEAV is installed on the same computer.

## Cognitive-debt safety boundary

CIEAV must never learn safety from an action merely because the approved click/submit was dispatched.

```text
COMMITTED / replayed
        ≠
verified successful outcome
```

Only `OBSERVED_SUCCESS` may build the safe streak used to reduce repeated MEDIUM-risk friction. `OBSERVED_FAILURE`, `UNKNOWN`, cancellation, Undo, and failed Undo keep or restore friction as appropriate. HIGH/CRITICAL and sensitive classes never habituate to passive mode.

The local audit records the lifecycle needed to explain that behavior without storing raw form values or whole-page content:

```text
ACTION_DETECTED
ACTION_COMMITTED / ACTION_CANCELLED
ACTION_REPLAYED
OUTCOME_OBSERVED
UNDO_AVAILABLE
UNDO_EXECUTED / UNDO_FAILED
```

## Pre-domain validation

Before DNS/CDN setup, use:

```bash
npm install
npm run release:verify
```

This is the authoritative local release-candidate gate. It verifies control authentication, production API identity, cognitive-debt invariants, lifecycle audit wiring, privacy contracts, browser E2E, builds, typechecks, and release metadata/installer rules.

After testing the same version/commit on every shipped OS:

```bash
npm run release:qualify
```

After the real download and Cloud endpoints exist, the repository has been renamed to CIEAV, and public placeholders are removed:

```bash
npm run release:verify:publish
```

A production publish should not proceed until the publish gate and required cross-platform qualification both pass.
