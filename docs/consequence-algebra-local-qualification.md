# CIEAV Consequence Algebra — Exact-Head Local Qualification

This runbook qualifies the **implemented Consequence Algebra runtime**, not only its contracts or architecture. A PASS receipt applies only to the exact Git commit and OS recorded in the receipt.

## Preconditions

- Clone the CIEAV repository normally.
- Git must be available on `PATH`.
- Node.js 22 or newer and npm must be available on `PATH`.
- Use a clean checkout of `tmp-consequence-algebra-build`.
- Do not copy old qualification receipts between commits or operating systems.

## Windows

```powershell
git fetch origin
git checkout tmp-consequence-algebra-build
git pull --ff-only origin tmp-consequence-algebra-build
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/local-live-consequence-algebra-qualification.ps1
```

To run the Consequence Algebra qualification **and** the complete existing CIEAV production qualification chain:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/local-live-consequence-algebra-qualification.ps1 -FullProduction
```

The launcher refuses a dirty working tree, verifies Node 22+, installs the lockfile with `npm ci --ignore-scripts`, executes the exact-head qualification runner, then verifies that the generated receipt is `PASS`, names the current commit and records `win32`.

## macOS

```bash
git fetch origin
git checkout tmp-consequence-algebra-build
git pull --ff-only origin tmp-consequence-algebra-build
bash scripts/local-live-consequence-algebra-qualification.sh
```

Full CIEAV production + Algebra qualification:

```bash
bash scripts/local-live-consequence-algebra-qualification.sh --full-production
```

## Linux

Use the same shell launcher:

```bash
git fetch origin
git checkout tmp-consequence-algebra-build
git pull --ff-only origin tmp-consequence-algebra-build
bash scripts/local-live-consequence-algebra-qualification.sh
```

Full CIEAV production + Algebra qualification:

```bash
bash scripts/local-live-consequence-algebra-qualification.sh --full-production
```

## What the Algebra qualification executes

`node scripts/qualify-consequence-algebra.mjs` executes, on the current machine and exact checkout:

1. Consequence Algebra static constitutional/boundary gate.
2. Contracts, core and API builds.
3. Contracts, core and API TypeScript typechecks.
4. Consequence Algebra semantic unit tests.
5. Authenticated persistent-store, restart, tamper, UNKNOWN reconciliation, proofability and causal-fence tests.
6. Operational tool-facade tests.
7. Real Agent Kernel / Execution Fabric integration tests proving Algebra admission is mandatory before the existing ticket path.
8. Generation of an OS- and commit-bound SHA-256 qualification receipt.

The qualification specifically covers route-independent semantic identity, cross-route duplicate reconciliation, deterministic trusted relation rules, declared invariant rules, authenticated durable Active Consequence Graph state, hash-linked Algebra audit, consequence reservations, cumulative anti-fragmentation, proofability admission/recheck, causal fences, trusted route `DISPATCHED` lifecycle, proof-only settlement, UNKNOWN quarantine, explicit evidence-bound reconciliation, startup recovery and the zero-authority invariant.

## Evidence files

A subsystem qualification run writes:

- `release/reports/latest-consequence-algebra-qualification.json`
- `release/reports/latest-consequence-algebra-qualification.txt`

A full production run additionally writes:

- the normal CIEAV production qualification evidence; and
- `release/reports/latest-production-with-consequence-algebra.json`
- `release/reports/latest-production-with-consequence-algebra.txt`

Do not treat a receipt as valid for another commit or OS. The JSON receipt includes the exact Git commit, branch, OS, architecture, Node runtime, individual gate statuses and a SHA-256 digest.

## PASS interpretation

A `PASS` from the Windows launcher qualifies the exact Consequence Algebra checkout on that Windows environment. It does not itself qualify macOS or Linux. Run the corresponding launcher on each OS before claiming that OS as qualified.

The repository also contains `.github/workflows/consequence-algebra-qualification.yml`, which attempts the same exact-head qualification on `ubuntu-latest`, `windows-latest` and `macos-latest`. CI evidence should only be claimed when those jobs actually start, execute their steps and finish `PASS`.

## Failure handling

If a run fails, preserve the two `latest-consequence-algebra-qualification.*` files and the console output. Do not change the receipt to PASS manually. Fix the failing boundary/test, rerun from a clean checkout, and use only the newly generated exact-head receipt.
