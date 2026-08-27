#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
FULL=0
SKIP_INSTALL=0
for arg in "$@"; do
  case "$arg" in
    --full-production) FULL=1 ;;
    --skip-install) SKIP_INSTALL=1 ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done
HEAD="$(git rev-parse HEAD)"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[[ "$BRANCH" == "tmp-consequence-algebra-build" ]] || { echo "Checkout tmp-consequence-algebra-build first; current: $BRANCH" >&2; exit 1; }
git diff --quiet || { echo "Working tree has unstaged changes; exact-head qualification requires a clean checkout." >&2; exit 1; }
git diff --cached --quiet || { echo "Working tree has staged changes; exact-head qualification requires a clean checkout." >&2; exit 1; }
NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
[[ "$NODE_MAJOR" -ge 22 ]] || { echo "Node 22+ required" >&2; exit 1; }
printf 'CIEAV Consequence Algebra qualification\nBranch: %s\nCommit: %s\nNode: %s\nOS: %s\n' "$BRANCH" "$HEAD" "$(node -v)" "$(uname -srm)"
if [[ "$SKIP_INSTALL" -eq 0 ]]; then npm ci --ignore-scripts; fi
node scripts/qualify-consequence-algebra.mjs
node -e 'const fs=require("fs"),cp=require("child_process");const r=JSON.parse(fs.readFileSync("release/reports/latest-consequence-algebra-qualification.json","utf8"));const h=cp.execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim();if(r.verdict!=="PASS"||r.commit!==h||r.platform.os!==process.platform)process.exit(1);console.log(`PASS exact-head ${process.platform} qualification: release/reports/latest-consequence-algebra-qualification.json`)'
if [[ "$FULL" -eq 1 ]]; then node scripts/qualify-production-with-consequence-algebra.mjs; fi
