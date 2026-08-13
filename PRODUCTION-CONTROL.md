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
  │ stable/bootstrap-*.txt       │            │ model routing            │
  │ stable/signatures/*.json     │            │ NO execution capability  │
  │ stable/release-public-key.pem│            └────────────┬─────────────┘
  │ stable/cieav-runtime-*.zip   │                         │ TLS
  └──────────────┬───────────────┘                         │
                 │ verified bootstrap                      │
                 ▼                                         │
  ┌────────────────────────────────────────────────────────▼─────────────┐
  │                         USER DEVICE                                  │
  │                                                                     │
  │  CIEAV Gateway                                                      │
  │  ├─ per-user local authority and OS-backed secrets where available  │
  │  ├─ managed local semantic/API bridge                               │
  │  ├─ authenticated Control Center                                    │
  │  ├─ private Chromium CDP pipe                                       │
  │  ├─ protected Chromium profile                                      │
  │  ├─ signed Action Receipts                                          │
  │  ├─ keyed lifecycle audit                                           │
  │  └─ cognitive-debt state                                            │
  │                                                                     │
  │  Only this device can COMMIT / replay / execute / Undo.             │
  └─────────────────────────────────────────────────────────────────────┘
```

## Consumer bootstrap

Once the production download hostname is configured and the exact release has passed qualification, Windows users should install from the controlled domain root:

```powershell
irm https://downloads.<cieav-domain>/install.ps1 | iex
```

macOS/Linux:

```bash
curl -fsSL https://downloads.<cieav-domain>/install.sh | sh
```

These are URL-shape examples only until the real hostname, TLS, CDN objects, signing identities, and production publish gate are configured.

### Root bootstrap trust

The outer one-line fetch is initially rooted in the security of the configured CIEAV HTTPS domain. A malicious party that can completely replace the root installer can also replace trust material embedded in that installer. Therefore the root installer must be treated as a high-value production asset: direct/no-redirect serving, tightly scoped deployment credentials, protected DNS/CDN/origin administration, immutable history, monitoring, and controlled promotion are required.

After the root installer starts, CIEAV adds independent artifact checks instead of relying on transport security alone.

## Download-origin contract

`CIEAV_DOWNLOAD_BASE_URL` is a clean HTTPS origin such as:

```text
https://downloads.<cieav-domain>
```

It must not contain credentials, a path prefix, query string, fragment, or HTTP scheme. Bootstrap downloads do not follow HTTP redirects. Runtime metadata contains relative artifact paths only; absolute URLs, traversal, query/fragment data, and channel escape are rejected.

## Release trust roots

A production publish requires separate trust material for each role:

```text
Windows publisher
  CIEAV_WINDOWS_CODE_SIGN_PFX_B64           secret
  CIEAV_WINDOWS_CODE_SIGN_PFX_PASSWORD      secret
  CIEAV_WINDOWS_CODE_SIGN_THUMBPRINT        variable / pinned identity
  CIEAV_WINDOWS_TIMESTAMP_URL               variable

macOS publisher
  CIEAV_MACOS_DEVELOPER_ID_P12_B64          secret
  CIEAV_MACOS_DEVELOPER_ID_P12_PASSWORD     secret
  CIEAV_MACOS_SIGNING_IDENTITY              variable / pinned identity
  CIEAV_APPLE_NOTARY_KEY_B64                secret
  CIEAV_APPLE_NOTARY_KEY_ID                 variable
  CIEAV_APPLE_NOTARY_ISSUER                 variable

Release metadata
  CIEAV_RELEASE_SIGNING_PRIVATE_KEY_B64      secret
  CIEAV_RELEASE_SIGNING_PUBLIC_KEY_B64       variable
  CIEAV_RELEASE_SIGNING_KEY_ID               independently checked key ID
```

Private signing material must never be committed to the repository or included in release artifacts.

## Required public object layout

For a `stable` channel, the expected layout is:

```text
/
├── install.ps1
├── install.sh
└── stable/
    ├── manifest.json
    ├── release-public-key.pem
    ├── bootstrap-windows-x64.txt
    ├── bootstrap-macos-arm64.txt
    ├── bootstrap-linux-x64.txt
    ├── signatures/
    │   ├── manifest.json.sig.json
    │   └── bootstrap-*.txt.sig.json
    ├── cieav-runtime-<version>-windows-x64.zip
    ├── cieav-runtime-<version>-macos-arm64.zip
    └── cieav-runtime-<version>-linux-x64.zip
```

Only targets actually built and clean-machine qualified should be published.

## Supply-chain verification

The production pipeline now has multiple independent checks:

```text
Windows
  exact source
  → Authenticode SHA-256 signing + RFC-3161 timestamp
  → SignTool verification
  → configured signer-thumbprint verification
  → ZIP SHA-256 metadata
  → installer re-verifies staged executable Authenticode status + pinned thumbprint

macOS
  exact source
  → Developer ID hardened-runtime signing
  → codesign verification + configured signing identity
  → Apple notarization acceptance
  → ZIP SHA-256 metadata
  → installer re-verifies staged executable + pinned Developer ID authority

all platforms
  manifest/bootstrap generation
  → offline Ed25519 metadata signing
  → immediate signature verification
  → configured release-key-ID verification
  → HTTPS same-origin/no-redirect publication
```

Linux currently has no native CIEAV publisher-certificate check equivalent to Authenticode/Developer ID in the shell bootstrap. Its runtime is still protected by same-origin HTTPS, SHA-256, and independently signed publication metadata. A future native DEB/RPM channel should additionally use distro/package signing. Do not represent Linux bootstrap publisher identity as equivalent to Windows/macOS until a portable installer-side trust-root verifier is enforced.

## Installer safety boundary

The bootstrap performs the following before installing the per-user service:

```text
controlled HTTPS origin
→ no redirect escape
→ platform metadata / manifest validation
→ CIEAV brand/version/path validation
→ SHA-256 artifact verification
→ staged extraction
→ Windows/macOS publisher verification where applicable
→ transactional replacement
→ runtime doctor
→ CIEAV Cloud enrollment
→ CRITICAL-payment safety probe
→ per-user Gateway installation
```

Publisher verification occurs on the staged executable before it replaces the existing runtime. Any later failure triggers rollback to the previous installation.

## Publication ordering

A stable release should be promoted so metadata never references missing or unqualified artifacts:

1. Build the exact source commit on every target OS.
2. Sign Windows/macOS executables and verify their configured publisher identities.
3. Notarize the macOS runtime.
4. Run local release verification plus clean install/upgrade/rollback/service/reboot tests.
5. Collect qualification evidence for the same version and commit and run `npm run release:qualify`.
6. Generate manifest/bootstrap metadata.
7. Sign and verify metadata with the offline Ed25519 release key and verify the configured key ID.
8. Upload immutable/versioned runtime ZIPs first.
9. Upload matching manifest/bootstrap/public-key/signature objects only after all referenced runtimes exist.
10. Render root installers with the production Windows thumbprint and macOS signing identity pins.
11. Publish root `install.ps1` / `install.sh` last.
12. Run real-domain clean-machine installation probes.

CDN invalidation must not create a new-metadata/old-runtime window. Runtime object names should be immutable; metadata promotion should be atomic or carefully ordered.

## Local control authority

All normal production starts route through:

```text
CIEAV Gateway
→ managed local API (`cieav-local-api`)
→ authenticated browser mediator
→ private browser-wide CDP pipe
→ Chromium
```

The protected browser cannot silently fall back to a development API. Chromium does not receive Gateway/API/receipt/provider/browser-control secrets. Test auto-approval is forcibly disabled in managed production.

## Per-user privacy boundary

Each OS user/install has independent state and authority, including installation identity, Gateway/API credentials, receipt identity, browser-control session, protected Chromium profile, Action Receipts, keyed lifecycle audit, and cognitive history.

OS-backed secret storage is used when available: Windows DPAPI, macOS Keychain, and Linux Secret Service. If a secure facility is unavailable, CIEAV explicitly falls back to permission-restricted local files and must report that fallback rather than claiming encryption at rest.

## Outcome and Undo boundary

`COMMITTED` means dispatch occurred; it does not mean the remote effect succeeded. Only a durable signed `OBSERVED_SUCCESS` may unlock an adapter-backed Undo capability. UNKNOWN/failure outcomes never teach CIEAV that the pattern is safe. Trusted inverse capabilities are bound to adapter version, origin/path, action type, expiry, and exact resource fingerprint.

## Pre-domain validation

Before DNS/CDN setup:

```bash
npm install
npm run release:verify
```

Then qualify the same version/commit on every shipped OS with clean-machine installer, upgrade, rollback, service/reboot, browser, privacy, and security tests:

```bash
npm run release:qualify
```

Only after the real endpoints exist, production signing variables/secrets are configured, the repository has the final CIEAV identity, and cross-platform evidence passes should the publish gate be used:

```bash
npm run release:verify:publish
```

A workflow definition or signed artifact is not itself evidence that the production release passed. The executed local/clean-VM qualification remains the release authority.
