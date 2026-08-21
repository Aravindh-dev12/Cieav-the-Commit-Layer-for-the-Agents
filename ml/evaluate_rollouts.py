#!/usr/bin/env python3
"""Evaluate CIEAV ML rollout JSONL through the canonical Node verifier.

Python orchestrates IO, provenance, and artifact production. Canonical reward,
promotion, reward-gap, hidden-bank, and failure-priority semantics execute in the
Node/TypeScript verifier. Hidden/independent evidence must be supplied explicitly;
this tool never relabels the training verifier as an independent verifier.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ml"))

from cieav_rlvr import CieavVerifierClient, NodeVerifierProcess

RISK_RANK = {"LOW": 0, "MEDIUM": 1, "HIGH": 2, "CRITICAL": 3}


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


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for line_no, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not raw.strip():
            continue
        value = json.loads(raw)
        if not isinstance(value, dict):
            raise ValueError(f"{path}:{line_no}: expected JSON object")
        rows.append(value)
    return rows


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as f:
        for row in rows:
            f.write(json.dumps(row, separators=(",", ":"), ensure_ascii=True) + "\n")


def promotion_sample(row: dict[str, Any], reward: dict[str, Any]) -> dict[str, Any]:
    expectation = row["expectation"]
    candidate = row["candidate"]
    expected_risk = str(expectation["risk"])
    candidate_risk = str(candidate["risk"])
    confidence = float(candidate.get("confidence", 0.0))
    action_ok = candidate.get("actionType") in expectation.get("actionTypes", [])
    risk_ok = RISK_RANK.get(candidate_risk, -1) >= RISK_RANK.get(expected_risk, 99)
    correct = action_ok and risk_ok and not bool(reward.get("hardFailure"))
    calibration_error = abs(confidence - (1.0 if correct else 0.0))
    return {
        "id": str(row["id"]),
        "expectedRisk": expected_risk,
        "reward": float(reward["score"]),
        "hardFailure": bool(reward["hardFailure"]),
        "riskUnderclassified": RISK_RANK.get(candidate_risk, -1) < RISK_RANK.get(expected_risk, 99),
        "calibrationError": calibration_error,
        "shouldAbstain": bool(expectation.get("shouldAbstain", False)),
        "abstained": bool(candidate.get("abstain", False)),
        "rewardHackingDetected": bool(row.get("rewardHackingDetected", False)),
    }


def evaluate(client: CieavVerifierClient, rows: list[dict[str, Any]], limit: int) -> dict[str, Any]:
    scored: list[dict[str, Any]] = []
    promotion: list[dict[str, Any]] = []
    gap_samples: list[dict[str, Any]] = []
    verifier_rows: list[dict[str, Any]] = []
    failure_rows: list[dict[str, Any]] = []

    for row in rows:
        for key in ("id", "expectation", "candidate"):
            if key not in row:
                raise ValueError(f"rollout missing required field: {key}")
        reward = client.score_decision(row["expectation"], row["candidate"], row.get("process"))
        scored_row = {**row, "canonicalReward": reward}
        scored.append(scored_row)
        promotion.append(promotion_sample(row, reward))

        independent = row.get("independentSafetyScore")
        if independent is not None:
            independent_score = float(independent)
            gap_samples.append({"id": str(row["id"]), "trainingReward": float(reward["score"]), "independentSafetyScore": independent_score})
            verifier_rows.append({
                "id": str(row["id"]),
                "visibility": str(row.get("verifierVisibility", "HIDDEN_PROMOTION")),
                "score": independent_score,
                "hardFailure": bool(row.get("independentHardFailure", False)),
                "detail": str(row.get("independentDetail", "external_independent_evidence")),
            })
        verifier_disagreement = abs(float(reward["score"]) - float(independent)) if independent is not None else 0.0
        failure_rows.append({
            "id": str(row["id"]),
            "reward": float(reward["score"]),
            "verifierDisagreement": verifier_disagreement,
            "ensembleDisagreement": float(row.get("ensembleDisagreement", 0.0)),
            "oodScore": float(row.get("oodScore", 0.0)),
            "perturbationInstability": float(row.get("perturbationInstability", 0.0)),
            "safetyShieldViolations": int(row.get("safetyShieldViolations", 1 if reward.get("hardFailure") else 0)),
            "humanLabelCost": float(row.get("humanLabelCost", 1.0)),
        })

    promotion_report = client.evaluate_promotion(promotion)
    reward_gap_report = client.evaluate_reward_gap(gap_samples) if gap_samples else None
    verifier_bank_report = client.evaluate_verifier_bank(verifier_rows) if verifier_rows else None
    priorities = client.prioritize_failures(failure_rows, limit=limit)
    return {
        "scored": scored,
        "promotion": promotion_report,
        "rewardGap": reward_gap_report,
        "verifierBank": verifier_bank_report,
        "hiddenEvidencePresent": bool(verifier_rows),
        "priorities": priorities,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="JSONL with id, expectation, candidate, and optional independent verifier evidence")
    parser.add_argument("--output-dir", default="ml/runs/latest")
    parser.add_argument("--model", default="unknown")
    parser.add_argument("--failure-limit", type=int, default=100)
    parser.add_argument("--verifier-mode", choices=["auto", "external"], default="auto")
    args = parser.parse_args()

    src = Path(args.input).resolve()
    out = Path(args.output_dir).resolve()
    out.mkdir(parents=True, exist_ok=True)
    rows = load_jsonl(src)
    if not rows:
        raise SystemExit("rollout input is empty")

    if args.verifier_mode == "external":
        url = os.environ.get("CIEAV_ML_VERIFIER_URL", "")
        token = os.environ.get("CIEAV_ML_VERIFIER_TOKEN", "")
        client = CieavVerifierClient(url, token)
        client.health()
        result = evaluate(client, rows, args.failure_limit)
        health = client.health()
    else:
        with NodeVerifierProcess(ROOT) as client:
            health = client.health()
            result = evaluate(client, rows, args.failure_limit)

    write_jsonl(out / "scored.jsonl", result.pop("scored"))
    write_jsonl(out / "failure-priorities.jsonl", result.pop("priorities"))
    report = {
        "schemaVersion": 1,
        "architecture": "CIEAV_PYTHON_NODE_RLVR_EVAL_V1",
        "authority": False,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "model": args.model,
        "input": {"path": str(src), "sha256": sha256_file(src), "samples": len(rows)},
        "gitHead": git_head(),
        "verifier": {"protocol": health.get("protocol"), "authority": health.get("authority"), "capabilities": health.get("capabilities", [])},
        **result,
    }
    (out / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    print(f"CIEAV RLVR evaluation complete - samples={len(rows)} promotion_passed={bool(report['promotion'].get('passed'))} hidden_evidence={report['hiddenEvidencePresent']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
