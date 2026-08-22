#!/usr/bin/env python3
"""CLI for CIEAV verified consequence learning.

This CLI is deliberately authority-free. It can inspect providers, normalize finalized
execution evidence into learning trajectories, verify trajectory integrity, and build
post-training datasets. It cannot issue permits, consume commits, execute external
actions, or promote model checkpoints.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ml"))

from cieav_learning import dump_jsonl, list_providers, load_jsonl, verify_trajectory
from cieav_learning.provenance import build_provenanced_trajectory, verify_provenance_boundary


def read_object(path: Path) -> dict:
    value = json.loads(path.read_text("utf-8"))
    if not isinstance(value, dict):
        raise SystemExit("input JSON must be an object")
    return value


def read_jsonl_objects(path: Path) -> list[dict]:
    rows: list[dict] = []
    for line_no, line in enumerate(path.read_text("utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError as exc:
            raise SystemExit(f"{path}:{line_no}: invalid JSON") from exc
        if not isinstance(value, dict):
            raise SystemExit(f"{path}:{line_no}: JSON object required")
        rows.append(value)
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description="CIEAV consequence-learning utility (authority=false)")
    sub = parser.add_subparsers(dest="command", required=True)

    providers = sub.add_parser("providers", help="List proof/learning providers and local readiness")
    providers.add_argument("--plane", choices=("proof", "learning"))

    normalize = sub.add_parser("normalize", help="Normalize one finalized execution evidence object")
    normalize.add_argument("--input", type=Path, required=True)
    normalize.add_argument("--output", type=Path, required=True)

    normalize_jsonl = sub.add_parser("normalize-jsonl", help="Normalize finalized evidence JSONL with provenance")
    normalize_jsonl.add_argument("--input", type=Path, required=True)
    normalize_jsonl.add_argument("--output", type=Path, required=True)

    verify = sub.add_parser("verify", help="Verify sealed trajectory JSONL")
    verify.add_argument("--input", type=Path, required=True)

    dataset = sub.add_parser("dataset", help="Build SFT/DPO/KTO/GRPO datasets from verified trajectories")
    dataset.add_argument("--input", type=Path, required=True)
    dataset.add_argument("--output-dir", type=Path, default=Path("ml/data/consequence"))

    args = parser.parse_args()
    if args.command == "providers":
        print(json.dumps({"authority": False, "providers": list_providers(plane=args.plane)}, indent=2))
        return
    if args.command == "normalize":
        trajectory = build_provenanced_trajectory(read_object(args.input))
        verify_provenance_boundary(trajectory)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        dump_jsonl(str(args.output), [trajectory])
        print(json.dumps({"authority": False, "trajectoryId": trajectory["trajectoryId"], "digest": trajectory["digest"], "trainingScope": trajectory["learning"]["trainingScope"], "output": str(args.output)}, indent=2))
        return
    if args.command == "normalize-jsonl":
        trajectories = [build_provenanced_trajectory(row) for row in read_jsonl_objects(args.input)]
        for trajectory in trajectories:
            verify_provenance_boundary(trajectory)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        dump_jsonl(str(args.output), trajectories)
        counts: dict[str, int] = {}
        for row in trajectories:
            key = str(row["learning"]["trainingScope"])
            counts[key] = counts.get(key, 0) + 1
        print(json.dumps({"authority": False, "normalized": len(trajectories), "trainingScopes": counts, "output": str(args.output)}, indent=2))
        return
    if args.command == "verify":
        rows = load_jsonl(str(args.input))
        for row in rows:
            verify_trajectory(row)
            if "provenance" in row:
                verify_provenance_boundary(row)
        print(json.dumps({"authority": False, "verified": len(rows), "input": str(args.input)}, indent=2))
        return
    if args.command == "dataset":
        subprocess.run(
            [sys.executable, str(ROOT / "ml" / "build_consequence_dataset.py"), "--input", str(args.input), "--output-dir", str(args.output_dir)],
            cwd=ROOT,
            check=True,
        )
        return


if __name__ == "__main__":
    main()
