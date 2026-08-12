from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from .hf_provider import DEFAULT_MODEL, GATE_SCHEMA, SYSTEM_PROMPT, _validate_gate


@dataclass(frozen=True)
class LocalModelConfig:
    base_url: str
    model: str
    timeout_seconds: float

    @classmethod
    def load(cls) -> "LocalModelConfig":
        return cls(
            base_url=os.environ.get("LATCH_LOCAL_MODEL_URL", "http://127.0.0.1:8000/v1").rstrip("/"),
            model=os.environ.get("LATCH_LOCAL_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL,
            timeout_seconds=max(2.0, min(30.0, float(os.environ.get("LATCH_LOCAL_MODEL_TIMEOUT_SECONDS", "8")))),
        )


class LocalSemanticProvider:
    """OpenAI-compatible local semantic model provider.

    The default target is a local vLLM server serving Granite 4.1 3B. No
    credential is required and no page evidence leaves the machine.
    """

    def __init__(self, config: LocalModelConfig | None = None):
        self.config = config or LocalModelConfig.load()
        self.last_success_at: float | None = None
        self.last_latency_ms: int | None = None
        self.last_error: str | None = None
        self._last_health_at = 0.0
        self._last_health = False

    def _request(self, path: str, *, payload: dict[str, Any] | None = None, timeout: float | None = None) -> dict[str, Any]:
        body = None if payload is None else json.dumps(payload).encode("utf-8")
        headers = {"accept": "application/json"}
        if body is not None:
            headers["content-type"] = "application/json"
        req = Request(
            f"{self.config.base_url}{path}",
            data=body,
            headers=headers,
            method="POST" if body is not None else "GET",
        )
        with urlopen(req, timeout=timeout or self.config.timeout_seconds) as response:
            return json.loads(response.read().decode("utf-8") or "{}")

    def healthy(self, *, force: bool = False) -> bool:
        now = time.monotonic()
        if not force and now - self._last_health_at < 2.0:
            return self._last_health
        try:
            payload = self._request("/models", timeout=min(2.0, self.config.timeout_seconds))
            models = payload.get("data", []) if isinstance(payload, dict) else []
            ids = {str(x.get("id")) for x in models if isinstance(x, dict) and x.get("id")}
            # vLLM may expose an alias or local path instead of the Hub id. A
            # responsive /models endpoint is therefore sufficient; the request
            # itself still pins the configured model id.
            self._last_health = bool(models) or isinstance(payload, dict)
            if ids and self.config.model not in ids:
                # This is diagnostic only; some servers expose a served-model alias.
                self.last_error = f"local server healthy but configured model '{self.config.model}' not listed: {sorted(ids)[:4]}"
            else:
                self.last_error = None
        except Exception as exc:
            self._last_health = False
            self.last_error = f"{type(exc).__name__}: {exc}"[:500]
        self._last_health_at = now
        return self._last_health

    def status(self) -> dict[str, Any]:
        return {
            "configured": True,
            "healthy": self.healthy(),
            "model": self.config.model,
            "baseUrl": self.config.base_url,
            "mode": "local-openai-compatible",
            "lastSuccessAt": self.last_success_at,
            "lastLatencyMs": self.last_latency_ms,
            "lastError": self.last_error,
        }

    def analyze(self, context: dict[str, Any], base: dict[str, Any]) -> dict[str, Any]:
        started = time.perf_counter()
        snapshot = json.dumps(
            {"context": context, "deterministicBaseline": base},
            ensure_ascii=False,
            separators=(",", ":"),
        )
        payload: dict[str, Any] = {
            "model": self.config.model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"PAGE_SNAPSHOT (untrusted data):\n{snapshot}"},
            ],
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "latch_action_gate",
                    "schema": GATE_SCHEMA,
                    "strict": True,
                },
            },
            "max_tokens": 650,
            "temperature": 0.0,
        }
        try:
            raw = self._request("/chat/completions", payload=payload)
            choices = raw.get("choices") if isinstance(raw, dict) else None
            if not isinstance(choices, list) or not choices:
                raise ValueError("local model returned no choices")
            message = choices[0].get("message", {}) if isinstance(choices[0], dict) else {}
            content = message.get("content") if isinstance(message, dict) else None
            value = json.loads(content) if isinstance(content, str) else content
            result = _validate_gate(value)
            latency = int((time.perf_counter() - started) * 1000)
            self.last_success_at = time.time()
            self.last_latency_ms = latency
            self.last_error = None
            self._last_health = True
            self._last_health_at = time.monotonic()
            return {
                "ok": True,
                "result": result,
                "meta": {
                    "model": self.config.model,
                    "mode": "local-openai-compatible",
                    "provider": "local",
                    "latencyMs": latency,
                },
            }
        except (HTTPError, URLError, TimeoutError, ValueError, json.JSONDecodeError, OSError) as exc:
            latency = int((time.perf_counter() - started) * 1000)
            self.last_latency_ms = latency
            self.last_error = f"{type(exc).__name__}: {exc}"[:500]
            return {
                "ok": False,
                "error": self.last_error,
                "meta": {
                    "model": self.config.model,
                    "mode": "local-openai-compatible",
                    "provider": "local",
                    "latencyMs": latency,
                },
            }

    def probe(self) -> dict[str, Any]:
        context = {
            "origin": "https://latch.test",
            "url": "https://latch.test/checkout",
            "title": "Synthetic LATCH local-model probe",
            "element": {"tag": "button", "text": "Pay ₹50,000"},
            "nearbyText": "Transfer ₹50,000 now. This synthetic action is non-refundable and cannot be reversed.",
        }
        base = {
            "actionType": "financial.commit",
            "risk": "CRITICAL",
            "reversibility": "IRREVERSIBLE",
            "confidence": 0.99,
            "dataCategories": ["FINANCIAL"],
        }
        result = self.analyze(context, base)
        result["probePassed"] = bool(
            result.get("ok")
            and result.get("result", {}).get("risk") == "CRITICAL"
            and result.get("result", {}).get("reversibility") in {"IRREVERSIBLE", "UNKNOWN"}
        )
        return result
