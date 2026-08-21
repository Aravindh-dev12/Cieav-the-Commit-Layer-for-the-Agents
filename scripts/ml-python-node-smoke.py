#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ml"))

from cieav_rlvr import NodeVerifierProcess


def main() -> int:
    with NodeVerifierProcess(ROOT) as verifier:
        health = verifier.health()
        assert health["authority"] is False
        result = verifier.score_decision(
            {
                "actionTypes": ["financial.commit"],
                "risk": "CRITICAL",
                "reversibility": "COMPENSABLE",
                "requireVerifier": True,
                "shouldAbstain": False,
            },
            {
                "actionType": "financial.commit",
                "risk": "CRITICAL",
                "reversibility": "COMPENSABLE",
                "confidence": 0.9,
                "verifierUsed": True,
                "explanation": "High-impact financial commit requiring deterministic verification.",
                "evidence": ["deterministic-verifier"],
                "warnings": [],
                "exposedData": [],
            },
        )
        assert isinstance(result.get("score"), (int, float))
        assert result.get("hardFailure") is False
    print("CIEAV Python↔Node RLVR boundary PASS · Python orchestrates ML; Node verifier authority=false")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
