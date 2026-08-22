#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

from cieav_learning import load_jsonl
from cieav_learning.provenance import verify_provenance_boundary

SPLITS = ("train", "validation", "adversarial", "promotion")


def stable_split(identifier: str) -> str:
    value = int(hashlib.sha256(identifier.encode("utf-8")).hexdigest()[:8], 16) % 100
    if value < 70:
        return "train"
    if value < 82:
        return "validation"
    if value < 92:
        return "adversarial"
    return "promotion"


def prompt_for(row: dict[str, Any]) -> str:
    task = row["task"]
    action = row["action"]
    auth = row["authorization"]
    reality = row["reality"]
    return json.dumps(
        {
            "intentId": task["intentId"],
            "intentDigest": task["intentDigest"],
            "action": {
                "toolId": action["toolId"],
                "protocol": action["protocol"],
                "operation": action["operation"],
                "risk": action["risk"],
                "semanticEffect": action["semanticEffect"],
                "argumentsDigest": action["argumentsDigest"],
            },
            "authorization": {
                "decision": auth["decision"],
                "executionBindingDigest": auth["executionBindingDigest"],
            },
            "reality": {
                "preStateDigest": reality["preStateDigest"],
                "expectedPostStateDigest": reality["expectedPostStateDigest"],
                "proofObligationDigest": reality["proofObligationDigest"],
            },
            "proofRequired": True,
            "authority": False,
        },
        separators=(",", ":"),
        ensure_ascii=False,
    )


def completion_for(row: dict[str, Any]) -> str:
    outcome = row["outcome"]
    status = outcome["status"]
    result = {
        "status": status,
        "confidence": outcome["confidence"],
        "claimSuccess": status == "SUCCESS",
        "authority": False,
    }
    if status == "FAILURE":
        result["next"] = "recover_or_compensate_if_authorized"
    elif status == "UNKNOWN":
        result["next"] = "collect_more_independent_evidence"
    else:
        result["next"] = "settle_verified_success"
    return json.dumps(result, separators=(",", ":"), ensure_ascii=False)


def rejected_completion(row: dict[str, Any]) -> str:
    status = row["outcome"]["status"]
    wrong = "SUCCESS" if status in {"FAILURE", "UNKNOWN"} else "UNKNOWN"
    return json.dumps(
        {
            "status": wrong,
            "claimSuccess": wrong == "SUCCESS",
            "authority": False,
            "error": "ignores verified consequence evidence",
        },
        separators=(",", ":"),
        ensure_ascii=False,
    )


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
    }


def stage_records(row: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    prompt = prompt_for(row)
    chosen = completion_for(row)
    rejected = rejected_completion(row)
    base = {
        "trajectoryId": row["trajectoryId"],
        "trajectoryDigest": row["digest"],
        "authority": False,
        "outcomeStatus": row["outcome"]["status"],
        "learningLabel": row["learning"]["label"],
        "trainingScope": row.get("learning", {}).get("trainingScope", "OUTCOME_PROOF"),
        "eligibleAgenticRl": bool(row.get("learning", {}).get("eligibleAgenticRl", False)),
    }
    return {
        "sft": [{**base, "prompt": prompt, "completion": chosen}],
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

    input_path = Path(args.input)
    if not input_path.exists():
        raise SystemExit(f"trajectory JSONL not found: {input_path}. Run the preceding consequence-learning step successfully first.")
    rows = load_jsonl(args.input)
    if not rows:
        raise SystemExit("no verified consequence trajectories available for dataset generation")
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
