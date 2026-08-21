#!/usr/bin/env python3
"""Qualify an exact CIEAV ML software/GPU environment.

PyTorch does not promise reproducibility across releases, platforms, or hardware, so
qualification binds the exact installed package set, Python/platform, CUDA/cuDNN/GPU,
seed, deterministic settings, constraints file, and git head. Floating dependencies
cannot produce a QUALIFIED manifest.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import os
import platform
import random
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Mapping

ROOT = Path(__file__).resolve().parents[1]
BASE_PACKAGES = ("torch", "transformers", "trl", "peft", "accelerate", "datasets", "pyyaml", "vllm")
SCALE_PACKAGES = ("verl", "ray", "sglang")
PIN_RE = re.compile(r"^([A-Za-z0-9_.-]+)==([^\s;]+)$")
CUBLAS_DETERMINISTIC_CONFIGS = frozenset((":4096:8", ":16:8"))


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def git_head() -> str | None:
    try:
        return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:
        return None


def normalize_name(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower()


def parse_exact_constraints(path: Path) -> dict[str, str]:
    pins: dict[str, str] = {}
    for line_no, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        match = PIN_RE.fullmatch(line)
        if not match:
            raise ValueError(f"{path}:{line_no}: qualification constraints must use exact package==version pins")
        name, version = normalize_name(match.group(1)), match.group(2)
        if name in pins:
            raise ValueError(f"{path}:{line_no}: duplicate package pin: {name}")
        pins[name] = version
    if not pins:
        raise ValueError("qualification constraints are empty")
    return pins


def validate_package_set(
    pins: dict[str, str],
    *,
    require_scale: bool,
    version_getter: Callable[[str], str] = importlib.metadata.version,
) -> dict[str, str]:
    required = BASE_PACKAGES + (SCALE_PACKAGES if require_scale else ())
    installed: dict[str, str] = {}
    for package in required:
        key = normalize_name(package)
        if key not in pins:
            raise ValueError(f"qualification constraints missing exact pin: {package}")
        try:
            actual = version_getter(package)
        except importlib.metadata.PackageNotFoundError as exc:
            raise ValueError(f"required ML package is not installed: {package}") from exc
        if actual != pins[key]:
            raise ValueError(f"installed {package}={actual} does not match qualified pin {pins[key]}")
        installed[package] = actual
    return installed


def qualify_torch(seed: int, require_cuda: bool) -> dict[str, Any]:
    try:
        import torch
    except Exception as exc:
        raise ValueError("PyTorch is required for ML environment qualification") from exc
    random.seed(seed)
    try:
        import numpy as np
        np.random.seed(seed % (2**32 - 1))
        numpy_seeded = True
    except Exception:
        numpy_seeded = False
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    torch.use_deterministic_algorithms(True, warn_only=False)
    if hasattr(torch.backends, "cudnn"):
        torch.backends.cudnn.benchmark = False
    cuda_available = bool(torch.cuda.is_available())
    if require_cuda and not cuda_available:
        raise ValueError("CUDA GPU is required for this qualification run")
    devices: list[dict[str, Any]] = []
    if cuda_available:
        for index in range(torch.cuda.device_count()):
            props = torch.cuda.get_device_properties(index)
            devices.append({
                "index": index,
                "name": torch.cuda.get_device_name(index),
                "totalMemory": int(props.total_memory),
                "capability": list(torch.cuda.get_device_capability(index)),
            })
        if require_cuda and not devices:
            raise ValueError("CUDA reported available but no GPU devices were enumerated")
    cudnn_version = torch.backends.cudnn.version() if hasattr(torch.backends, "cudnn") else None
    return {
        "torchVersion": str(torch.__version__),
        "cudaAvailable": cuda_available,
        "cudaRuntime": getattr(torch.version, "cuda", None),
        "cudnnVersion": cudnn_version,
        "devices": devices,
        "deterministicAlgorithms": bool(torch.are_deterministic_algorithms_enabled()),
        "cudnnBenchmark": bool(torch.backends.cudnn.benchmark) if hasattr(torch.backends, "cudnn") else None,
        "pythonRandomSeeded": True,
        "numpySeeded": numpy_seeded,
        "torchSeed": seed,
    }


def build_manifest(
    *,
    constraints: Path,
    seed: int,
    require_cuda: bool,
    require_scale: bool,
    torch_info: dict[str, Any] | None = None,
    version_getter: Callable[[str], str] = importlib.metadata.version,
    created_at: str | None = None,
    environment: Mapping[str, str] | None = None,
) -> dict[str, Any]:
    if seed < 0:
        raise ValueError("qualification seed must be non-negative")
    constraints = constraints.resolve()
    pins = parse_exact_constraints(constraints)
    installed = validate_package_set(pins, require_scale=require_scale, version_getter=version_getter)
    runtime = dict(torch_info) if torch_info is not None else qualify_torch(seed, require_cuda)
    if runtime.get("deterministicAlgorithms") is not True or runtime.get("cudnnBenchmark") not in (False, None):
        raise ValueError("deterministic PyTorch qualification settings are not active")
    if require_cuda and (runtime.get("cudaAvailable") is not True or not runtime.get("devices")):
        raise ValueError("CUDA qualification requires at least one enumerated GPU")
    env = os.environ if environment is None else environment
    cublas_workspace_config = str(env.get("CUBLAS_WORKSPACE_CONFIG", "")).strip()
    if require_cuda and cublas_workspace_config not in CUBLAS_DETERMINISTIC_CONFIGS:
        allowed = ", ".join(sorted(CUBLAS_DETERMINISTIC_CONFIGS))
        raise ValueError(f"CUDA qualification requires deterministic CUBLAS_WORKSPACE_CONFIG ({allowed})")
    if installed.get("torch") != pins[normalize_name("torch")]:
        raise ValueError("PyTorch pin mismatch")
    runtime["cublasWorkspaceConfig"] = cublas_workspace_config or None
    return {
        "schemaVersion": 1,
        "architecture": "CIEAV_ML_ENVIRONMENT_QUALIFICATION_V1",
        "authority": False,
        "qualification": "QUALIFIED",
        "createdAt": created_at or datetime.now(timezone.utc).isoformat(),
        "gitHead": git_head(),
        "seed": seed,
        "requireCuda": require_cuda,
        "requireScale": require_scale,
        "constraints": {"path": str(constraints), "sha256": sha256_file(constraints)},
        "python": {"version": platform.python_version(), "implementation": platform.python_implementation()},
        "platform": {"system": platform.system(), "release": platform.release(), "machine": platform.machine()},
        "packages": installed,
        "torch": runtime,
        "reproducibilityScope": "exact-qualified-software-and-hardware-environment",
    }


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--constraints", required=True, help="Exact package==version qualification constraints")
    p.add_argument("--output", default="ml/runs/latest/environment-qualification.json")
    p.add_argument("--seed", type=int, default=1729)
    p.add_argument("--require-cuda", action="store_true")
    p.add_argument("--require-scale", action="store_true")
    a = p.parse_args()
    manifest = build_manifest(
        constraints=Path(a.constraints),
        seed=a.seed,
        require_cuda=a.require_cuda,
        require_scale=a.require_scale,
    )
    out = Path(a.output).resolve(); out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(manifest, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    gpu_count = len(manifest["torch"].get("devices", []))
    print(f"CIEAV ML environment qualification PASS - exact pins + deterministic algorithms + cuda_required={a.require_cuda} gpus={gpu_count} authority=false")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
