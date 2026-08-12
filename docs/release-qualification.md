# CIEAV release qualification

CIEAV has two explicit release gates:

- **Candidate qualification** proves the source, exact runtime archive and OS service lifecycle on every required target.
- **Production qualification** additionally proves the rendered, signed HTTPS installer succeeds and its transactional rollback restores a prior runtime on every required target.

All evidence must refer to the **same CIEAV version and Git commit**.

Default targets:

- `windows-x64`
- `macos-arm64`
- `linux-x64`

## Clean-machine prerequisites

Use the exact same clean commit on every machine:

```bash
git checkout feat/full-latch-platform
git pull --ff-only
git status --porcelain
node --version
python --version
```

`git status --porcelain` must be empty. Use Node 22+ and Python 3.11+. Chrome/Chromium is required for the real Gateway/service lifecycle. Use a clean test user with no existing CIEAV runtime, backup, command shim or Gateway service before mutation tests.

Install build dependencies **without creating repository state that invalidates source evidence**:

```bash
npm install --package-lock=false
npm install --no-save --package-lock=false esbuild
python -m pip install --upgrade pip
python -m pip install pyinstaller
```

Do not run `pip install -e .` before qualification evidence; the source tree is used directly and editable-install metadata can dirty the repository.

## 1. Source and platform gate

Local candidate evidence:

```bash
npm run release:verify
```

Production preflight evidence:

```bash
npm run release:verify:publish
```

The publish gate additionally requires real non-local HTTPS endpoints and a repository origin whose identity contains `CIEAV`. Do not weaken that check to accommodate the current legacy repository name; rename the repository before final publication.

A successful non-plan release gate writes both the verification report and expanded platform-boundary attestation to `release/reports/`.

## 2. Build and sign the runtime

Build the workspaces and semantic bridge:

```bash
npm run build
npx esbuild apps/api/src/server.ts --bundle --platform=node --format=esm --target=node22 --external:pg-native --outfile=apps/api/dist/server.js
pyinstaller --noconfirm --clean --onefile --name cieav --paths python python/latch_platform/__main__.py
```

### Linux

```bash
VERSION=$(python -c 'import tomllib;print(tomllib.load(open("pyproject.toml","rb"))["project"]["version"])')
NODE_EXE=$(node -p 'process.execPath')
python scripts/build-release-runtime.py --cieav-exe dist/cieav --node-exe "$NODE_EXE" --version "$VERSION" --output-dir release-out
```

### macOS

Sign `dist/cieav` with the production Developer ID identity before packaging:

```bash
codesign --force --timestamp --options runtime --sign "$CIEAV_MACOS_SIGNING_IDENTITY" dist/cieav
codesign --verify --strict --verbose=2 dist/cieav
VERSION=$(python -c 'import tomllib;print(tomllib.load(open("pyproject.toml","rb"))["project"]["version"])')
NODE_EXE=$(node -p 'process.execPath')
python scripts/build-release-runtime.py --cieav-exe dist/cieav --node-exe "$NODE_EXE" --version "$VERSION" --output-dir release-out
```

For publication, notarize the final macOS runtime archive with the production Apple notary credentials. A notarization failure is a release failure.

### Windows

Build `native/windows/cdp-win-bridge.cpp` as x64 `dist/cdp-win-bridge.exe`, then Authenticode-sign and verify **both** `dist/cieav.exe` and `dist/cdp-win-bridge.exe` with the pinned production certificate.

```powershell
$Version = python -c "import tomllib;print(tomllib.load(open('pyproject.toml','rb'))['project']['version'])"
$NodeExe = node -p "process.execPath"
python scripts/build-release-runtime.py --cieav-exe dist/cieav.exe --node-exe $NodeExe --cdp-win-bridge dist/cdp-win-bridge.exe --version $Version --output-dir release-out
```

## 3. Fresh extracted-runtime gate

Candidate mode:

```bash
npm run release:smoke:runtime
```

Publish mode:

```bash
npm run release:smoke:runtime:publish
```

