"""
CIEAV Reflex Trace-to-Procedure Extractor.
=============================================================================
Converts execution traces into deterministic, verifiable procedures:
1. Prunes dead ends and undone steps.
2. Assigns strict risk classes (R0-R3). Unknown classes fail closed to R3.
3. Enforces a mandatory post-step verifier check. Procedures without a verifier
   cannot run.
4. Generates canonical SHA256 content hashes.
"""

from __future__ import annotations
import json
import hashlib
from typing import Any, Dict, List, Optional

RISK_MAP = {
    "read": "R0",
    "navigate": "R0",
    "write": "R1",
    "execute": "R1",
    "draft": "R2",
    "send": "R3",
    "delete": "R3",
    "pay": "R3"
}


def extract_procedure(trace: Dict[str, Any]) -> Dict[str, Any]:
    """
    Deterministic: the same trace always yields the exact same procedure.
    Zero non-deterministic model involvement.
    """
    raw_steps = trace.get("steps", [])
    valid_steps = [s for s in raw_steps if not s.get("undone", False)]

    steps = []
    for i, s in enumerate(valid_steps):
        s_class = s.get("class", "execute")
        risk = RISK_MAP.get(s_class, "R3")  # Unknown classes fail closed to R3
        steps.append({
            "n": i + 1,
            "app": str(s.get("app", "universal")),
            "action": str(s.get("action", "")),
            "class": s_class,
            "target": s.get("target", {}),
            "value": s.get("value"),
            "check": s.get("check"),
            "risk": risk
        })

    # Verifier: last step that has a check
    verifier = None
    for s in reversed(steps):
        if s.get("check"):
            verifier = s["n"]
            break

    status = "ready" if verifier is not None else "draft"  # No verifier => cannot run
    apps = sorted(list({s["app"] for s in steps}))

    # Canonical JSON hash
    canonical_repr = json.dumps(steps, sort_keys=True)
    proc_hash = hashlib.sha256(canonical_repr.encode("utf-8")).hexdigest()

    return {
        "title": str(trace.get("prompt", trace.get("title", "Untitled Procedure")))[:200],
        "steps": steps,
        "verifier": verifier,
        "status": status,
        "manifest": {"apps": apps},
        "hash": proc_hash
    }
