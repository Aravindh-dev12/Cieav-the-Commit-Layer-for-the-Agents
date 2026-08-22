#!/usr/bin/env python3
"""CLI for CIEAV verified consequence learning.

This CLI is deliberately authority-free. It can inspect providers, normalize already
finalized execution evidence into learning trajectories, verify trajectory integrity,
and build post-training datasets. It cannot issue permits, consume commits, execute
external actions, or promote model checkpoints.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ml"))

from cieav_learning import build_trajectory, dump_jsonl, list_providers, load_jsonl, verify_trajectory


def read_object(path: Path) -> dict:
    value = json.loads(path.read_text("utf-8"))
    if not isinstance(value, dict):
        raise SystemExit("input JSON must be an object")
    return value


def main() -> None:
    parser = argparse.ArgumentParser(description="CIEAV consequence-learning utility (authority=false)")
    sub = parser.add_subparsers(dest="command", required=True)

    providers = sub.add_parser("providers", help="List proof/learning providers and local readiness")
    providers.add_argument("--plane", choices=("proof", "learning"))

    normalize = sub.add_parser("normalize", help="Normalize one finalized execution evidence object")
    normalize.add_argument("--input", type=Path, required=True)
    normalize.add_argument("--output", type=Path, required=True)

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
        trajectory = build_trajectory(read_object(args.input))
        args.output.parent.mkdir(parents=True, exist_ok=True)
        dump_jsonl(str(args.output), [trajectory])
        print(json.dumps({"authority": False, "trajectoryId": trajectory["trajectoryId"], "digest": trajectory["digest"], "output": str(args.output)}, indent=2))
        return
    if args.command == "verify":
        rows = load_jsonl(str(args.input))
        for row in rows:
            verify_trajectory(row)
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
