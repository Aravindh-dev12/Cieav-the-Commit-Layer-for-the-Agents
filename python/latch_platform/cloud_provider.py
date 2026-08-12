from __future__ import annotations

import json
import os
import platform
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def _env(primary: str, legacy: str | None = None, default: str = "") -> str:
    value = os.environ.get(primary, "").strip()
    if value:
        return value
    if legacy:
        value = os.environ.get(legacy, "").strip()
        if value:
            return value
    return default


def _state_dir() -> Path:
    configured = _env("CIEAV_STATE_DIR", "LATCH_STATE_DIR")
    if configured:
        return Path(configured).expanduser().resolve()
    cieav = (Path.home() / ".cieav").resolve()
    legacy = (Path.home() / ".latch").resolve()
    return legacy if legacy.exists() and not cieav.exists() else cieav


def _private_write(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value, "utf-8")
    try:
        os.chmod(path.parent, 0o700)
        os.chmod(path, 0o600)
    except OSError:
        pass


def _read(path: Path) -> str | None:
    try:
        value = path.read_text("utf-8").strip()
        return value or None
    except (FileNotFoundError, OSError):
        return None


@dataclass(frozen=True)
class CloudConfig:
    base_url: str | None
    timeout_seconds: float
    state_dir: Path
    client_version: str

    @classmethod
    def load(cls) -> "CloudConfig":
        url = _env("CIEAV_CLOUD_URL", "LATCH_CLOUD_URL").rstrip("/") or None
        return cls(
            base_url=url,
            timeout_seconds=max(2.0, min(20.0, float(_env("CIEAV_CLOUD_TIMEOUT_SECONDS", "LATCH_CLOUD_TIMEOUT_SECONDS", "8")))),
            state_dir=_state_dir(),
            client_version=_env("CIEAV_VERSION", "LATCH_VERSION", "0.7.0"),
        )


