#!/usr/bin/env python3
"""Ingest completed invariant rerolls and feed metamorphic instability into mining.

Fresh reroll outputs are canonical-scored by Node and compared against their baseline
candidate using the TypeScript invariant verifier. Instability is aggregated by source
case and merged back into failure signals before canonical re-prioritization.
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


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for line_no, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not raw.strip():
            continue
        value = json.loads(raw)
        if not isinstance(value, dict):
            raise ValueError(f"{path}:{line_no}: expected object")
        rows.append(value)
    return rows


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as f:
        for row in rows:
            f.write(json.dumps(row, separators=(",", ":"), ensure_ascii=True) + "\n")


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


def index_unique(rows: list[dict[str, Any]], label: str) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for row in rows:
        if "id" not in row:
            raise ValueError(f"{label} record missing id")
        key = str(row["id"])
        if key in out:
            raise ValueError(f"duplicate {label} id: {key}")
        out[key] = row
    return out


def signal_from_priority(row: dict[str, Any], instability: float) -> dict[str, Any]:
    required = ("id", "reward", "verifierDisagreement", "ensembleDisagreement", "oodScore", "safetyShieldViolations")
    for key in required:
        if key not in row:
            raise ValueError(f"priority {row.get('id')} missing {key}")
    return {
        "id": str(row["id"]),
        "reward": float(row["reward"]),
        "verifierDisagreement": float(row["verifierDisagreement"]),
        "ensembleDisagreement": float(row["ensembleDisagreement"]),
        "oodScore": float(row["oodScore"]),
        "perturbationInstability": max(float(row.get("perturbationInstability", 0.0)), instability),
        "safetyShieldViolations": int(row["safetyShieldViolations"]),
        "humanLabelCost": float(row.get("humanLabelCost", 1.0)),
    }


def ingest(
    client: CieavVerifierClient,
    tasks: list[dict[str, Any]],
    completed: list[dict[str, Any]],
    priorities: list[dict[str, Any]],
    *,
    allow_partial: bool,
    failure_limit: int,
) -> dict[str, Any]:
    task_by_id = index_unique(tasks, "task")
    completed_by_id = index_unique(completed, "completed")
    unknown = sorted(set(completed_by_id) - set(task_by_id))
    if unknown:
        raise ValueError(f"completed rerolls contain unknown task ids: {','.join(unknown[:10])}")
    missing = sorted(set(task_by_id) - set(completed_by_id))
    if missing and not allow_partial:
        raise ValueError(f"completed rerolls are incomplete; missing {len(missing)} task(s)")

    checks: list[dict[str, Any]] = []
    reward_by_id: dict[str, dict[str, Any]] = {}
    candidate_by_id: dict[str, dict[str, Any]] = {}
    for task_id, completion in completed_by_id.items():
        task = task_by_id[task_id]
        candidate = completion.get("candidate")
        if not isinstance(candidate, dict):
            raise ValueError(f"completed reroll {task_id} missing candidate object")
        baseline = task.get("baselineCandidate")
        expectation = task.get("expectation")
        if not isinstance(baseline, dict) or not isinstance(expectation, dict):
            raise ValueError(f"invariant task {task_id} missing baselineCandidate/expectation")
        checks.append({
            "base": baseline,
            "mutated": candidate,
            "test": {"id": task_id, "kind": "INVARIANT", "dimension": str(task.get("dimension", "unknown"))},
        })
        reward_by_id[task_id] = client.score_decision(expectation, candidate, completion.get("process"))
        candidate_by_id[task_id] = candidate

    verification = client.verify_perturbations(checks) if checks else {"results": [], "summary": {"passed": True, "total": 0, "failures": [], "stability": 1}}
    result_by_id = {str(row["id"]): row for row in verification["results"]}
    result_rows: list[dict[str, Any]] = []
    aggregate: dict[str, dict[str, int]] = {}
    reroll_hard_failures = 0
    for task_id in completed_by_id:
        task = task_by_id[task_id]
        source_id = str(task.get("sourceId", task_id))
        result = result_by_id.get(task_id)
        if not isinstance(result, dict):
            raise ValueError(f"canonical perturbation result missing for {task_id}")
        reward = reward_by_id[task_id]
        if reward.get("hardFailure"):
            reroll_hard_failures += 1
        bucket = aggregate.setdefault(source_id, {"total": 0, "failures": 0})
        bucket["total"] += 1
        if not bool(result.get("passed")):
            bucket["failures"] += 1
        result_rows.append({
            "schemaVersion": 1,
            "id": task_id,
            "sourceId": source_id,
            "dimension": task.get("dimension"),
            "candidate": candidate_by_id[task_id],
            "canonicalReward": reward,
            "invariant": result,
        })

    signals = [
        {"id": source_id, "completed": counts["total"], "failures": counts["failures"], "perturbationInstability": counts["failures"] / counts["total"]}
        for source_id, counts in sorted(aggregate.items())
    ]
    instability_by_id = {row["id"]: float(row["perturbationInstability"]) for row in signals}
    priority_ids = {str(row.get("id")) for row in priorities}
    unmatched_sources = sorted(set(instability_by_id) - priority_ids)
    if unmatched_sources:
        raise ValueError(f"invariant source ids missing from failure priorities: {','.join(unmatched_sources[:10])}")
    updated_signals = [signal_from_priority(row, instability_by_id.get(str(row["id"]), 0.0)) for row in priorities]
    reranked = client.prioritize_failures(updated_signals, limit=failure_limit)
    return {
        "results": result_rows,
        "signals": signals,
        "reranked": reranked,
        "verification": verification,
        "missing": missing,
        "rerollHardFailures": reroll_hard_failures,
    }


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--tasks", required=True)
    p.add_argument("--completed", required=True)
    p.add_argument("--priorities", required=True)
    p.add_argument("--output-dir", default="ml/runs/latest/invariant-feedback")
    p.add_argument("--allow-partial", action="store_true")
    p.add_argument("--failure-limit", type=int, default=100)
    p.add_argument("--verifier-mode", choices=["auto", "external"], default="auto")
    a = p.parse_args()

    tasks_path = Path(a.tasks).resolve()
    completed_path = Path(a.completed).resolve()
    priorities_path = Path(a.priorities).resolve()
    out = Path(a.output_dir).resolve(); out.mkdir(parents=True, exist_ok=True)
    tasks = load_jsonl(tasks_path)
    completed = load_jsonl(completed_path)
    priorities = load_jsonl(priorities_path)
    if not tasks:
        raise SystemExit("invariant task input is empty")
    if not priorities:
        raise SystemExit("failure priority input is empty")

    if a.verifier_mode == "external":
        client = CieavVerifierClient(os.environ.get("CIEAV_ML_VERIFIER_URL", ""), os.environ.get("CIEAV_ML_VERIFIER_TOKEN", ""))
        health = client.health()
        result = ingest(client, tasks, completed, priorities, allow_partial=a.allow_partial, failure_limit=a.failure_limit)
    else:
        with NodeVerifierProcess(ROOT) as client:
            health = client.health()
            result = ingest(client, tasks, completed, priorities, allow_partial=a.allow_partial, failure_limit=a.failure_limit)

    write_jsonl(out / "metamorphic-results.jsonl", result.pop("results"))
    write_jsonl(out / "instability-signals.jsonl", result.pop("signals"))
    write_jsonl(out / "failure-priorities.jsonl", result.pop("reranked"))
    report = {
        "schemaVersion": 1,
        "architecture": "CIEAV_INVARIANT_FEEDBACK_V1",
        "authority": False,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "gitHead": git_head(),
        "inputs": {
            "tasks": {"path": str(tasks_path), "sha256": sha256_file(tasks_path), "samples": len(tasks)},
            "completed": {"path": str(completed_path), "sha256": sha256_file(completed_path), "samples": len(completed)},
            "priorities": {"path": str(priorities_path), "sha256": sha256_file(priorities_path), "samples": len(priorities)},
        },
        "verifier": {"protocol": health.get("protocol"), "authority": health.get("authority"), "capabilities": health.get("capabilities", [])},
        **result,
    }
    (out / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    summary = report["verification"]["summary"]
    print(f"CIEAV invariant feedback complete - completed={len(completed)} failures={len(summary.get('failures', []))} stability={float(summary.get('stability', 0.0)):.3f} reroll_hard_failures={report['rerollHardFailures']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
