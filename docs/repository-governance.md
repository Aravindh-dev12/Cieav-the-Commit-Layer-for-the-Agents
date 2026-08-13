# CIEAV repository governance

Final production qualification treats repository administration as part of the trust chain. Application and release artifacts can pass locally, but `PRODUCTION QUALIFICATION: PASS` is intentionally impossible until the final CIEAV repository itself is configured safely.

## Required final repository state

Before running `npm run release:qualify:production`:

1. Rename or move the repository so its GitHub repository name contains `CIEAV`.
2. Merge the release candidate onto the repository's protected **default branch**. Final qualification requires that default branch to point to the exact commit being released.
3. Protect the default branch with all of the following:
   - strict/up-to-date required status checks;
   - at least one required status check (default expected context: `test`);
   - at least one approving pull-request review;
   - dismiss stale approvals after protected code changes;
   - require conversation resolution;
   - apply protections to administrators;
   - disable force pushes;
   - disable branch deletion.
4. Ensure GitHub CLI is authenticated with read access to repository and branch-protection metadata.

If your protected check context is not `test`, provide the exact comma-separated contexts:

```bash
export CIEAV_REQUIRED_STATUS_CHECKS="build,test"
```

If the current checkout's `origin` is not the final repository, explicitly identify it:

```bash
export CIEAV_GITHUB_REPOSITORY="owner/CIEAV"
```

## Verify governance independently

From the clean final default-branch checkout:

```bash
npm run release:qualify:governance
```

Expected output includes:

```text
CIEAV repository governance PASS
```

The command writes digest-protected evidence to `release/reports/latest-repository-governance.json`. Do not edit or copy evidence from another commit/version.

## Final production gate

`npm run release:qualify:production` executes the repository-governance check itself and binds that evidence to the exact same Git commit and package version as:

```text
publish candidate qualification
+ signed publish layout
+ live installer success/rollback evidence
+ repository governance evidence
```

Therefore a feature branch, an unprotected branch, an old protected commit, or a differently named legacy repository cannot produce the final PASS.

Repository renaming/protection remain intentional GitHub administrative actions; do not weaken the verifier to work around missing permissions or unavailable hosted CI.
