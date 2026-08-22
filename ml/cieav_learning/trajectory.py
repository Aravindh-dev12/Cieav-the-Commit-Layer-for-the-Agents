"""Authority-free learning records for verified CIEAV consequences.

This module intentionally has no execution authority. It accepts already-finalized,
redacted evidence and converts it into a deterministic learning trajectory. It must
never receive raw credentials, cookies, bearer tokens, private keys, or signing
material.
"""
from __future__ import annotations

import hashlib
import json
import re
import uuid
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Iterable, Mapping

KIND = "CIEAV_AUTHORIZED_OUTCOME_TRAJECTORY_V1"
OUTCOME_MAP = {
    "SUCCESS": "SUCCESS",
    "OBSERVED_SUCCESS": "SUCCESS",
    "FAILURE": "FAILURE",
    "OBSERVED_FAILURE": "FAILURE",
    "UNKNOWN": "UNKNOWN",
}
_SECRET_KEY = re.compile(
    r"(?:^|[_-])(authorization|cookie|password|passwd|secret|token|api[_-]?key|"
    r"private[_-]?key|client[_-]?secret|access[_-]?key|refresh[_-]?token)(?:$|[_-])",
    re.IGNORECASE,
)
_BEARER = re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._~+/=-]{8,}")
_PEM = re.compile(r"-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----", re.IGNORECASE)
_MAX_STRING = 4000
_MAX_LIST = 64
_MAX_DEPTH = 8


class TrajectoryError(ValueError):
    pass


def canonical_json(value: Any) -> str:
    if isinstance(value, list):
        return "[" + ",".join(canonical_json(v) for v in value) + "]"
    if isinstance(value, dict):
        return "{" + ",".join(
            json.dumps(str(k), separators=(",", ":")) + ":" + canonical_json(value[k])
            for k in sorted(value, key=str)
        ) + "}"
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False)


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _scrub_string(value: str) -> str:
    value = _BEARER.sub("[REDACTED_BEARER]", value)
    if _PEM.search(value):
        return "[REDACTED_PRIVATE_KEY]"
    return value[:_MAX_STRING]


def scrub(value: Any, *, depth: int = 0) -> Any:
    if depth > _MAX_DEPTH:
        return "[TRUNCATED_DEPTH]"
    if isinstance(value, Mapping):
        out: dict[str, Any] = {}
        for raw_key, raw_value in list(value.items())[:_MAX_LIST]:
            key = str(raw_key)
            if _SECRET_KEY.search(key.replace(" ", "_")):
                out[key] = "[REDACTED]"
            else:
                out[key] = scrub(raw_value, depth=depth + 1)
        return out
    if isinstance(value, (list, tuple)):
        return [scrub(v, depth=depth + 1) for v in list(value)[:_MAX_LIST]]
    if isinstance(value, str):
        return _scrub_string(value)
    if value is None or isinstance(value, (bool, int, float)):
        return value
    return _scrub_string(str(value))


def _digest_or_none(value: Any) -> str | None:
    if value in (None, "", [], {}):
        return None
    if isinstance(value, str) and re.fullmatch(r"[0-9a-fA-F]{64}", value):
        return value.lower()
    return sha256_json(scrub(value))


def _require_text(raw: Mapping[str, Any], name: str, *, fallback: str | None = None) -> str:
    value = raw.get(name, fallback)
    if value is None or not str(value).strip():
        raise TrajectoryError(f"{name} is required")
    return str(value).strip()[:512]


def _outcome(raw: Mapping[str, Any]) -> dict[str, Any]:
    status_raw = str(raw.get("status", "UNKNOWN")).upper()
    status = OUTCOME_MAP.get(status_raw)
    if not status:
        raise TrajectoryError(f"unsupported outcome status: {status_raw}")
    confidence = float(raw.get("confidence", 0.0 if status == "UNKNOWN" else 1.0))
    confidence = max(0.0, min(1.0, confidence))
    evidence = []
    for item in list(raw.get("evidence") or [])[:32]:
        if not isinstance(item, Mapping):
            continue
        kind = str(item.get("kind", "OTHER"))[:80]
        summary = _scrub_string(str(item.get("summary", "")))
        safe_detail = scrub(item.get("detail")) if "detail" in item else None
        entry = {
            "kind": kind,
            "summary": summary,
            "digest": _digest_or_none(
                item.get("digest") or {"kind": kind, "summary": summary, "detail": safe_detail}
            ),
        }
        evidence.append(entry)
    return {
        "status": status,
        "confidence": confidence,
        "observedAt": str(raw.get("observedAt") or _utc_now()),
        "evidence": evidence,
    }