This verifies the actual ZIP after extraction: archive secret hygiene, expanded boundary metadata, bundled Node and CIEAV execution, Companion/Action Lab/MCP/A2A/Gateway CLI surfaces, browser wrapper/core, API/MCP/A2A syntax, platform signatures and relocation. Evidence is digest-protected and includes the exact archive filename, SHA-256 and byte size.

## 4. Real OS service lifecycle gate

This intentionally mutates the current user's systemd/launchd/Task Scheduler state and therefore requires explicit acknowledgement.

Candidate mode:

```bash
npm run release:smoke:service
```

Publish mode:

```bash
npm run release:smoke:service:publish
```

The test refuses an existing CIEAV service. It uses the exact candidate ZIP and requires:

```text
clean pre-state → install → live Gateway/status → stop → start → restart → uninstall → cleanup
```

Its evidence is bound to the same archive filename, SHA-256 and byte size used by the runtime smoke.

Verify the current machine independently:

```bash
npm run release:qualify:current
```

## 5. Cross-platform candidate qualification

Copy the generated JSON evidence from all required machines into one `release/reports/` directory without editing or renaming it, then run:

```bash
npm run release:qualify
```

Expected result:

```text
CROSS-PLATFORM QUALIFICATION: PASS
```

This gate rejects dirty/unknown sources, mismatched commits or versions, missing platform attestations, missing runtime/service evidence, tampered digests, missing Windows/macOS signature checks, incomplete service lifecycle evidence, and runtime/service evidence from different ZIP bytes.

## 6. Render and deploy the signed HTTPS installer distribution

After candidate qualification passes, generate the production/staging CDN layout with the real HTTPS download origin, Cloud origin, pinned Windows/macOS publisher identities and offline release signing trust root. The release workflow performs the same metadata generation/signing sequence and stages tag assets in a **draft** release only.

The installer must be served from a real HTTPS origin because both `install.sh` and `install.ps1` deliberately reject insecure/local distribution URLs and verify signed release metadata, checksums and platform publisher identity.

## 7. Live installer success gate

On each clean target machine, with the rendered `publish/install.sh` or `publish/install.ps1` available locally and its pinned HTTPS distribution reachable:

```bash
npm run release:smoke:installer:success
```

The harness refuses existing CIEAV install paths, backups, command shims or services. It runs the real installer, verifies the installed runtime/version/boundary metadata and executable, and cleans the test installation afterward.

## 8. Live transactional rollback gate

Run on each target:

```bash
npm run release:smoke:installer:rollback
```

For this scenario, keep the signed release download/metadata reachable but deliberately make the **installer-pinned Cloud endpoint unavailable only after release download/verification**. This causes the real installer to fail after runtime replacement during doctor/enrollment/probe. The harness only passes if the installer reaches its rollback path, prints that it is restoring the previous runtime, restores the exact seeded prior-runtime marker, consumes the `.previous` backup and removes the candidate runtime.

No hidden installer test bypass is used.

Aggregate all success and rollback evidence:

```bash
npm run release:qualify:installers
```

Expected result:

```text
LIVE INSTALLER QUALIFICATION: PASS
```

## 9. Final production qualification

With candidate and live-installer evidence from all required targets in `release/reports/`:

```bash
npm run release:qualify:production
```

Expected result:

```text
PRODUCTION QUALIFICATION: PASS
```

The final combiner requires candidate qualification and live installer qualification to agree with each other **and with the current HEAD and package version**.

Only after this PASS should a staged draft release be made public.

## 10. Repository administration still required

Application code deliberately cannot satisfy these administrative gates itself:

- rename the repository/origin to CIEAV before `release:verify:publish`,
- restore GitHub Actions billing/runner execution,
- configure branch/repository rules to require PRs and the qualifying checks,
- disable force pushes and branch deletion on protected release branches,
- keep release/tag publication restricted to the qualified release process.

Do not weaken application or publication gates because CI, signing credentials, CDN deployment, notarization or repository administration is temporarily unavailable.
