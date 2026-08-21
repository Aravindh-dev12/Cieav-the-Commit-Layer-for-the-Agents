#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def expect_raises(fn, contains: str) -> None:
    try:
        fn()
    except ValueError as exc:
        if contains not in str(exc):
            raise AssertionError(f"expected {contains!r} in {exc!r}") from exc
        return
    raise AssertionError(f"expected ValueError containing {contains!r}")


def main() -> int:
    completion = load_module("cieav_completion_smoke", ROOT / "ml/cieav_rlvr/completion.py")
    envq = load_module("cieav_environment_smoke", ROOT / "ml/qualify_environment.py")
    assert completion.completion_text('{"actionType":"read"}') == '{"actionType":"read"}'
    assert completion.completion_text({"role": "assistant", "content": "direct"}) == "direct"
    assert completion.completion_text([
        {"role": "tool", "content": "untrusted tool envelope"},
        {"role": "assistant", "content": '{"actionType":"submit"}'},
    ]) == '{"actionType":"submit"}'
    expect_raises(lambda: completion.completion_text([]), "empty")
    expect_raises(lambda: completion.completion_text([{"role": "tool", "content": "x"}]), "no assistant content")

    versions = {name: f"1.0.{index}" for index, name in enumerate(envq.BASE_PACKAGES, 1)}
    getter = lambda name: versions[name]
    torch_info = {
        "torchVersion": versions["torch"],
        "cudaAvailable": True,
        "cudaRuntime": "13.0",
        "cudnnVersion": 99999,
        "devices": [{"index": 0, "name": "synthetic-ci-gpu", "totalMemory": 1, "capability": [9, 0]}],
        "deterministicAlgorithms": True,
        "cudnnBenchmark": False,
        "pythonRandomSeeded": True,
        "numpySeeded": True,
        "torchSeed": 1729,
    }
    with tempfile.TemporaryDirectory(prefix="cieav-ml-repro-") as temp:
        temp_path = Path(temp)
        constraints = temp_path / "qualified.txt"
        constraints.write_text("\n".join(f"{name}=={versions[name]}" for name in envq.BASE_PACKAGES) + "\n", encoding="utf-8")
        manifest = envq.build_manifest(
            constraints=constraints,
            seed=1729,
            require_cuda=True,
            require_scale=False,
            torch_info=torch_info,
            version_getter=getter,
            created_at="2026-08-21T00:00:00+00:00",
        )
        assert manifest["qualification"] == "QUALIFIED"
        assert manifest["authority"] is False
        assert manifest["requireCuda"] is True
        assert manifest["torch"]["deterministicAlgorithms"] is True
        assert manifest["torch"]["cudnnBenchmark"] is False
        floating = temp_path / "floating.txt"
        floating.write_text("torch>=2\n", encoding="utf-8")
        expect_raises(lambda: envq.parse_exact_constraints(floating), "exact package==version pins")
        missing = temp_path / "missing.txt"
        missing.write_text(f"torch=={versions['torch']}\n", encoding="utf-8")
        expect_raises(lambda: envq.build_manifest(constraints=missing, seed=1729, require_cuda=False, require_scale=False, torch_info=torch_info, version_getter=getter), "missing exact pin")
        no_cuda = dict(torch_info); no_cuda["cudaAvailable"] = False; no_cuda["devices"] = []
        expect_raises(lambda: envq.build_manifest(constraints=constraints, seed=1729, require_cuda=True, require_scale=False, torch_info=no_cuda, version_getter=getter), "at least one enumerated GPU")
    print("CIEAV ML reproducibility smoke PASS - conversational completion parsing + exact pins + deterministic settings + CUDA qualification fail-closed + authority=false")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
