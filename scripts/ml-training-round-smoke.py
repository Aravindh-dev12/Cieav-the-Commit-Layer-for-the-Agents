#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ml"))

from training_round import apply_promotion, create_round, git_head, record_checkpoint, sha256_file, verify_round


def write_json(path: Path, value) -> None:
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="cieav-training-round-") as td:
        root = Path(td)
        dataset = root / "curriculum.jsonl"
        dataset.write_text(json.dumps({"id": "sample", "prompt": "x", "expectation": {}}) + "\n", encoding="utf-8")
        curriculum_report = root / "curriculum-report.json"
        write_json(curriculum_report, {
            "schemaVersion": 1,
            "architecture": "CIEAV_RLVR_CURRICULUM_V1",
            "authority": False,
            "seed": 1729,
            "total": 1,
            "quotas": {"base": 1, "adversarialReplay": 0, "invariantReroll": 0},
            "sourceCounts": {"base": 1},
            "curriculumBandCounts": {"KNOWN": 1},
            "inputs": {"base": {"sha256": "source"}},
        })
        environment_report = root / "environment-qualification.json"
        write_json(environment_report, {
            "schemaVersion": 1,
            "architecture": "CIEAV_ML_ENVIRONMENT_QUALIFICATION_V1",
            "authority": False,
            "qualification": "QUALIFIED",
            "gitHead": git_head(),
            "seed": 1729,
            "requireCuda": True,
            "requireScale": True,
            "constraints": {"path": "qualified.txt", "sha256": "c" * 64},
            "packages": {"torch": "qualified"},
            "torch": {"deterministicAlgorithms": True, "cudnnBenchmark": False, "cudaAvailable": True, "devices": [{"name": "smoke-gpu"}]},
        })
        gpu_probe_report = root / "gpu-determinism-probe.json"
        write_json(gpu_probe_report, {
            "schemaVersion": 1,
            "architecture": "CIEAV_ML_GPU_DETERMINISM_PROBE_V1",
            "authority": False,
            "qualification": "QUALIFIED",
            "gitHead": git_head(),
            "environmentManifest": {"path": str(environment_report.resolve()), "sha256": sha256_file(environment_report)},
            "seed": 1729,
            "cublasWorkspaceConfig": ":4096:8",
            "deterministicAlgorithms": True,
            "cudnnBenchmark": False,
            "device": {"index": 0, "name": "smoke-gpu", "totalMemory": 1, "capability": [9, 0]},
            "probes": {"torch.mm": "a" * 64, "torch.nn.functional.conv2d": "b" * 64},
        })
        checkpoint = root / "checkpoint"
        checkpoint.mkdir()
        (checkpoint / "model.safetensors").write_bytes(b"checkpoint-v1")
        base_kwargs = dict(
            stage="grpo",
            model="smoke-model",
            dataset=dataset,
            output_dir=checkpoint,
            hyperparameters={"learningRate": 1e-6, "epochs": 1, "batchSize": 1, "beta": 0.04, "numGenerations": 8, "seed": 1729, "dataSeed": 1729, "fullDeterminism": True},
            verifier_health={"protocol": "CIEAV_ML_VERIFIER_V1", "authority": False, "capabilities": ["decision_reward", "promotion", "verifier_bank"]},
            curriculum_report=curriculum_report,
        )
        manifest = create_round(**base_kwargs, environment_report=environment_report, gpu_probe_report=gpu_probe_report)
        assert manifest["qualification"] == "UNQUALIFIED"
        assert manifest["status"] == "TRAINING"
        assert manifest["verifier"]["authority"] is False
        assert manifest["environment"]["constraintsSha256"] == "c" * 64
        assert manifest["gpuDeterminism"]["environmentSha256"] == manifest["environment"]["sha256"]
        assert "token" not in json.dumps(manifest).lower()
        manifest = record_checkpoint(manifest, checkpoint)
        assert manifest["status"] == "TRAINED_UNQUALIFIED"
        assert manifest["qualification"] == "UNQUALIFIED"
        assert not verify_round(manifest)

        passed_report = root / "passed-promotion.json"
        write_json(passed_report, {
            "schemaVersion": 1,
            "architecture": "CIEAV_PYTHON_NODE_RLVR_EVAL_V1",
            "authority": False,
            "promotion": {"passed": True, "metrics": {"samples": 8, "hardSafetyFailures": 0}, "violations": []},
            "hiddenEvidencePresent": True,
            "verifierBank": {"passed": True, "hiddenHardFailures": 0, "runtimeHardFailures": 0, "violations": []},
        })
        no_env = record_checkpoint(create_round(**base_kwargs), checkpoint)
        blocked = apply_promotion(no_env, passed_report)
        assert blocked["qualification"] == "UNQUALIFIED"
        assert blocked["promotion"]["environmentQualified"] is False
        assert blocked["promotion"]["gpuDeterminismQualified"] is False

        env_only = record_checkpoint(create_round(**base_kwargs, environment_report=environment_report), checkpoint)
        env_blocked = apply_promotion(env_only, passed_report)
        assert env_blocked["qualification"] == "UNQUALIFIED"
        assert env_blocked["promotion"]["environmentQualified"] is True
        assert env_blocked["promotion"]["gpuDeterminismQualified"] is False

        failed_report = root / "failed-promotion.json"
        write_json(failed_report, {
            "schemaVersion": 1,
            "architecture": "CIEAV_PYTHON_NODE_RLVR_EVAL_V1",
            "authority": False,
            "promotion": {"passed": True, "metrics": {"samples": 1}, "violations": []},
            "hiddenEvidencePresent": False,
            "verifierBank": None,
        })
        failed = apply_promotion(manifest, failed_report)
        assert failed["qualification"] == "UNQUALIFIED"
        assert failed["promotion"]["gpuDeterminismQualified"] is True

        qualified = apply_promotion(manifest, passed_report)
        assert qualified["qualification"] == "QUALIFIED"
        assert qualified["status"] == "PROMOTION_PASSED"
        assert qualified["promotion"]["environmentQualified"] is True
        assert qualified["promotion"]["gpuDeterminismQualified"] is True
        assert not verify_round(qualified)

        gpu = json.loads(gpu_probe_report.read_text(encoding="utf-8")); gpu["probes"]["torch.mm"] = "0" * 64; write_json(gpu_probe_report, gpu)
        violations = verify_round(qualified)
        assert "gpuDeterminism_digest_mismatch" in violations
        write_json(gpu_probe_report, {**gpu, "probes": {"torch.mm": "a" * 64, "torch.nn.functional.conv2d": "b" * 64}})
        (checkpoint / "model.safetensors").write_bytes(b"tampered")
        violations = verify_round(qualified)
        assert "checkpoint_digest_mismatch" in violations

    print("CIEAV training round smoke PASS - environment + GPU determinism qualification + checkpoint provenance + fail-closed hidden promotion + tamper detection")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
