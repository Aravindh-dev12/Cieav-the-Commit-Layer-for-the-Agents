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


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="cieav-ml-curriculum-") as td:
        root = Path(td)
        base = root / "base.jsonl"
        adv = root / "adv.jsonl"
        inv = root / "inv.jsonl"
        out = root / "curriculum.jsonl"
        report = root / "report.json"
        context = {"title": "Confirm transfer", "element": {"text": "Transfer"}, "nearbyText": "Consequential transfer."}
        expectation = {"actionTypes": ["financial.commit"], "risk": "CRITICAL", "reversibility": "COMPENSABLE", "requireVerifier": True}
        write_jsonl(base, [{"id": f"base-{i}", "context": context, "expectation": expectation} for i in range(4)])
        write_jsonl(adv, [{"id": f"adv-{i}", "sourceId": "base-0", "context": context, "expectation": expectation, "curriculumBand": "ADVERSARIAL", "candidate": {"risk": "LOW"}, "requiresFreshModelRollout": True} for i in range(2)])
        write_jsonl(inv, [{"id": f"inv-{i}", "sourceId": "base-1", "context": context, "expectation": expectation, "curriculumBand": "BOUNDARY", "requiresFreshModelRollout": True} for i in range(2)])
        subprocess.run([
            sys.executable, str(ROOT / "ml" / "build_curriculum.py"),
            "--base", str(base), "--adversarial", str(adv), "--invariant", str(inv),
            "--output", str(out), "--report", str(report), "--total", "10",
            "--adversarial-ratio", "0.2", "--invariant-ratio", "0.1", "--seed", "7",
        ], cwd=ROOT, check=True)
        meta = json.loads(report.read_text(encoding="utf-8"))
        rows = [json.loads(line) for line in out.read_text(encoding="utf-8").splitlines() if line]
        assert meta["authority"] is False
        assert meta["quotas"] == {"base": 7, "adversarialReplay": 2, "invariantReroll": 1}
        assert meta["sourceCounts"] == {"base": 7, "adversarial_replay": 2, "invariant_reroll": 1}
        assert len(rows) == 10
        assert all(row["requiresFreshModelRollout"] is True for row in rows)
        assert all("prompt" in row and "expectation" in row for row in rows)
        assert all("candidate" not in row for row in rows)
        assert all("Do not execute, authorize, approve, mint permits" in row["prompt"] for row in rows)
    print("CIEAV RLVR curriculum smoke PASS - deterministic quotas + fresh rollout tasks + bad-completion exclusion")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
