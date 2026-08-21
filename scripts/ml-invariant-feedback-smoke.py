#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.write_text("".join(json.dumps(row, separators=(",", ":")) + "\n" for row in rows), encoding="utf-8")


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


def main() -> int:
    baseline = {"actionType": "financial.commit", "risk": "CRITICAL", "reversibility": "IRREVERSIBLE", "confidence": 0.95, "verifierUsed": True, "exposedData": []}
    expectation = {"actionTypes": ["financial.commit"], "risk": "CRITICAL", "reversibility": "IRREVERSIBLE", "requireVerifier": True}
    with tempfile.TemporaryDirectory(prefix="cieav-invariant-feedback-") as td:
        root = Path(td)
        tasks = root / "tasks.jsonl"
        completed = root / "completed.jsonl"
        priorities = root / "priorities.jsonl"
        out = root / "out"
        write_jsonl(tasks, [
            {"id": "stable::invariant::title", "sourceId": "stable", "dimension": "presentation_whitespace_title", "expectation": expectation, "baselineCandidate": baseline, "requiresFreshModelRollout": True},
            {"id": "unstable::invariant::title", "sourceId": "unstable", "dimension": "presentation_whitespace_title", "expectation": expectation, "baselineCandidate": baseline, "requiresFreshModelRollout": True},
        ])
        write_jsonl(completed, [
            {"id": "stable::invariant::title", "candidate": baseline},
            {"id": "unstable::invariant::title", "candidate": {**baseline, "risk": "LOW", "reversibility": "REVERSIBLE", "confidence": 0.99}},
        ])
        write_jsonl(priorities, [
            {"id": "stable", "reward": 0.8, "verifierDisagreement": 0.0, "ensembleDisagreement": 0.0, "oodScore": 0.0, "perturbationInstability": 0.0, "safetyShieldViolations": 0, "humanLabelCost": 1.0},
            {"id": "unstable", "reward": 0.8, "verifierDisagreement": 0.0, "ensembleDisagreement": 0.0, "oodScore": 0.0, "perturbationInstability": 0.0, "safetyShieldViolations": 0, "humanLabelCost": 1.0},
        ])
        subprocess.run([
            sys.executable, str(ROOT / "ml" / "ingest_invariant_rerolls.py"),
            "--tasks", str(tasks), "--completed", str(completed), "--priorities", str(priorities), "--output-dir", str(out),
        ], cwd=ROOT, check=True)
        report = json.loads((out / "report.json").read_text(encoding="utf-8"))
        assert report["authority"] is False
        assert report["verification"]["summary"]["total"] == 2
        assert report["verification"]["summary"]["stability"] == 0.5
        signals = {row["id"]: row for row in read_jsonl(out / "instability-signals.jsonl")}
        assert signals["stable"]["perturbationInstability"] == 0.0
        assert signals["unstable"]["perturbationInstability"] == 1.0
        results = {row["id"]: row for row in read_jsonl(out / "metamorphic-results.jsonl")}
        assert results["stable::invariant::title"]["invariant"]["passed"] is True
        assert results["unstable::invariant::title"]["invariant"]["passed"] is False
        assert results["unstable::invariant::title"]["canonicalReward"]["hardFailure"] is True
        reranked = read_jsonl(out / "failure-priorities.jsonl")
        assert reranked[0]["id"] == "unstable"
        assert reranked[0]["curriculumBand"] == "ADVERSARIAL"
    print("CIEAV invariant feedback smoke PASS - fresh rerolls + canonical metamorphic verification + active-mining rerank")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
