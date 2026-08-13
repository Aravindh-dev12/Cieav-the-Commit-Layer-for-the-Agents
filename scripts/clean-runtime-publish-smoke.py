#!/usr/bin/env python3
from __future__ import annotations

import os
import platform
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def fail(message: str) -> None:
    raise SystemExit(message)


def main() -> None:
    forwarded = sys.argv[1:]
    if "--mode" in forwarded:
        fail("clean-runtime-publish-smoke owns --mode=publish; do not pass --mode")

    system = platform.system()
    extra: list[str] = []
    if system == "Windows":
        raw = os.environ.get("CIEAV_WINDOWS_CODE_SIGN_THUMBPRINT", "")
        thumbprint = re.sub(r"\s+", "", raw).upper()
        if not re.fullmatch(r"[0-9A-F]{40,64}", thumbprint):
            fail("Publish runtime qualification on Windows requires CIEAV_WINDOWS_CODE_SIGN_THUMBPRINT with the pinned production signer thumbprint")
        extra += ["--windows-signer-thumbprint", thumbprint]
    elif system == "Darwin":
        identity = os.environ.get("CIEAV_MACOS_SIGNING_IDENTITY", "").strip()
        if not identity or "\n" in identity or "\r" in identity:
            fail("Publish runtime qualification on macOS requires CIEAV_MACOS_SIGNING_IDENTITY with the pinned Developer ID identity")
        extra += ["--macos-signing-identity", identity]
    elif system != "Linux":
        fail(f"Unsupported release platform: {system}")

    cmd = [sys.executable, str(ROOT / "scripts" / "clean-runtime-smoke.py"), "--mode", "publish", *extra, *forwarded]
    proc = subprocess.run(cmd, cwd=ROOT)
    raise SystemExit(proc.returncode)


if __name__ == "__main__":
    main()
