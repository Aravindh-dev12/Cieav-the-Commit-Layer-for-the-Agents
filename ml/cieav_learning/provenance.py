"""Provenance-aware consequence trajectories.

Receipt-derived evidence is useful for outcome/proof learning, but it is not the same
thing as a complete execution-fabric authorization chain. This module keeps that
boundary explicit and cryptographically sealed into the trajectory.
"""
from __future__ import annotations

from copy import deepcopy
from typing import Any, Mapping

from .trajectory import TrajectoryError, build_trajectory, sha256_json

_REQUIRED_AUTHORITY_FIELDS = (
    ("authorization", "permissionGraphDigest"),
    ("authorization", "credentialLeaseDigest"),
    ("authorization", "realityBoundCommitId"),
    ("authorization", "executionTicketId"),
    ("authorization", "executionBindingDigest"),
    ("reality", "preStateDigest"),
    ("reality", "expectedPostStateDigest"),
    ("reality", "proofObligationDigest"),
)


def _provenance(raw: Mapping[str, Any]) -> dict[str, Any]:
    value = raw.get("provenance") if isinstance(raw.get("provenance"), Mapping) else {}
    authority_grade = bool(value.get("authorityGrade", False))
    reality_bound = bool(value.get("realityBound", False))
    cryptographically_verified = bool(value.get("cryptographicallyVerified", False))
    return {
        "sourceKind": str(value.get("sourceKind") or "UNSPECIFIED")[:120],
        "evidenceClass": str(value.get("evidenceClass") or "NORMALIZED_EXECUTION")[:120],
        "cryptographicallyVerified": cryptographically_verified,
        "authorityGrade": authority_grade,
        "realityBound": reality_bound,
        "sourceDigest": str(value.get("sourceDigest") or "")[:128] or None,
    }


def build_provenanced_trajectory(raw: Mapping[str, Any]) -> dict[str, Any]:
    provenance = _provenance(raw)
    complete = bool((raw.get("authorization") or {}).get("complete", False)) if isinstance(raw.get("authorization"), Mapping) else False
    if provenance["authorityGrade"]:
        if not provenance["cryptographicallyVerified"] or not provenance["realityBound"] or not complete:
            raise TrajectoryError("authority-grade learning evidence must be cryptographically verified, reality-bound, and complete")
        for section, field in _REQUIRED_AUTHORITY_FIELDS:
            value = raw.get(section)
            if not isinstance(value, Mapping) or not value.get(field):
                raise TrajectoryError(f"authority-grade learning evidence missing {section}.{field}")

    trajectory = build_trajectory(raw)
    unsigned = {k: deepcopy(v) for k, v in trajectory.items() if k not in {"digestAlgorithm", "digest"}}
    unsigned["provenance"] = provenance
    learning = dict(unsigned.get("learning") or {})
    eligible_agentic = bool(provenance["authorityGrade"] and provenance["realityBound"] and complete)
    learning.update({
        "trainingScope": "AUTHORITY_AND_OUTCOME" if eligible_agentic else "OUTCOME_PROOF",
        "eligibleAgenticRl": eligible_agentic,
        "authorityEvidenceComplete": complete,
    })
    unsigned["learning"] = learning
    return {**unsigned, "digestAlgorithm": "SHA-256", "digest": sha256_json(unsigned)}


def verify_provenance_boundary(value: Mapping[str, Any]) -> None:
    provenance = value.get("provenance")
    learning = value.get("learning")
    if not isinstance(provenance, Mapping) or not isinstance(learning, Mapping):
        raise TrajectoryError("provenance-aware trajectory metadata missing")
    expected = bool(
        provenance.get("authorityGrade") is True
        and provenance.get("realityBound") is True
        and learning.get("authorityEvidenceComplete") is True
    )
    if learning.get("eligibleAgenticRl") is not expected:
        raise TrajectoryError("agentic-RL eligibility does not match provenance boundary")
    if not expected and learning.get("trainingScope") != "OUTCOME_PROOF":
        raise TrajectoryError("non-authority-grade evidence must be restricted to OUTCOME_PROOF training")
