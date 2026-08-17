#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import subprocess
import sys
import tempfile
import time
import venv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OFFICIAL_PYPI = "https://pypi.org/simple"
PYINSTALLER_VERSION = "6.21.0"
HOOKS_VERSION = "2026.6"
TOOLCHAIN = [
    f"pyinstaller=={PYINSTALLER_VERSION}",
    f"pyinstaller-hooks-contrib=={HOOKS_VERSION}",
    "altgraph==0.17.5",
    "packaging==26.3",
]
WINDOWS_TOOLCHAIN = ["pefile==2024.8.26", "pywin32-ctypes==0.2.3"]


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def venv_python(root: Path) -> Path:
    return root / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def run(cmd: list[str], *, cwd: Path = ROOT, env: dict[str, str] | None = None, timeout: int | None = None) -> None:
    print("[standalone-build]", " ".join(cmd), flush=True)
    subprocess.run(cmd, cwd=cwd, env=env, check=True, timeout=timeout)


def main() -> None:
    ap = argparse.ArgumentParser(description="Build CIEAV's standalone Python CLI in a clean, pinned release-tooling virtualenv")
    ap.add_argument("--dist-dir", type=Path, default=ROOT / "dist")
    ap.add_argument("--index-url", default=os.environ.get("CIEAV_RELEASE_PYPI_INDEX_URL", OFFICIAL_PYPI))
    ap.add_argument("--max-size-mb", type=float, default=64.0)
    ap.add_argument("--startup-timeout", type=int, default=15)
    args = ap.parse_args()

    if sys.version_info[:2] != (3, 11):
        raise SystemExit(f"CIEAV release executable requires Python 3.11; got {platform.python_version()}")
    if not args.index_url.startswith("https://"):
        raise SystemExit("Release build package index must use HTTPS")

    entry = ROOT / "python/cieav_platform/__main__.py"
    if not entry.exists():
        raise SystemExit(f"Missing CIEAV entrypoint: {entry}")

    dist = args.dist_dir.resolve()
    dist.mkdir(parents=True, exist_ok=True)
    output = dist / ("cieav.exe" if os.name == "nt" else "cieav")
    output.unlink(missing_ok=True)

    with tempfile.TemporaryDirectory(prefix="cieav-release-toolchain-") as td:
        env_root = Path(td) / "venv"
        work = Path(td) / "work"
        spec = Path(td) / "spec"
        venv.EnvBuilder(with_pip=True, clear=True).create(env_root)
        py = venv_python(env_root)
        if not py.exists():
            raise RuntimeError("Release build virtualenv did not create a Python executable")

        toolchain = [*TOOLCHAIN, *(WINDOWS_TOOLCHAIN if os.name == "nt" else [])]
        run([
            str(py), "-m", "pip", "install", "--disable-pip-version-check", "--no-cache-dir",
            "--index-url", args.index_url, *toolchain,
        ])

        env = dict(os.environ)
        env.pop("PYTHONPATH", None)
        env["PYTHONNOUSERSITE"] = "1"
        env["PYTHONHASHSEED"] = "1"
        env["PIP_DISABLE_PIP_VERSION_CHECK"] = "1"

        run([
            str(py), "-m", "PyInstaller",
            "--noconfirm", "--clean", "--onefile", "--name", "cieav",
            "--paths", str(ROOT / "python"),
            "--distpath", str(dist),
            "--workpath", str(work),
            "--specpath", str(spec),
            str(entry),
        ], env=env)

        version = subprocess.check_output(
            [str(py), "-c", "import PyInstaller; print(PyInstaller.__version__)"],
            cwd=ROOT, env=env, text=True,
        ).strip()
        if version != PYINSTALLER_VERSION:
            raise RuntimeError(f"PyInstaller version drift: expected {PYINSTALLER_VERSION}, got {version}")

    if not output.exists():
        raise RuntimeError(f"Standalone build did not produce {output}")
    size = output.stat().st_size
    if size > int(args.max_size_mb * 1024 * 1024):
        raise RuntimeError(f"Standalone executable is unexpectedly large: {size / 1024 / 1024:.2f} MiB > {args.max_size_mb:.2f} MiB")

    started = time.monotonic()
    probe = subprocess.run([str(output), "--help"], cwd=ROOT, capture_output=True, text=True, timeout=args.startup_timeout)
    elapsed = time.monotonic() - started
    if probe.returncode != 0 or "CIEAV" not in (probe.stdout + probe.stderr):
        raise RuntimeError(f"Standalone CLI smoke failed ({probe.returncode})\nstdout:\n{probe.stdout[-4000:]}\nstderr:\n{probe.stderr[-4000:]}")

    result = {
        "ok": True,
        "path": str(output),
        "sha256": sha256_file(output),
        "size": size,
        "sizeMiB": round(size / 1024 / 1024, 2),
        "startupSeconds": round(elapsed, 3),
        "python": platform.python_version(),
        "pyinstaller": PYINSTALLER_VERSION,
        "hooks": HOOKS_VERSION,
        "isolatedToolchain": True,
        "indexUrl": args.index_url,
    }
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