def _learning_contract(status: str) -> dict[str, Any]:
    if status == "SUCCESS":
        label, eligible, reason = "POSITIVE", True, "verified_success"
    elif status == "FAILURE":
        label, eligible, reason = "NEGATIVE", True, "verified_failure"
    else:
        label, eligible, reason = "UNCERTAIN", True, "unknown_is_training_signal_not_success"
    return {
        "authority": False,
        "eligible": eligible,
        "label": label,
        "reason": reason,
        "mayMintPermit": False,
        "mayCommitAction": False,
        "mayAuthorizeUndo": False,
        "requiresIndependentPromotion": True,
    }


def build_trajectory(raw: Mapping[str, Any]) -> dict[str, Any]:
    """Build and seal a learning-only consequence trajectory.

    Expected input is a normalized authority/runtime export, not arbitrary raw logs.
    Raw secret-bearing values are scrubbed before any field is retained.
    """
    if bool(raw.get("authority")) or bool(raw.get("productionAuthority")):
        raise TrajectoryError("learning input must not carry execution authority")

    subject = raw.get("subject") if isinstance(raw.get("subject"), Mapping) else {}
    action = raw.get("action") if isinstance(raw.get("action"), Mapping) else {}
    authorization = raw.get("authorization") if isinstance(raw.get("authorization"), Mapping) else {}
    reality = raw.get("reality") if isinstance(raw.get("reality"), Mapping) else {}
    execution = raw.get("execution") if isinstance(raw.get("execution"), Mapping) else {}
    outcome_raw = raw.get("outcome") if isinstance(raw.get("outcome"), Mapping) else {}
    recovery = raw.get("recovery") if isinstance(raw.get("recovery"), Mapping) else {}

    outcome = _outcome(outcome_raw)
    decision = str(authorization.get("decision", "ALLOW")).upper()
    if decision != "ALLOW":
        raise TrajectoryError("only explicitly allowed execution trajectories may enter consequence learning")

    trajectory = {
        "schemaVersion": 1,
        "kind": KIND,
        "authority": False,
        "productionAuthority": False,
        "trajectoryId": str(raw.get("trajectoryId") or f"aot_{uuid.uuid4()}"),
        "createdAt": str(raw.get("createdAt") or _utc_now()),
        "subject": {
            "subjectId": _require_text(subject, "subjectId", fallback="unknown-subject"),
            "agentId": _require_text(subject, "agentId", fallback="unknown-agent"),
            "sessionId": str(subject.get("sessionId") or "")[:512] or None,
            "modelProvider": str(subject.get("modelProvider") or "unknown")[:160],
            "modelFamily": str(subject.get("modelFamily") or "unknown")[:160],
            "checkpointDigest": _digest_or_none(subject.get("checkpointDigest")),
            "identityAttestationDigest": _digest_or_none(
                subject.get("identityAttestationDigest") or subject.get("identityAttestationId")
            ),
        },
        "task": {
            "taskId": _require_text(raw, "taskId", fallback="unknown-task"),
            "intentId": _require_text(raw, "intentId", fallback="unknown-intent"),
            "intentDigest": _digest_or_none(raw.get("intentDigest") or raw.get("intentId")),
        },
        "action": {
            "toolId": _require_text(action, "toolId", fallback="unknown-tool"),
            "protocol": str(action.get("protocol") or "unknown")[:80],
            "operation": _require_text(action, "operation", fallback="unknown-operation"),
            "risk": str(action.get("risk") or "UNKNOWN").upper()[:32],
            "semanticEffect": scrub(action.get("semanticEffect") or {}),
            "argumentsDigest": _digest_or_none(action.get("argumentsDigest") or action.get("arguments")),
        },
        "authorization": {
            "decision": "ALLOW",
            "permissionGraphDigest": _digest_or_none(
                authorization.get("permissionGraphDigest") or authorization.get("graphDigest")
            ),
            "credentialLeaseDigest": _digest_or_none(
                authorization.get("credentialLeaseDigest") or authorization.get("credentialLeaseId")
            ),
            "realityBoundCommitId": str(authorization.get("realityBoundCommitId") or "")[:512] or None,
            "executionTicketId": str(authorization.get("executionTicketId") or "")[:512] or None,
            "executionBindingDigest": _digest_or_none(authorization.get("executionBindingDigest")),
        },
        "reality": {
            "preStateDigest": _digest_or_none(reality.get("preStateDigest") or reality.get("preState")),
            "expectedPostStateDigest": _digest_or_none(
                reality.get("expectedPostStateDigest") or reality.get("expectedPostState")
            ),
            "proofObligationDigest": _digest_or_none(
                reality.get("proofObligationDigest") or reality.get("proofObligation")
            ),
        },
        "execution": {
            "startedAt": str(execution.get("startedAt") or "")[:80] or None,
            "finishedAt": str(execution.get("finishedAt") or "")[:80] or None,
            "effectDigest": _digest_or_none(execution.get("effectDigest") or execution.get("effect")),
            "receiptDigest": _digest_or_none(execution.get("receiptDigest") or execution.get("receipt")),
        },
        "outcome": outcome,
        "recovery": {
            "attempted": bool(recovery.get("attempted", False)),
            "status": str(recovery.get("status") or "NOT_REQUIRED")[:80],
            "undoVerified": bool(recovery.get("undoVerified", False)),
            "evidenceDigest": _digest_or_none(recovery.get("evidenceDigest") or recovery.get("evidence")),
        },
        "learning": _learning_contract(outcome["status"]),
    }
    sealed = deepcopy(trajectory)
    sealed["digestAlgorithm"] = "SHA-256"
    sealed["digest"] = sha256_json(trajectory)
    return sealed