class CloudSemanticProvider:
    """Privacy-minimized semantic inference client for CIEAV Cloud."""

    def __init__(self, config: CloudConfig | None = None):
        self.config = config or CloudConfig.load()
        self.install_id_file = self.config.state_dir / "install-id"
        self.device_token_file = self.config.state_dir / "cloud-device-token"
        self.last_success_at: float | None = None
        self.last_latency_ms: int | None = None
        self.last_error: str | None = None
        self.last_model: str | None = None

    @property
    def configured(self) -> bool:
        return bool(self.config.base_url)

    def _install_id(self) -> str:
        existing = _read(self.install_id_file)
        if existing:
            return existing
        value = str(uuid.uuid4())
        _private_write(self.install_id_file, value)
        return value

    def _token(self) -> str | None:
        return _env("CIEAV_CLOUD_TOKEN", "LATCH_CLOUD_TOKEN") or _read(self.device_token_file)

    def _request(self, path: str, *, payload: dict[str, Any] | None = None, token: str | None = None, timeout: float | None = None) -> dict[str, Any]:
        if not self.config.base_url:
            raise RuntimeError("CIEAV_CLOUD_URL is not configured")
        body = None if payload is None else json.dumps(payload, separators=(",", ":")).encode("utf-8")
        headers = {"accept": "application/json", "user-agent": f"CIEAV/{self.config.client_version}"}
        if body is not None:
            headers["content-type"] = "application/json"
        if token:
            headers["authorization"] = f"Bearer {token}"
        request = Request(f"{self.config.base_url}{path}", data=body, headers=headers, method="POST" if body is not None else "GET")
        try:
            with urlopen(request, timeout=timeout or self.config.timeout_seconds) as response:
                raw = response.read(262_145)
                if len(raw) > 262_144:
                    raise RuntimeError("CIEAV Cloud response exceeded size limit")
                value = json.loads(raw.decode("utf-8") or "{}")
                if not isinstance(value, dict):
                    raise RuntimeError("CIEAV Cloud returned a non-object response")
                return value
        except HTTPError as exc:
            raw = exc.read(4096).decode("utf-8", "replace")
            try:
                detail = json.loads(raw).get("error") or f"HTTP {exc.code}"
            except Exception:
                detail = f"HTTP {exc.code}"
            raise RuntimeError(str(detail)[:500]) from exc
        except URLError as exc:
            raise RuntimeError(f"CIEAV Cloud unavailable: {exc.reason}") from exc

    def enroll(self, *, force: bool = False) -> dict[str, Any]:
        if not self.configured:
            return {"ok": False, "error": "CIEAV_CLOUD_URL is not configured"}
        existing = None if force else self._token()
        if existing:
            return {"ok": True, "enrolled": True, "tokenStored": True}
        result = self._request("/v1/devices/register", payload={"installId": self._install_id(), "deviceName": f"CIEAV {platform.system()} {platform.machine()}"})
        token = result.get("token")
        if not isinstance(token, str) or len(token) < 32:
            raise RuntimeError("CIEAV Cloud did not issue a valid device token")
        _private_write(self.device_token_file, token)
        return {"ok": True, "enrolled": True, "deviceId": result.get("deviceId"), "expiresAt": result.get("expiresAt"), "tokenStored": True}

    def health(self) -> dict[str, Any]:
        if not self.configured:
            return {"ok": False, "configured": False, "error": "CIEAV_CLOUD_URL is not configured"}
        started = time.perf_counter()
        try:
            result = self._request("/health", timeout=min(3.0, self.config.timeout_seconds))
            return {"ok": bool(result.get("ok")), "configured": True, "baseUrl": self.config.base_url, "model": result.get("model"), "privacyMode": result.get("privacyMode"), "latencyMs": int((time.perf_counter() - started) * 1000)}
        except Exception as exc:
            return {"ok": False, "configured": True, "baseUrl": self.config.base_url, "error": f"{type(exc).__name__}: {exc}"[:500], "latencyMs": int((time.perf_counter() - started) * 1000)}

    def status(self) -> dict[str, Any]:
        health = self.health()
        return {"brand": "CIEAV", "configured": self.configured, "baseUrl": self.config.base_url, "enrolled": bool(self._token()), "healthy": bool(health.get("ok")), "model": health.get("model") or self.last_model, "privacyMode": health.get("privacyMode"), "lastSuccessAt": self.last_success_at, "lastLatencyMs": self.last_latency_ms, "lastError": self.last_error or health.get("error")}

    def analyze(self, context: dict[str, Any], base: dict[str, Any]) -> dict[str, Any]:
        started = time.perf_counter()
        if not self.configured:
            return {"ok": False, "error": "CIEAV_CLOUD_URL is not configured", "meta": {"tier": "cieav-cloud", "latencyMs": 0}}
        try:
            token = self._token()
            if not token:
                self.enroll()
                token = self._token()
            if not token:
                raise RuntimeError("CIEAV Cloud device enrollment failed")
            payload = {"context": context, "baseline": base, "privacy": {"rawFormValuesIncluded": False, "rawSecretsIncluded": False, "fullPageTextIncluded": False, "durableStorageRequested": False}}
            try:
                result = self._request("/v1/inference/analyze", payload=payload, token=token)
            except RuntimeError as first:
                if "unauthorized" not in str(first).lower() and "expired" not in str(first).lower():
                    raise
                self.enroll(force=True)
                result = self._request("/v1/inference/analyze", payload=payload, token=self._token())
            gate = result.get("result")
            if not isinstance(gate, dict):
                raise RuntimeError("CIEAV Cloud returned no semantic result")
            latency = int((time.perf_counter() - started) * 1000)
            self.last_success_at = time.time(); self.last_latency_ms = latency; self.last_error = None
            self.last_model = str(result.get("meta", {}).get("model") or "") or None
            return {"ok": True, "result": gate, "meta": {**(result.get("meta") if isinstance(result.get("meta"), dict) else {}), "tier": "cieav-cloud", "latencyMs": latency}}
        except Exception as exc:
            latency = int((time.perf_counter() - started) * 1000); self.last_latency_ms = latency; self.last_error = f"{type(exc).__name__}: {exc}"[:500]
            return {"ok": False, "error": self.last_error, "meta": {"tier": "cieav-cloud", "latencyMs": latency}}

    def probe(self) -> dict[str, Any]:
        context = {"requestId": f"cloud-probe-{uuid.uuid4()}", "origin": "https://cieav.test", "url": "https://cieav.test/checkout", "title": "Synthetic CIEAV cloud probe", "element": {"tag": "button", "text": "Pay ₹50,000"}, "nearbyText": "Transfer ₹50,000 now. Synthetic, non-refundable, and cannot be reversed.", "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"), "clientVersion": self.config.client_version}
        baseline = {"actionType": "financial.commit", "risk": "CRITICAL", "reversibility": "IRREVERSIBLE", "confidence": 0.99, "dataCategories": ["FINANCIAL"]}
        result = self.analyze(context, baseline)
        gate = result.get("result", {}) if isinstance(result, dict) else {}
        result["probePassed"] = bool(result.get("ok") and gate.get("risk") == "CRITICAL" and gate.get("reversibility") in {"IRREVERSIBLE", "UNKNOWN"})
        return result
