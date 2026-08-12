# CIEAV release qualification

CIEAV does not treat a source build, a unit-test pass, or a signed archive by itself as production qualification. A qualifying release requires matching evidence for the **same version and Git commit** on every required target.

Default required targets:

- `windows-x64`
- `macos-arm64`
- `linux-x64`

The final gate is:

```bash
npm run release:qualify
```

It only passes when each required target has all three matching evidence records:

1. a qualifying source/release report from `npm run release:verify` (or `release:verify:publish`),
2. an expanded platform-boundary attestation emitted automatically by the release gate,
3. a clean, freshly extracted runtime archive smoke from `npm run release:smoke:runtime`.

## Prerequisites on every machine

Use the exact same clean commit on all machines.

```bash
git checkout feat/full-latch-platform
git pull --ff-only
git status --porcelain
node --version
python --version
```

`git status --porcelain` must be empty. Node 22+ and Python 3.11+ are required.

Install development/build dependencies:

```bash
npm install
python -m pip install --upgrade pip
python -m pip install -e . pyinstaller
npm install --no-save esbuild
```

## 1. Run the full source/platform gate

For a local release candidate:

```bash
npm run release:verify
```

For final production publication evidence:

```bash
npm run release:verify:publish
```

The publish gate additionally requires the real production HTTPS endpoint/repository identity conditions enforced by `scripts/release-verify.mjs`.

A successful non-plan run writes both the release verification report and a matching platform-gate attestation under `release/reports/`.

## 2. Build the production runtime artifact

Build the workspace and bundle the production semantic API:

```bash
npm run build
npx esbuild apps/api/src/server.ts --bundle --platform=node --format=esm --target=node22 --external:pg-native --outfile=apps/api/dist/server.js
```

Build the standalone CIEAV executable:

```bash
pyinstaller --noconfirm --clean --onefile --name cieav --paths python python/latch_platform/__main__.py
```

Determine the version and bundled Node path:

```bash
python -c "import tomllib; print(tomllib.load(open('pyproject.toml','rb'))['project']['version'])"
node -p "process.execPath"
```

### Linux

```bash
VERSION=$(python -c 'import tomllib;print(tomllib.load(open("pyproject.toml","rb"))["project"]["version"])')
NODE_EXE=$(node -p 'process.execPath')
python scripts/build-release-runtime.py --cieav-exe dist/cieav --node-exe "$NODE_EXE" --version "$VERSION" --output-dir release-out
```

### macOS

Before packaging, sign the standalone `dist/cieav` with the production Developer ID identity and verify it:

```bash
codesign --force --timestamp --options runtime --sign "$CIEAV_MACOS_SIGNING_IDENTITY" dist/cieav
codesign --verify --strict --verbose=2 dist/cieav
```

Then package:

```bash
VERSION=$(python -c 'import tomllib;print(tomllib.load(open("pyproject.toml","rb"))["project"]["version"])')
NODE_EXE=$(node -p 'process.execPath')
python scripts/build-release-runtime.py --cieav-exe dist/cieav --node-exe "$NODE_EXE" --version "$VERSION" --output-dir release-out
```

For publish qualification, submit the final macOS archive to Apple notarization using the same production credentials used by the release workflow. A notarization failure is a release failure.

### Windows

Build `native/windows/cdp-win-bridge.cpp` with the Visual C++ x64 toolchain to `dist/cdp-win-bridge.exe`, then Authenticode-sign **both**:

- `dist/cieav.exe`
- `dist/cdp-win-bridge.exe`

Verify the signer certificate thumbprint matches `CIEAV_WINDOWS_CODE_SIGN_THUMBPRINT`.

Package:

```powershell
$Version = python -c "import tomllib;print(tomllib.load(open('pyproject.toml','rb'))['project']['version'])"
$NodeExe = node -p "process.execPath"
python scripts/build-release-runtime.py --cieav-exe dist/cieav.exe --node-exe $NodeExe --cdp-win-bridge dist/cdp-win-bridge.exe --version $Version --output-dir release-out
```

## 3. Test the final ZIP from a clean extraction

Local candidate:

```bash
npm run release:smoke:runtime
```

Production/publish evidence:

```bash
npm run release:smoke:runtime:publish
```

You can select an archive explicitly:

```bash
python scripts/clean-runtime-smoke.py --archive release-out/<archive>.zip
```

On Windows, the smoke verifies Authenticode and optionally pins the configured thumbprint. On macOS it verifies the Developer ID code signature and optionally pins the configured signing identity. On every OS it also verifies:

- archive secret hygiene,
- runtime metadata and platform-boundary marker,
- bundled Node execution,
- standalone CIEAV CLI execution,
- Companion, Action Lab, MCP, A2A and Gateway CLI surfaces,
- browser wrapper and preserved browser core syntax,
- bundled semantic API syntax,
- packaged MCP and A2A entrypoints,
- relocation to a second fresh directory.

The smoke writes a digest-protected evidence record under `release/reports/`.

## 4. Combine evidence from all machines

Copy the generated JSON evidence files from each machine into the same `release/reports/` directory. Do not rename or edit their contents.

Then run:

```bash
npm run release:qualify
```

Expected result:

```text
CROSS-PLATFORM QUALIFICATION: PASS
```

The qualifier rejects:

- dirty or unknown source trees,
- different Git commits,
- different versions,
- legacy report schemas,
- source reports without matching expanded platform attestations,
- source reports without matching clean-runtime evidence,
- modified/tampered attestation digests,
- Windows runtime evidence without valid Authenticode checks,
- macOS runtime evidence without code-sign verification,
- missing required targets.

To qualify a different explicit set of targets:

```bash
node scripts/qualify-release.mjs --require windows-x64,macos-arm64,linux-x64
```

## 5. Production publication gates

A production release is not complete until all of these are true:

- cross-platform qualification reports `PASS`,
- Windows executables are Authenticode-signed by the pinned production certificate,
- the macOS executable is Developer ID signed and the runtime archive is notarized,
- release manifest/bootstrap metadata is signed with the configured offline release trust root,
- generated installer metadata uses real non-local HTTPS endpoints,
- installer checksum/signature/signer pinning succeeds,
- branch/repository protection requires the qualifying CI/release checks before release changes can merge.

The final item is repository administration, not application code. Configure it in GitHub repository rules/branch protection once Actions execution is available; do not weaken application gates to compensate for unavailable CI.
