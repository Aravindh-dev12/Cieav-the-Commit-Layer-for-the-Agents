#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import re
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

BASE_PLACEHOLDER = "__CIEAV_DOWNLOAD_BASE_URL__"
CLOUD_PLACEHOLDER = "__CIEAV_CLOUD_URL__"
VERSION_PLACEHOLDER = "__CIEAV_RELEASE_VERSION__"
WINDOWS_SIGNER_PLACEHOLDER = "__CIEAV_WINDOWS_SIGNER_THUMBPRINT__"
MACOS_SIGNER_PLACEHOLDER = "__CIEAV_MACOS_SIGNING_IDENTITY__"
RELEASE_KEY_ID_PLACEHOLDER = "__CIEAV_RELEASE_KEY_ID__"
RELEASE_RSA_MODULUS_PLACEHOLDER = "__CIEAV_RELEASE_RSA_MODULUS_B64__"
RELEASE_RSA_EXPONENT_PLACEHOLDER = "__CIEAV_RELEASE_RSA_EXPONENT_B64__"
RELEASE_PUBLIC_KEY_PLACEHOLDER = "__CIEAV_RELEASE_PUBLIC_KEY_PEM_B64__"
WINDOWS_THUMBPRINT = re.compile(r"^[0-9A-Fa-f]{40,128}$")
MACOS_SIGNER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 .,:()_+@/&-]{0,239}$")
VERSION = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
HEX64 = re.compile(r"^[0-9a-f]{64}$")
B64 = re.compile(r"^[A-Za-z0-9+/]+={0,2}$")


def clean_origin(value: str, label: str = "download base URL") -> str:
    try: u = urlsplit(value.strip())
    except ValueError as exc: raise SystemExit(f"{label} is invalid") from exc
    if u.scheme != "https" or not u.hostname: raise SystemExit(f"{label} must use HTTPS")
    if u.username or u.password or u.query or u.fragment: raise SystemExit(f"{label} must not contain credentials, query, or fragment")
    if u.path not in ("", "/"): raise SystemExit(f"{label} must be a clean origin with no path")
    netloc = u.hostname if u.port in (None, 443) else f"{u.hostname}:{u.port}"
    return urlunsplit(("https", netloc, "", "", ""))


def clean_version(value: str) -> str:
    raw=value.strip()
    if not VERSION.fullmatch(raw): raise SystemExit("release version is invalid")
    return raw


def clean_windows_signer(value: str) -> str:
    raw=value.replace(" ","").strip().upper()
    if not WINDOWS_THUMBPRINT.fullmatch(raw): raise SystemExit("Windows signer thumbprint must be 40-128 hexadecimal characters")
    return raw


def clean_macos_signer(value: str) -> str:
    raw=value.strip()
    if not MACOS_SIGNER.fullmatch(raw): raise SystemExit("macOS signing identity contains unsupported characters")
    return raw


def clean_key_id(value:str)->str:
    raw=value.strip().lower()
    if not HEX64.fullmatch(raw): raise SystemExit("release signing key ID must be a lowercase SHA-256 hex digest")
    return raw


def clean_b64(value:str,label:str,*,min_bytes:int,max_bytes:int)->str:
    raw=value.strip()
    if not raw or len(raw)>16384 or not B64.fullmatch(raw): raise SystemExit(f"{label} must be canonical base64")
    try: decoded=base64.b64decode(raw,validate=True)
    except Exception as exc: raise SystemExit(f"{label} is invalid base64") from exc
    if not min_bytes<=len(decoded)<=max_bytes: raise SystemExit(f"{label} has invalid length")
    if base64.b64encode(decoded).decode("ascii")!=raw: raise SystemExit(f"{label} must use canonical base64 encoding")
    return raw


def clean_public_key(value:str)->str:
    raw=clean_b64(value,"release public key",min_bytes=400,max_bytes=4096)
    decoded=base64.b64decode(raw).decode("ascii","strict")
    if not decoded.startswith("-----BEGIN PUBLIC KEY-----\n") or "\n-----END PUBLIC KEY-----" not in decoded: raise SystemExit("release public key must be SPKI PEM")
    if any(ord(c)<9 or (13<ord(c)<32) for c in decoded): raise SystemExit("release public key contains control characters")
    return raw


def render(src: Path, dst: Path, replacements: dict[str, str]) -> None:
    text=src.read_text("utf-8")
    for placeholder,value in replacements.items():
        if placeholder not in text: raise SystemExit(f"installer placeholder {placeholder} missing from {src}")
        # The first occurrence is the rendered binding. Later exact occurrences
        # are fail-closed sentinel literals used by the installer to detect an
        # unrendered template. Replacing every occurrence makes a correctly
        # rendered value compare equal to its own sentinel and reject itself.
        text=text.replace(placeholder,value,1)
    dst.parent.mkdir(parents=True,exist_ok=True);dst.write_text(text,"utf-8")


def main()->None:
    ap=argparse.ArgumentParser()
    ap.add_argument("--download-base-url",required=True);ap.add_argument("--cloud-url",required=True);ap.add_argument("--release-version",required=True)
    ap.add_argument("--windows-signer-thumbprint",required=True);ap.add_argument("--macos-signing-identity",required=True)
    ap.add_argument("--release-key-id",required=True);ap.add_argument("--release-rsa-modulus-b64",required=True);ap.add_argument("--release-rsa-exponent-b64",required=True);ap.add_argument("--release-public-key-pem-b64",required=True)
    ap.add_argument("--output-dir",default="publish");args=ap.parse_args()
    replacements={
        BASE_PLACEHOLDER:clean_origin(args.download_base_url),CLOUD_PLACEHOLDER:clean_origin(args.cloud_url,"cloud URL"),VERSION_PLACEHOLDER:clean_version(args.release_version),
        WINDOWS_SIGNER_PLACEHOLDER:clean_windows_signer(args.windows_signer_thumbprint),MACOS_SIGNER_PLACEHOLDER:clean_macos_signer(args.macos_signing_identity),
        RELEASE_KEY_ID_PLACEHOLDER:clean_key_id(args.release_key_id),RELEASE_RSA_MODULUS_PLACEHOLDER:clean_b64(args.release_rsa_modulus_b64,"RSA modulus",min_bytes=384,max_bytes=384),
        RELEASE_RSA_EXPONENT_PLACEHOLDER:clean_b64(args.release_rsa_exponent_b64,"RSA exponent",min_bytes=3,max_bytes=8),RELEASE_PUBLIC_KEY_PLACEHOLDER:clean_public_key(args.release_public_key_pem_b64),
    }
    out=Path(args.output_dir);render(Path("distribution/install.ps1"),out/"install.ps1",replacements);render(Path("distribution/install.sh"),out/"install.sh",replacements)
    print(out/"install.ps1");print(out/"install.sh")

if __name__=="__main__":main()
