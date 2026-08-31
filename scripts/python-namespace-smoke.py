#!/usr/bin/env python3
from __future__ import annotations

import json
import re

from _repo_python import bootstrap_repo_pythonpath

ROOT=bootstrap_repo_pythonpath()
package=json.loads((ROOT/"package.json").read_text("utf-8"))
pyproject=(ROOT/"pyproject.toml").read_text("utf-8")
ci=(ROOT/".github/workflows/ci.yml").read_text("utf-8")
legacy_main=(ROOT/"python"/"latch_platform"/"__main__.py").read_text("utf-8")

import cieav_platform
from cieav_platform.config import Settings as CanonicalSettings
from latch_platform.config import Settings as LegacySettings

if cieav_platform.__version__ != package["version"]:
    raise SystemExit(f"cieav_platform version {cieav_platform.__version__} != package version {package['version']}")
if CanonicalSettings is not LegacySettings:
    raise SystemExit("canonical Settings compatibility wrapper diverged from proven implementation")
for token in (
    'cieav = "cieav_platform.__main__:entrypoint"',
    'cieav-mcp = "cieav_platform.mcp_launcher:main"',
    'cieav-a2a = "cieav_platform.a2a_launcher:main"',
    'include = ["cieav_platform*", "latch_platform*"]',
):
    if token not in pyproject:
        raise SystemExit(f"pyproject canonical package invariant missing: {token}")
for module in ("__main__.py","config.py","gateway.py","cli.py","mcp_launcher.py","a2a_launcher.py","companion_cli.py","lab_cli.py","approval_cli.py","proof_cli.py"):
    if not (ROOT/"python"/"cieav_platform"/module).is_file():
        raise SystemExit(f"canonical Python module missing: cieav_platform/{module}")
if "from cieav_platform.__main__ import entrypoint" not in legacy_main:
    raise SystemExit("legacy Python entrypoint is not a one-way compatibility shim into CIEAV")
if "from cieav_platform.config import Settings" not in ci:
    raise SystemExit("CI does not exercise canonical CIEAV Python imports")
legacy_version=(ROOT/"python"/"latch_platform"/"__init__.py").read_text("utf-8")
if not re.search(r'__version__\s*=\s*"[^"]+"',legacy_version):
    raise SystemExit("legacy package version compatibility marker missing")
print("CIEAV Python namespace checks passed: canonical entrypoints/packages own the public path and legacy entry is one-way compatibility")
