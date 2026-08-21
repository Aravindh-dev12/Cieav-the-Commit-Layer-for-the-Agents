from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class VerifierError(RuntimeError):
    pass


@dataclass(frozen=True)
class CieavVerifierClient:
    base_url: str
    token: str
    timeout_seconds: float = 10.0

    def __post_init__(self) -> None:
        if not self.base_url.startswith("http://127.0.0.1:"):
            raise VerifierError("CIEAV verifier must be loopback-only")
        if len(self.token) < 32:
            raise VerifierError("CIEAV verifier token must be at least 32 characters")
        if self.timeout_seconds <= 0:
            raise VerifierError("CIEAV verifier timeout must be positive")

    def _request(self, path: str, payload: dict[str, Any] | None = None, *, method: str = "POST") -> dict[str, Any]:
        data = None if payload is None else json.dumps(payload, separators=(",", ":")).encode("utf-8")
        req = Request(
            self.base_url.rstrip("/") + path,
            data=data,
            headers={"accept": "application/json", "content-type": "application/json", "authorization": f"Bearer {self.token}"},
            method=method,
        )
        try:
            with urlopen(req, timeout=self.timeout_seconds) as response:
                raw = response.read(2_000_001)
                if len(raw) > 2_000_000:
                    raise VerifierError("CIEAV verifier response exceeded size limit")
                value = json.loads(raw.decode("utf-8") or "{}")
        except HTTPError as exc:
            detail = exc.read(4096).decode("utf-8", errors="replace")
            raise VerifierError(f"CIEAV verifier HTTP {exc.code}: {detail[:1000]}") from exc
        except (URLError, TimeoutError, OSError) as exc:
            raise VerifierError(f"CIEAV verifier unavailable: {exc}") from exc
        if not isinstance(value, dict):
            raise VerifierError("CIEAV verifier returned a non-object response")
        return value

    def health(self) -> dict[str, Any]:
        value = self._request("/health", method="GET")
        if value.get("ok") is not True or value.get("authority") is not False or value.get("protocol") != "CIEAV_ML_VERIFIER_V1":
            raise VerifierError("CIEAV verifier health contract mismatch")
        return value

    def score_decision(self, expectation: dict[str, Any], candidate: dict[str, Any], process: dict[str, Any] | None = None) -> dict[str, Any]:
        return self._request("/v1/reward/decision", {"expectation": expectation, "candidate": candidate, "process": process})

    def score_trajectory(self, steps: list[dict[str, Any]], policy: dict[str, Any]) -> dict[str, Any]:
        return self._request("/v1/reward/trajectory", {"steps": steps, "policy": policy})

    def evaluate_promotion(self, samples: list[dict[str, Any]], thresholds: dict[str, Any] | None = None) -> dict[str, Any]:
        payload: dict[str, Any] = {"samples": samples}
        if thresholds is not None:
            payload["thresholds"] = thresholds
        return self._request("/v1/promotion", payload)

    def evaluate_verifier_bank(self, rows: list[dict[str, Any]], max_generalization_gap: float = 0.2) -> dict[str, Any]:
        return self._request("/v1/verifier-bank", {"rows": rows, "maxGeneralizationGap": max_generalization_gap})

    def evaluate_reward_gap(self, samples: list[dict[str, Any]], max_mean_gap: float = 0.15, max_single_gap: float = 0.4) -> dict[str, Any]:
        return self._request("/v1/reward-gap", {"samples": samples, "maxMeanGap": max_mean_gap, "maxSingleGap": max_single_gap})

    def prioritize_failures(self, rows: list[dict[str, Any]], limit: int = 100) -> list[dict[str, Any]]:
        value = self._request("/v1/failures/prioritize", {"rows": rows, "limit": limit})
        priorities = value.get("priorities")
        if not isinstance(priorities, list):
            raise VerifierError("CIEAV failure-priority response is invalid")
        return priorities

    def verify_perturbations(self, rows: list[dict[str, Any]]) -> dict[str, Any]:
        value = self._request("/v1/perturbations/verify", {"rows": rows})
        if not isinstance(value.get("results"), list) or not isinstance(value.get("summary"), dict):
            raise VerifierError("CIEAV perturbation response is invalid")
        return value
