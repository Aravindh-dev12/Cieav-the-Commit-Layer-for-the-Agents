# Local end-to-end release qualification

This runbook produces real CIEAV production evidence without GitHub Actions. The gates are fail-closed: do not edit evidence JSON, skip signer checks, or reuse evidence from another commit/version.

## Common prerequisites

Use the exact same clean commit on Windows x64, macOS arm64, and Linux x64. Install Node 22+, Python 3.11+, Chrome/Chromium and platform build tools. Use a clean test user with no existing CIEAV runtime or Gateway service.

```bash
git checkout feat/full-latch-platform
git pull --ff-only
git status --porcelain
npm install --package-lock=false
npm install --no-save --package-lock=false esbuild
python -m pip install --upgrade pip pyinstaller
npm run test
npm run typecheck
```

`git status --porcelain` must remain empty before evidence-producing commands.

Publish-mode evidence also requires real HTTPS values and pinned identities:

```text
CIEAV_CLOUD_URL=https://...
CIEAV_DOWNLOAD_BASE_URL=https://...
CIEAV_WINDOWS_CODE_SIGN_THUMBPRINT=...
CIEAV_MACOS_SIGNING_IDENTITY=Developer ID Application: ...
```

The publish gate intentionally requires the Git remote to have CIEAV product identity. Rename the repository/origin before final publish qualification rather than weakening that check.

## 1. Build the signed runtime on each OS

```bash
npm run build
npx esbuild apps/api/src/server.ts --bundle --platform=node --format=esm --target=node22 --external:pg-native --outfile=apps/api/dist/server.js
pyinstaller --noconfirm --clean --onefile --name cieav --paths python python/latch_platform/__main__.py
```

On Windows, build `dist/cdp-win-bridge.exe`, Authenticode-sign both executables and verify them against `CIEAV_WINDOWS_CODE_SIGN_THUMBPRINT`. On macOS, Developer-ID sign `dist/cieav` and verify the identity. Assemble the runtime ZIP into `release-out/` using `scripts/build-release-runtime.py` as documented in `docs/release-qualification.md`.

## 2. Produce publish evidence on each OS

With the signed ZIP present:

```bash
npm run release:qualify:current:publish
```

This runs the publish source/platform gate, pinned-signature extracted-runtime smoke, real OS service install/start/stop/restart/uninstall lifecycle, Apple notarization on macOS, and current-target publish aggregation.

macOS additionally requires:

```text
CIEAV_APPLE_NOTARY_KEY_PATH=/secure/path/AuthKey_....p8
CIEAV_APPLE_NOTARY_KEY_ID=...
CIEAV_APPLE_NOTARY_ISSUER=...
```

Copy immutable JSON evidence from `release/reports/` plus each matching runtime ZIP and `metadata-*.json` into one clean checkout. Start with an empty `release-out/`; stale metadata is rejected.

## 3. Aggregate all publish candidates

```bash
npm run release:qualify:publish
```

Expected final line:

```text
PUBLISH CANDIDATE QUALIFICATION: PASS
```

Windows must have pinned Authenticode evidence. macOS must have pinned Developer-ID evidence and accepted Apple notarization bound to the exact ZIP. Runtime and service evidence must reference identical ZIP bytes.

## 4. Build and verify the signed publish layout

Set file-backed release signing keys:

```text
CIEAV_RELEASE_SIGNING_PRIVATE_KEY_PATH=/secure/path/release-private.pem
CIEAV_RELEASE_SIGNING_PUBLIC_KEY_PATH=/secure/path/release-public.pem
CIEAV_RELEASE_SIGNING_KEY_ID=<pinned SHA-256 SPKI key id>
CIEAV_RELEASE_CHANNEL=stable
```

On Unix/macOS, the private key must be owner-only (`chmod 600` or stricter).

```bash
npm run release:build:publish-layout -- --replace
npm run release:qualify:layout
```

The builder rejects stale runtime metadata, signs and verifies manifest/bootstrap metadata, copies only ZIPs that passed publish qualification, renders signer-pinned installers, and transactionally replaces `publish/`. The layout qualifier re-verifies signatures and exact ZIP identities.

Deploy the resulting `publish/` bytes to the configured HTTPS download origin without modifying them.

## 5. Exercise the exact live installer on every OS

On a clean test user/machine:

```bash
npm run release:smoke:installer:success
npm run release:smoke:installer:rollback
```

For rollback, keep signed download metadata/artifacts reachable but make the installer-pinned Cloud endpoint fail only after download/verification so the real post-replacement rollback path executes.

Copy installer evidence back to the central checkout and run:

```bash
npm run release:qualify:installers
```

Success and rollback must have used the exact same installer bytes on each platform.

## 6. Final production qualification

```bash
npm run release:qualify:production
```

Expected final line:

```text
PRODUCTION QUALIFICATION: PASS
```

The final gate binds:

```text
clean source + platform authority
→ exact signed runtime ZIP
→ real service lifecycle
→ Apple notarization where required
→ signed publish manifest pointing to those exact ZIP bytes
→ exact rendered installer bytes
→ live successful install + real transactional rollback
→ current Git HEAD + package version + pinned release-signing key
```

Only that PASS for the current commit/version is production release evidence. Branch/ruleset administration and the decision to make a draft release public remain separate GitHub administrative actions.
