#!/usr/bin/env python3
"""Smoke test the CIEAV consequence-learning boundary without ML dependencies."""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ml"))

from cieav_learning import (
    assert_authority_boundary,
    build_trajectory,
    dump_jsonl,
    list_providers,
    load_jsonl,
    verify_trajectory,
)


def fixture(status: str, idx: int) -> dict:
    return {
        "authority": False,
        "trajectoryId": f"fixture-{status.lower()}-{idx}",
        "taskId": f"task-{idx}",
        "intentId": "send-approved-change",
        "subject": {
            "subjectId": "user-fixture",
            "agentId": "agent-fixture",
            "modelProvider": "local",
            "modelFamily": "fixture",
            "identityAttestationId": "attestation-fixture",
        },
        "action": {
            "toolId": "browser",
            "protocol": "MCP",
            "operation": "submit",
            "risk": "HIGH",
            "arguments": {
                "target": "https://example.invalid",
                "authorization_token": "super-secret-token",
                "note": "Bearer should-not-survive-1234567890",
            },
            "semanticEffect": {"type": "write", "resource": "fixture"},
        },
        "authorization": {
            "decision": "ALLOW",
            "graphDigest": "a" * 64,
            "credentialLeaseId": "lease-fixture",
            "realityBoundCommitId": "commit-fixture",
            "executionTicketId": "ticket-fixture",
            "executionBindingDigest": "b" * 64,
        },
        "reality": {
            "preStateDigest": "c" * 64,
            "expectedPostStateDigest": "d" * 64,
            "proofObligationDigest": "e" * 64,
        },
        "execution": {
            "effect": {"httpStatus": 200 if status == "SUCCESS" else 500},
            "receipt": {"id": f"receipt-{idx}"},
        },
        "outcome": {
            "status": status,
            "confidence": 0.97 if status != "UNKNOWN" else 0.2,
            "evidence": [
                {"kind": "NETWORK", "summary": "fixture evidence", "detail": {"cookie": "never-export"}},
            ],
        },
        "recovery": {
            "attempted": status == "FAILURE",
            "status": "VERIFIED" if status == "FAILURE" else "NOT_REQUIRED",
            "undoVerified": status == "FAILURE",
        },
    }


def main() -> None:
    assert_authority_boundary()
    providers = list_providers()
    required = {
        "cieav-browser-proof",
        "reticle-mcp-proof",
        "trl-peft",
        "verl-ray",
        "vllm-rollout",
        "sglang-rollout",
        "river-learning",
    }
    found = {p["id"] for p in providers}
    if not required.issubset(found):
        raise SystemExit(f"provider registry incomplete: {sorted(required - found)}")
    if any(p["authority"] for p in providers):
        raise SystemExit("a proof/learning provider gained authority")

    rows = [build_trajectory(fixture(status, i)) for i, status in enumerate(("SUCCESS", "FAILURE", "UNKNOWN"), 1)]
    for row in rows:
        verify_trajectory(row)
        if row["authority"] is not False or row["learning"]["authority"] is not False:
            raise SystemExit("trajectory authority boundary violated")
    serialized = json.dumps(rows)
    for forbidden in ("super-secret-token", "should-not-survive", "never-export"):
        if forbidden in serialized:
            raise SystemExit(f"secret redaction failed: {forbidden}")

    with tempfile.TemporaryDirectory(prefix="cieav-consequence-learning-") as td:
        tmp = Path(td)
        src = tmp / "trajectories.jsonl"
        out = tmp / "dataset"
        dump_jsonl(str(src), rows)
        reloaded = load_jsonl(str(src))
        if len(reloaded) != 3:
            raise SystemExit("trajectory JSONL round-trip failed")
        subprocess.run(
            [sys.executable, str(ROOT / "ml" / "build_consequence_dataset.py"), "--input", str(src), "--output-dir", str(out)],
            cwd=ROOT,
            check=True,
        )
        manifest = json.loads((out / "manifest.json").read_text("utf-8"))
        if manifest.get("authority") is not False:
            raise SystemExit("dataset manifest must remain authority=false")
        all_text = "".join(path.read_text("utf-8") for path in out.rglob("*.jsonl"))
        if '"authorizedOutcome":"UNKNOWN"' not in all_text or '"unknownMustRemainUnknown":true' not in all_text:
            raise SystemExit("UNKNOWN outcome semantics were lost")
        if '"label":false' not in all_text:
            raise SystemExit("KTO negative example missing")
        if '"requiresFreshModelRollout":true' not in all_text:
            raise SystemExit("GRPO fresh-rollout invariant missing")

    print(
        "CIEAV consequence-learning smoke PASS - verified outcomes -> redacted authority=false trajectories -> "
        "SFT/DPO/KTO/GRPO datasets + optional Reticle/River provider surfaces"
    )


if __name__ == "__main__":
    main()
