#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ALLOWED_CUBLAS = {":4096:8", ":16:8"}


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def git_head() -> str:
    return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()


def tensor_digest(tensor) -> str:
    torch = __import__("torch")
    raw = bytes(tensor.detach().contiguous().cpu().view(torch.uint8).reshape(-1).tolist())
    return hashlib.sha256(raw).hexdigest()


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--environment-manifest", required=True)
    p.add_argument("--output", default="release/reports/ml/gpu-determinism-probe.json")
    p.add_argument("--seed", type=int, default=1729)
    a = p.parse_args()
    env_path = Path(a.environment_manifest).resolve()
    manifest = json.loads(env_path.read_text(encoding="utf-8"))
    if manifest.get("architecture") != "CIEAV_ML_ENVIRONMENT_QUALIFICATION_V1" or manifest.get("qualification") != "QUALIFIED" or manifest.get("authority") is not False:
        raise SystemExit("environment manifest is not a qualified CIEAV ML environment")
    if manifest.get("gitHead") != git_head() or manifest.get("requireCuda") is not True:
        raise SystemExit("environment manifest is not bound to current head with CUDA required")
    cublas = os.environ.get("CUBLAS_WORKSPACE_CONFIG", "").strip()
    if cublas not in ALLOWED_CUBLAS or manifest.get("torch", {}).get("cublasWorkspaceConfig") != cublas:
        raise SystemExit("deterministic CUBLAS_WORKSPACE_CONFIG mismatch")
    import torch
    import torch.nn.functional as F
    if not torch.cuda.is_available() or torch.cuda.device_count() < 1:
        raise SystemExit("CUDA device unavailable")
    torch.manual_seed(a.seed)
    torch.cuda.manual_seed_all(a.seed)
    torch.use_deterministic_algorithms(True, warn_only=False)
    torch.backends.cudnn.benchmark = False
    device = torch.device("cuda:0")
    left = torch.arange(0, 64 * 64, dtype=torch.float32, device=device).reshape(64, 64) / 1024.0
    right = torch.arange(64 * 64, 0, -1, dtype=torch.float32, device=device).reshape(64, 64) / 2048.0
    image = torch.arange(0, 2 * 3 * 32 * 32, dtype=torch.float32, device=device).reshape(2, 3, 32, 32) / 4096.0
    kernel = torch.arange(0, 8 * 3 * 3 * 3, dtype=torch.float32, device=device).reshape(8, 3, 3, 3) / 512.0
    def run_once():
        mm = torch.mm(left, right)
        conv = F.conv2d(image, kernel, padding=1)
        torch.cuda.synchronize(device)
        return tensor_digest(mm), tensor_digest(conv)
    first = run_once(); second = run_once()
    if first != second:
        raise SystemExit("CUDA deterministic probe produced byte-different outputs")
    props = torch.cuda.get_device_properties(0)
    report = {
        "schemaVersion": 1,
        "architecture": "CIEAV_ML_GPU_DETERMINISM_PROBE_V1",
        "authority": False,
        "qualification": "QUALIFIED",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "gitHead": git_head(),
        "environmentManifest": {"path": str(env_path), "sha256": sha256_file(env_path)},
        "seed": a.seed,
        "cublasWorkspaceConfig": cublas,
        "deterministicAlgorithms": bool(torch.are_deterministic_algorithms_enabled()),
        "cudnnBenchmark": bool(torch.backends.cudnn.benchmark),
        "device": {
            "index": 0,
            "name": torch.cuda.get_device_name(0),
            "totalMemory": int(props.total_memory),
            "capability": list(torch.cuda.get_device_capability(0)),
        },
        "torchVersion": str(torch.__version__),
        "cudaRuntime": getattr(torch.version, "cuda", None),
        "cudnnVersion": torch.backends.cudnn.version(),
        "probes": {
            "torch.mm": first[0],
            "torch.nn.functional.conv2d": first[1],
        },
        "reproducibilityScope": "exact-qualified-software-and-hardware-environment",
    }
    out = Path(a.output).resolve(); out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    print(f"CIEAV ML GPU determinism probe PASS - exact-byte mm+conv2d repeatability gpu={report['device']['name']} authority=false")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
