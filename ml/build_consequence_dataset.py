#!/usr/bin/env python3
"""Build SFT/DPO/KTO/GRPO records from verified CIEAV consequence trajectories."""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ml"))

from cieav_learning import load_jsonl
from cieav_learning.provenance import verify_provenance_boundary

SPLITS = ("train", "validation", "adversarial", "promotion")


def stable_split(trajectory_id: str) -> str:
    b = hashlib.sha256(trajectory_id.encode("utf-8")).digest()[0]
    if b < 179:
        return "train"
    if b < 217:
        return "validation"
    if b < 242:
        return "adversarial"
    return "promotion"


def prompt_for(row: dict[str, Any]) -> str:
    value = {
        "intentId": row["task"]["intentId"],
        "action": row["action"],
        "authorization": {
            "decision": row["authorization"]["decision"],
            "executionBindingDigest": row["authorization"].get("executionBindingDigest"),
        },
        "reality": row["reality"],
        "proofRequired": True,
        "trainingScope": (row.get("learning") or {}).get("trainingScope", "OUTCOME_PROOF"),
        "authorityGrade": (row.get("provenance") or {}).get("authorityGrade", False),
    }
    return json.dumps(value, separators=(",", ":"), sort_keys=True)


def completion_for(row: dict[str, Any]) -> str:
    outcome = row["outcome"]
    payload = {
        "status": outcome["status"],
        "confidence": outcome["confidence"],
        "claimSuccess": outcome["status"] == "SUCCESS",
        "requiresRecovery": outcome["status"] == "FAILURE",
        "requiresMoreEvidence": outcome["status"] == "UNKNOWN",
        "trajectoryDigest": row["digest"],
        "authorityClaim": False,
    }
    return json.dumps(payload, separators=(",", ":"), sort_keys=True)


def rejected_for(row: dict[str, Any]) -> str:
    status = row["outcome"]["status"]
    if status == "SUCCESS":
        wrong = {"status": "UNKNOWN", "claimSuccess": False, "reason": "ignored_verified_success"}
    elif status == "FAILURE":
        wrong = {"status": "SUCCESS", "claimSuccess": True, "reason": "claimed_failed_effect_success"}
    else:
        wrong = {"status": "SUCCESS", "claimSuccess": True, "reason": "unknown_claimed_success"}
    return json.dumps(wrong, separators=(",", ":"), sort_keys=True)


def expectation_for(row: dict[str, Any]) -> dict[str, Any]:
    status = row["outcome"]["status"]
    return {
        "authorizedOutcome": status,
        "mustNotClaimSuccess": status != "SUCCESS",
        "unknownMustRemainUnknown": status == "UNKNOWN",
        "verifiedFailureMustNotBecomeReward": status == "FAILURE",
        "risk": row["action"]["risk"],
        "trajectoryDigest": row["digest"],
        "authority": False,
        "trainingScope": (row.get("learning") or {}).get("trainingScope", "OUTCOME_PROOF"),
        "eligibleAgenticRl": (row.get("learning") or {}).get("eligibleAgenticRl", False),
    }


def stage_records(row: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    prompt = prompt_for(row)
    chosen = completion_for(row)
    rejected = rejected_for(row)
    provenance = row.get("provenance") or {}
    learning = row.get("learning") or {}
    base = {
        "id": row["trajectoryId"],
        "trajectory_digest": row["digest"],
        "authority": False,
        "outcome_status": row["outcome"]["status"],
        "evidence_class": provenance.get("evidenceClass", "UNSPECIFIED"),
        "authority_grade": provenance.get("authorityGrade", False),
        "reality_bound": provenance.get("realityBound", False),
        "training_scope": learning.get("trainingScope", "OUTCOME_PROOF"),
        "eligible_agentic_rl": learning.get("eligibleAgenticRl", False),
    }
    return {
        "sft": [{**base, "text": f"User:\n{prompt}\nAssistant:\n{chosen}"}],
        "dpo": [{**base, "prompt": prompt, "chosen": chosen, "rejected": rejected}],
        "kto": [
            {**base, "prompt": prompt, "completion": chosen, "label": True},
            {**base, "prompt": prompt, "completion": rejected, "label": False},
        ],
        "grpo": [{
            **base,
            "prompt": prompt,
            "expectation": expectation_for(row),
            "requiresFreshModelRollout": True,
        }],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="Verified CIEAV Authorized Outcome Trajectory JSONL")
    parser.add_argument("--output-dir", default="ml/data/consequence")
    args = parser.parse_args()

    rows = load_jsonl(args.input)
    for row in rows:
        if "provenance" in row:
            verify_provenance_boundary(row)
    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    handles: dict[tuple[str, str], Any] = {}
    counts = {split: {stage: 0 for stage in ("sft", "dpo", "kto", "grpo")} for split in SPLITS}
    authority_grade_count = sum(1 for row in rows if (row.get("provenance") or {}).get("authorityGrade") is True)
    agentic_eligible_count = sum(1 for row in rows if (row.get("learning") or {}).get("eligibleAgenticRl") is True)
    try:
        for split in SPLITS:
            split_dir = out / split
            split_dir.mkdir(parents=True, exist_ok=True)
            for stage in ("sft", "dpo", "kto", "grpo"):
                handles[(split, stage)] = (split_dir / f"{stage}.jsonl").open("w", encoding="utf-8", newline="\n")
        for row in rows:
            split = stable_split(row["trajectoryId"])
            for stage, records in stage_records(row).items():
                for record in records:
                    handles[(split, stage)].write(json.dumps(record, separators=(",", ":"), ensure_ascii=False) + "\n")
                    counts[split][stage] += 1
    finally:
        for handle in handles.values():
            handle.close()

    manifest = {
        "schemaVersion": 1,
        "kind": "CIEAV_VERIFIED_CONSEQUENCE_DATASET_V1",
        "authority": False,
        "sourceTrajectoryKind": "CIEAV_AUTHORIZED_OUTCOME_TRAJECTORY_V1",
        "records": counts,
        "provenance": {
            "authorityGradeRecords": authority_grade_count,
            "agenticRlEligibleRecords": agentic_eligible_count,
            "nonAuthorityGradeRestrictedToOutcomeProof": all(
                (row.get("provenance") or {}).get("authorityGrade") is True
                or (row.get("learning") or {}).get("trainingScope", "OUTCOME_PROOF") == "OUTCOME_PROOF"
                for row in rows
            ),
        },
        "invariants": {
            "unknownIsNeverPositiveSuccess": True,
            "learningCannotMintPermit": True,
            "learningCannotCommitAction": True,
            "candidateModelsRequireIndependentPromotion": True,
            "receiptEvidenceCannotClaimAuthorityGrade": True,
        },
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"CIEAV verified consequence dataset PASS · trajectories={len(rows)} · output={out}")


if __name__ == "__main__":
    main()
