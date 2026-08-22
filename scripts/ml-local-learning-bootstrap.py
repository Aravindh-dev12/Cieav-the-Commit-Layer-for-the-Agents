#!/usr/bin/env python3
"""Bootstrap/check the local CIEAV single-node learning environment.

This intentionally installs only the Windows/CPU-friendly post-training stack. Heavy
scale engines (vLLM, verl, Ray, SGLang) remain separate and are not required here.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REQUIREMENTS = ROOT / "ml" / "requirements-local.txt"
PACKAGES = ("torch", "transformers", "datasets", "trl", "peft", "accelerate", "tokenizers", "yaml")


def status() -> dict[str, bool]:
    return {name: importlib.util.find_spec(name) is not None for name in PACKAGES}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Report readiness without installing anything")
    parser.add_argument("--upgrade", action="store_true", help="Allow pip to upgrade already-installed packages")
    args = parser.parse_args()

    if sys.version_info < (3, 11):
        raise SystemExit("CIEAV local learning requires Python >=3.11")
    if not REQUIREMENTS.is_file():
        raise SystemExit(f"missing requirements file: {REQUIREMENTS}")

    before = status()
    if not args.check and not all(before.values()):
        cmd = [sys.executable, "-m", "pip", "install"]
        if args.upgrade:
            cmd.append("--upgrade")
        cmd += ["-r", str(REQUIREMENTS)]
        print("CIEAV local learning bootstrap:", " ".join(cmd))
        subprocess.run(cmd, cwd=ROOT, check=True)

    after = status()
    report = {
        "schemaVersion": 1,
        "kind": "CIEAV_LOCAL_LEARNING_ENVIRONMENT_V1",
        "authority": False,
        "python": sys.version.split()[0],
        "requirements": str(REQUIREMENTS.relative_to(ROOT)).replace("\\", "/"),
        "packages": after,
        "ready": all(after.values()),
        "heavyScaleEnginesRequired": False,
    }
    print(json.dumps(report, indent=2))
    if not report["ready"]:
        missing = ", ".join(name for name, ok in after.items() if not ok)
        raise SystemExit(f"CIEAV local learning environment NOT READY: {missing}")
    print("CIEAV local learning environment PASS")


if __name__ == "__main__":
    main()
