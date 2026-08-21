#!/usr/bin/env python3
"""Build verifier-backed adversarial replay and invariant reroll tasks.

Candidate counterexamples are generated deterministically and re-scored by the canonical
Node verifier. Context-invariant mutations never invent a model answer: they produce
fresh-rollout tasks that must be evaluated by the model again.
"""
from __future__ import annotations

import argparse
import copy
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

RISK_ORDER = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
REVERSIBILITY_ORDER = ["REVERSIBLE", "DELAYABLE", "COMPENSABLE", "UNKNOWN", "IRREVERSIBLE"]


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


def lower_risk(value: str) -> str | None:
    try:
        index = RISK_ORDER.index(value)
    except ValueError:
        return None
    return RISK_ORDER[index - 1] if index > 0 else None


def optimistic_reversibility(value: str) -> str | None:
    try:
        index = REVERSIBILITY_ORDER.index(value)
    except ValueError:
        return None
    return REVERSIBILITY_ORDER[index - 1] if index > 0 else None


def candidate_mutations(row: dict[str, Any]) -> list[tuple[str, dict[str, Any], dict[str, Any] | None]]:
    candidate = row["candidate"]
    out: list[tuple[str, dict[str, Any], dict[str, Any] | None]] = []
    risk = lower_risk(str(candidate.get("risk")))
    if risk is not None:
        mutated = {**candidate, "risk": risk, "confidence": max(float(candidate.get("confidence", 0.0)), 0.95)}
        out.append(("risk_downgrade", mutated, {"kind": "MATERIAL", "dimension": "risk", "expectedChange": ["risk"]}))
    reversibility = optimistic_reversibility(str(candidate.get("reversibility")))
    if reversibility is not None:
        mutated = {**candidate, "reversibility": reversibility, "confidence": max(float(candidate.get("confidence", 0.0)), 0.95)}
        out.append(("reversibility_optimism", mutated, {"kind": "MATERIAL", "dimension": "reversibility", "expectedChange": ["reversibility"]}))
    if row.get("expectation", {}).get("requireVerifier") and candidate.get("verifierUsed") is True:
        mutated = {**candidate, "verifierUsed": False, "confidence": max(float(candidate.get("confidence", 0.0)), 0.95)}
        out.append(("verifier_bypass", mutated, None))
    return out


def invariant_context_mutations(row: dict[str, Any]) -> list[dict[str, Any]]:
    context = row.get("context")
    if not isinstance(context, dict):
        return []
    tasks: list[dict[str, Any]] = []
    if isinstance(context.get("title"), str) and context["title"]:
        mutated = copy.deepcopy(context)
        mutated["title"] = f"  {context['title']}  "
        tasks.append({"dimension": "presentation_whitespace_title", "context": mutated})
    element = context.get("element")
    if isinstance(element, dict) and isinstance(element.get("text"), str) and element["text"]:
        mutated = copy.deepcopy(context)
        mutated["element"]["text"] = f" {element['text']} "
        tasks.append({"dimension": "presentation_whitespace_element_text", "context": mutated})
    return tasks


def build(client: CieavVerifierClient, scored: list[dict[str, Any]], priorities: list[dict[str, Any]], limit: int) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    by_id = {str(row["id"]): row for row in scored}
    selected = priorities[: max(0, limit)]
    replay: list[dict[str, Any]] = []
    reroll: list[dict[str, Any]] = []
    perturbation_checks: list[dict[str, Any]] = []

    for priority in selected:
        source = by_id.get(str(priority.get("id")))
        if not source:
            continue
        base = source["candidate"]
        for index, (kind, mutated, perturbation) in enumerate(candidate_mutations(source)):
            replay_id = f"{source['id']}::adv::{kind}"
            reward = client.score_decision(source["expectation"], mutated, source.get("process"))
            record = {
                "schemaVersion": 1,
                "id": replay_id,
                "sourceId": str(source["id"]),
                "curriculumBand": priority.get("curriculumBand"),
                "priority": priority.get("priority"),
                "mutation": kind,
                "expectation": source["expectation"],
                "candidate": mutated,
                "canonicalReward": reward,
                "lineage": {"source": "failure-priorities", "sourceIndex": index, "generated": True},
            }
            replay.append(record)
            if perturbation is not None:
                perturbation_checks.append({
                    "base": base,
                    "mutated": mutated,
                    "test": {"id": replay_id, **perturbation},
                })
        for index, task in enumerate(invariant_context_mutations(source)):
            reroll.append({
                "schemaVersion": 1,
                "id": f"{source['id']}::invariant::{task['dimension']}",
                "sourceId": str(source["id"]),
                "kind": "INVARIANT_REROLL",
                "dimension": task["dimension"],
                "expectation": source["expectation"],
                "context": task["context"],
                "baselineCandidate": base,
                "requiresFreshModelRollout": True,
                "lineage": {"source": "scored-rollout", "sourceIndex": index, "generated": True},
            })

    perturbation_report = client.verify_perturbations(perturbation_checks) if perturbation_checks else {"results": [], "summary": {"passed": True, "total": 0, "failures": [], "stability": 1}}
    hard_failures = sum(1 for row in replay if row.get("canonicalReward", {}).get("hardFailure"))
    report = {
        "replaySamples": len(replay),
        "invariantRerollTasks": len(reroll),
        "canonicalHardFailures": hard_failures,
        "perturbations": perturbation_report,
    }
    return replay, reroll, report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scored", required=True)
    parser.add_argument("--priorities", required=True)
    parser.add_argument("--output-dir", default="ml/runs/latest/replay")
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument("--verifier-mode", choices=["auto", "external"], default="auto")
    args = parser.parse_args()

    scored_path = Path(args.scored).resolve()
    priorities_path = Path(args.priorities).resolve()
    out = Path(args.output_dir).resolve()
    out.mkdir(parents=True, exist_ok=True)
    scored = load_jsonl(scored_path)
    priorities = load_jsonl(priorities_path)

    if args.verifier_mode == "external":
        client = CieavVerifierClient(os.environ.get("CIEAV_ML_VERIFIER_URL", ""), os.environ.get("CIEAV_ML_VERIFIER_TOKEN", ""))
        health = client.health()
        replay, reroll, report = build(client, scored, priorities, args.limit)
    else:
        with NodeVerifierProcess(ROOT) as client:
            health = client.health()
            replay, reroll, report = build(client, scored, priorities, args.limit)

    write_jsonl(out / "adversarial-replay.jsonl", replay)
    write_jsonl(out / "invariant-reroll.jsonl", reroll)
    artifact = {
        "schemaVersion": 1,
        "architecture": "CIEAV_ADVERSARIAL_REPLAY_V1",
        "authority": False,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "gitHead": git_head(),
        "inputs": {
            "scored": {"path": str(scored_path), "sha256": sha256_file(scored_path), "samples": len(scored)},
            "priorities": {"path": str(priorities_path), "sha256": sha256_file(priorities_path), "samples": len(priorities)},
        },
        "verifier": {"protocol": health.get("protocol"), "authority": health.get("authority"), "capabilities": health.get("capabilities", [])},
        **report,
    }
    (out / "report.json").write_text(json.dumps(artifact, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    print(f"CIEAV adversarial replay complete - replay={len(replay)} reroll={len(reroll)} hard_failures={artifact['canonicalHardFailures']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
