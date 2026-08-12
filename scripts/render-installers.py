#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

PLACEHOLDER = "__CIEAV_DOWNLOAD_BASE_URL__"


def render(src: Path, dst: Path, base_url: str) -> None:
    text = src.read_text("utf-8")
    if PLACEHOLDER not in text:
        raise SystemExit(f"installer placeholder missing from {src}")
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(text.replace(PLACEHOLDER, base_url), "utf-8")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--download-base-url", required=True)
    ap.add_argument("--output-dir", default="publish")
    args = ap.parse_args()
    base = args.download_base_url.rstrip("/")
    if not base.startswith("https://"):
        raise SystemExit("download base URL must use HTTPS")
    out = Path(args.output_dir)
    render(Path("distribution/install.ps1"), out / "install.ps1", base)
    render(Path("distribution/install.sh"), out / "install.sh", base)
    print(out / "install.ps1")
    print(out / "install.sh")


if __name__ == "__main__":
    main()
