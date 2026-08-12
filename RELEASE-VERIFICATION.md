# CIEAV release verification

CIEAV uses a local release gate as the authoritative pre-publish verification path. Hosted CI may mirror this gate later, but a GitHub-hosted runner is not required to determine whether a local release candidate passes the product's safety and packaging checks.

## Commands

```bash
npm run release:verify
```

Runs the local release-candidate gate. It does not require a public CIEAV domain and is intended for development machines and clean test machines.

```bash
npm run release:verify:publish
```

Runs the same technical gate plus final publication requirements. Publish mode also requires:

- a clean Git working tree;
- a real non-local HTTPS `CIEAV_CLOUD_URL`;
- a real non-local HTTPS `CIEAV_DOWNLOAD_BASE_URL`;
- a CIEAV-named origin repository;
- no production URL placeholders in public documentation.

```bash
npm run release:verify:plan
```

Prints the verification plan without executing the heavyweight test/build commands. A plan result is not release evidence and must never be treated as a passing production gate.

```bash
npm run release:qualify
```

Aggregates PASS reports from the required target operating systems. By default it requires:

```text
windows-x64
macos-arm64
linux-x64
```

Override the required shipping matrix when necessary:

```bash
node scripts/qualify-release.mjs --require windows-x64,macos-arm64,macos-x64,linux-x64
```

or set `CIEAV_RELEASE_TARGETS` to the same comma-separated format.

Qualification fails if any required platform is missing, or if the selected PASS reports do not refer to the same CIEAV version and the same Git commit.

## What the local gate verifies

The gate currently checks:

1. CIEAV product/version consistency across Node and Python packaging.
2. Presence of critical browser, API, privacy, security and installer files.
3. Explicit cloud privacy declarations excluding raw form values, raw secrets and full-page text, with no durable cloud storage request.
4. Outcome-verification and verified-Undo invariants.
5. Python syntax/package compilation.
6. JavaScript syntax on the protected execution boundary.
7. Gateway/platform smoke behavior.
8. Cloud provider privacy/enrollment contract behavior.
9. Optional local-model and semantic-router fallback contracts.
10. Release metadata and bootstrap attack tests.
11. Production workspace build and typecheck.
12. Core/API unit tests.
13. AI orchestration tests.
14. Cognitive-debt invariants.
15. Attention Health dashboard smoke tests.
16. No-install safety self-test.
17. Protected browser trusted-replay, outcome verification and verified-Undo E2E.
18. Consumer installer requirements: no Python bootstrap dependency on Unix, checksum verification, rollback and cloud safety probe.

## Evidence

Every invocation writes both JSON and text evidence under:

```text
release/reports/
```

The report contains the CIEAV version, Git commit, dirty-tree state, host OS/architecture, Node version, each verification stage, command/exit code, bounded stdout/stderr, duration and final PASS/FAIL verdict.

`release/reports/` is intentionally ignored by Git. Reports are local/private unless an operator deliberately archives or exports them.

A failed stage still produces a report. This is intentional: failure evidence is useful for diagnosis and prevents "the command stopped before the report existed" ambiguity.

`npm run release:qualify` writes:

```text
release/reports/latest-qualification.json
release/reports/latest-qualification.txt
```

Those files provide the combined target-matrix verdict and identify which per-platform report qualified each target.

## Platform qualification

A PASS on one operating system qualifies only that operating system. It does **not** mean the Windows, macOS and Linux consumer runtimes have all been tested.

Before CIEAV 1.0 publication, run the local release gate on clean supported hosts at minimum:

```text
Windows x64
macOS arm64 (and x64 if shipped)
Linux x64 (and arm64 if shipped)
```

For every shipped target, additionally test the actual packaged artifact and installer on a clean machine/VM, including:

- fresh install;
- Gateway startup after login/reboot;
- local secret/state isolation;
- CIEAV Cloud enrollment;
- CRITICAL-payment safety probe;
- protected-browser E2E;
- upgrade from the previous release;
- forced upgrade failure and rollback;
- uninstall/reinstall while preserving or intentionally deleting user state according to policy.

Only reports produced on the target OS count as target-OS qualification.

## Private-per-user verification

During multi-user tests, verify that each OS user receives distinct local state and authority. At minimum, the following must be different between users:

```text
state directory
install/device identity
Gateway bearer token
local API signing secret
receipt signing secret
browser profile
receipts
audit log
attention/cognitive history
```

No test should require these values to be uploaded to CIEAV Cloud. Cloud receives only the scoped device identity/token and the privacy-reduced semantic packet needed for interpretation.

## Publication sequence

The intended production sequence is:

```text
feature development
→ npm run release:verify on developer machine
→ fix all failures
→ clean-machine verification on every shipped OS
→ collect the local PASS reports
→ npm run release:qualify
→ package/installer install + upgrade/rollback verification
→ configure production CIEAV Cloud and download/CDN domains
→ rename remaining public repository/brand identifiers to CIEAV
→ fresh checkout/build
→ npm run release:verify:publish on each required release host
→ run release:qualify again against the final publish reports
→ publish signed/verified artifacts
```

Do not use a GitHub Actions badge or a hosted CI result as a substitute for these clean-machine release checks. Hosted CI is complementary automation, not the product's only source of release evidence.
