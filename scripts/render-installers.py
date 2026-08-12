#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

BASE_PLACEHOLDER = "__CIEAV_DOWNLOAD_BASE_URL__"
CLOUD_PLACEHOLDER = "__CIEAV_CLOUD_URL__"
VERSION_PLACEHOLDER = "__CIEAV_RELEASE_VERSION__"
WINDOWS_SIGNER_PLACEHOLDER = "__CIEAV_WINDOWS_SIGNER_THUMBPRINT__"
MACOS_SIGNER_PLACEHOLDER = "__CIEAV_MACOS_SIGNING_IDENTITY__"
WINDOWS_THUMBPRINT = re.compile(r"^[0-9A-Fa-f]{40,128}$")
MACOS_SIGNER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 .,:()_+@/&-]{0,239}$")
VERSION = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")


def clean_origin(value: str, label: str = "download base URL") -> str:
    try:
        u = urlsplit(value.strip())
    except ValueError as exc:
        raise SystemExit(f"{label} is invalid") from exc
    if u.scheme != "https" or not u.hostname:
        raise SystemExit(f"{label} must use HTTPS")
    if u.username or u.password or u.query or u.fragment:
        raise SystemExit(f"{label} must not contain credentials, query, or fragment")
    if u.path not in ("", "/"):
        raise SystemExit(f"{label} must be a clean origin with no path")
    netloc = u.hostname if u.port in (None, 443) else f"{u.hostname}:{u.port}"
    return urlunsplit(("https", netloc, "", "", ""))


def clean_version(value: str) -> str:
    raw=value.strip()
    if not VERSION.fullmatch(raw): raise SystemExit("release version is invalid")
    return raw


def clean_windows_signer(value: str) -> str:
    raw = value.replace(" ", "").strip().upper()
    if not WINDOWS_THUMBPRINT.fullmatch(raw):
        raise SystemExit("Windows signer thumbprint must be 40-128 hexadecimal characters")
    return raw


def clean_macos_signer(value: str) -> str:
    raw = value.strip()
    if not MACOS_SIGNER.fullmatch(raw):
        raise SystemExit("macOS signing identity contains unsupported characters")
    return raw


def render(src: Path, dst: Path, replacements: dict[str, str]) -> None:
    text = src.read_text("utf-8")
    for placeholder, value in replacements.items():
        if placeholder not in text:
            raise SystemExit(f"installer placeholder {placeholder} missing from {src}")
        text = text.replace(placeholder, value)
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(text, "utf-8")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--download-base-url", required=True)
    ap.add_argument("--cloud-url", required=True)
    ap.add_argument("--release-version", required=True)
    ap.add_argument("--windows-signer-thumbprint", required=True)
    ap.add_argument("--macos-signing-identity", required=True)
    ap.add_argument("--output-dir", default="publish")
    args = ap.parse_args()
    replacements = {
        BASE_PLACEHOLDER: clean_origin(args.download_base_url),
        CLOUD_PLACEHOLDER: clean_origin(args.cloud_url,"cloud URL"),
        VERSION_PLACEHOLDER: clean_version(args.release_version),
        WINDOWS_SIGNER_PLACEHOLDER: clean_windows_signer(args.windows_signer_thumbprint),
        MACOS_SIGNER_PLACEHOLDER: clean_macos_signer(args.macos_signing_identity),
    }
    out = Path(args.output_dir)
    render(Path("distribution/install.ps1"), out / "install.ps1", replacements)
    render(Path("distribution/install.sh"), out / "install.sh", replacements)
    print(out / "install.ps1")
    print(out / "install.sh")


if __name__ == "__main__": main()