def verify_trajectory(value: Mapping[str, Any]) -> None:
    if value.get("kind") != KIND or int(value.get("schemaVersion", 0)) != 1:
        raise TrajectoryError("trajectory contract mismatch")
    if value.get("authority") is not False or value.get("productionAuthority") is not False:
        raise TrajectoryError("learning trajectory must be authority=false")
    learning = value.get("learning")
    if not isinstance(learning, Mapping) or learning.get("authority") is not False:
        raise TrajectoryError("learning plane authority boundary missing")
    for key in ("mayMintPermit", "mayCommitAction", "mayAuthorizeUndo"):
        if learning.get(key) is not False:
            raise TrajectoryError(f"learning plane invariant violated: {key}")
    digest = str(value.get("digest") or "")
    unsigned = {k: deepcopy(v) for k, v in value.items() if k not in {"digestAlgorithm", "digest"}}
    expected = sha256_json(unsigned)
    if digest != expected:
        raise TrajectoryError("trajectory digest mismatch")
    status = str((value.get("outcome") or {}).get("status", ""))
    if status not in {"SUCCESS", "FAILURE", "UNKNOWN"}:
        raise TrajectoryError("invalid normalized outcome")


def load_jsonl(path: str) -> list[dict[str, Any]]:
    rows = []
    with open(path, "r", encoding="utf-8") as handle:
        for line_no, line in enumerate(handle, 1):
            if not line.strip():
                continue
            try:
                value = json.loads(line)
            except json.JSONDecodeError as exc:
                raise TrajectoryError(f"{path}:{line_no}: invalid JSON") from exc
            if not isinstance(value, dict):
                raise TrajectoryError(f"{path}:{line_no}: object required")
            verify_trajectory(value)
            rows.append(value)
    return rows


def dump_jsonl(path: str, rows: Iterable[Mapping[str, Any]]) -> None:
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        for row in rows:
            verify_trajectory(row)
            handle.write(json.dumps(row, separators=(",", ":"), ensure_ascii=False) + "\n")
