#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

PLACEHOLDER = "__CIEAV_DOWNLOAD_BASE_URL__"


def clean_origin(value: str) -> str:
    try:
        u = urlsplit(value.strip())
    except ValueError as exc:
        raise SystemExit("download base URL is invalid") from exc
    if u.scheme != "https" or not u.hostname:
        raise SystemExit("download base URL must use HTTPS")
    if u.username or u.password or u.query or u.fragment:
        raise SystemExit("download base URL must not contain credentials, query, or fragment")
    if u.path not in ("", "/"):
        raise SystemExit("download base URL must be a clean origin with no path")
    # Preserve an explicit non-default port if one is deliberately configured.
    netloc = u.hostname if u.port in (None, 443) else f"{u.hostname}:{u.port}"
    return urlunsplit(("https", netloc, "", "", ""))


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
    base = clean_origin(args.download_base_url)
    out = Path(args.output_dir)
    render(Path("distribution/install.ps1"), out / "install.ps1", base)
    render(Path("distribution/install.sh"), out / "install.sh", base)
    print(out / "install.ps1")
    print(out / "install.sh")


if __name__ == "__main__":
    main()
