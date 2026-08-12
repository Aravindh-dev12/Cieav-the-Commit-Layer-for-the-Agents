#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import platform
import shutil
import stat
import tempfile
import zipfile
from pathlib import Path


def platform_key() -> str:
    system = platform.system().lower()
    system = {"darwin": "macos", "windows": "windows", "linux": "linux"}.get(system, system)
    machine = platform.machine().lower()
    arch = "arm64" if machine in {"arm64", "aarch64"} else "x64" if machine in {"x86_64", "amd64"} else machine
    if system not in {"windows", "macos", "linux"} or arch not in {"x64", "arm64"}:
        raise SystemExit(f"Unsupported release platform: {system}-{arch}")
    return f"{system}-{arch}"


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def copy_tree(src: Path, dst: Path) -> None:
    if dst.exists(): shutil.rmtree(dst)
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns("node_modules", "*.log", ".DS_Store"))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cieav-exe", "--latch-exe", dest="cieav_exe", required=True)
    ap.add_argument("--node-exe", required=True)
    ap.add_argument("--output-dir", default="release-out")
    ap.add_argument("--version", required=True)
    args = ap.parse_args()

    root = Path.cwd().resolve()
    cieav_exe = Path(args.cieav_exe).resolve()
    node_exe = Path(args.node_exe).resolve()
    out = Path(args.output_dir).resolve(); out.mkdir(parents=True, exist_ok=True)
    key = platform_key()

    if not cieav_exe.exists(): raise SystemExit(f"Missing CIEAV executable: {cieav_exe}")
    if not node_exe.exists(): raise SystemExit(f"Missing Node executable: {node_exe}")
    if not (root / "apps/api/dist/server.js").exists(): raise SystemExit("Missing bundled apps/api/dist/server.js")

    with tempfile.TemporaryDirectory() as td:
        stage = Path(td) / "cieav-runtime"
        (stage / "bin").mkdir(parents=True); (stage / "runtime").mkdir(parents=True); (stage / "apps/api/dist").mkdir(parents=True)
        exe_name = "cieav.exe" if key.startswith("windows-") else "cieav"
        node_name = "node.exe" if key.startswith("windows-") else "node"
        shutil.copy2(cieav_exe, stage / "bin" / exe_name)
        shutil.copy2(node_exe, stage / "runtime" / node_name)
        if not key.startswith("windows-"):
            for p in (stage / "bin" / exe_name, stage / "runtime" / node_name): p.chmod(p.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

        copy_tree(root / "apps/browser", stage / "apps/browser")
        shutil.copy2(root / "apps/api/dist/server.js", stage / "apps/api/dist/server.js")
        for name in ("package.json", "PRIVACY.md", "SECURITY.md", "README.md"):
            src = root / name
            if src.exists(): shutil.copy2(src, stage / name)

        runtime_meta = {"brand":"CIEAV","version":args.version,"platform":key,"cloudInferenceDefault":True,"durableUserState":"local","bundleFormat":2,"legacyBrand":"LATCH"}
        (stage / "runtime.json").write_text(json.dumps(runtime_meta, indent=2) + "\n", "utf-8")

        archive = out / f"cieav-runtime-{args.version}-{key}.zip"
        with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
            for path in sorted(stage.rglob("*")):
                if path.is_dir(): continue
                arc = Path("cieav-runtime") / path.relative_to(stage)
                info = zipfile.ZipInfo.from_file(path, arc.as_posix()); info.date_time=(2026,1,1,0,0,0)
                with path.open("rb") as f: zf.writestr(info, f.read(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)

    metadata={"brand":"CIEAV","platform":key,"filename":archive.name,"sha256":sha256(archive),"size":archive.stat().st_size,"version":args.version}
    (out / f"metadata-{key}.json").write_text(json.dumps(metadata, indent=2) + "\n", "utf-8")
    print(json.dumps(metadata))


if __name__ == "__main__": main()
