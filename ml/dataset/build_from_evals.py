#!/usr/bin/env python3
"""Convert CIEAV eval cases into verifier-aware JSONL records.

This does not fabricate ideal model answers. It preserves deterministic expectations as
reward metadata so teacher/SFT generation and RL rollouts can be scored separately.
"""
from __future__ import annotations
import argparse, json, pathlib, hashlib


def stable_split(case_id: str) -> str:
    b = hashlib.sha256(case_id.encode()).digest()[0]
    if b < 179:
        return "train"
    if b < 217:
        return "validation"
    if b < 242:
        return "adversarial"
    return "promotion"


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--input", default="evals/cases.v1.json")
    p.add_argument("--output-dir", default="ml/data/generated")
    a = p.parse_args()
    src = json.loads(pathlib.Path(a.input).read_text())
    out = pathlib.Path(a.output_dir); out.mkdir(parents=True, exist_ok=True)
    handles = {k:(out/f"{k}.jsonl").open("w") for k in ("train","validation","adversarial","promotion")}
    try:
        for case in src.get("cases", []):
            split = stable_split(str(case["id"]))
            record = {
                "schema_version": 1,
                "id": case["id"],
                "group": case.get("group"),
                "split": split,
                "context": case.get("context", {}),
                "expectation": case.get("expect", {}),
                "reward_contract": {
                    "deterministic": True,
                    "critical_false_negative_is_hard_failure": True,
                    "high_false_negative_is_hard_failure": True,
                    "reversibility_optimism_is_penalized": True,
                    "privacy_leak_is_hard_failure": True,
                    "unknown_must_not_be_claimed_success": True,
                },
            }
            handles[split].write(json.dumps(record, separators=(",", ":")) + "\n")
    finally:
        for h in handles.values(): h.close()

if __name__ == "__main__":
    main()
