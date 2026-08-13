from __future__ import annotations

import json
import os
import platform
import re
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit, urlunsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener


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


def _validate_cloud_url(raw: str | None) -> str | None:
    if not raw:
        return None
    parts = urlsplit(raw.strip())
    if parts.username or parts.password or parts.query or parts.fragment:
        raise ValueError("CIEAV_CLOUD_URL must not contain credentials, query strings, or fragments")
    host = (parts.hostname or "").lower()
    loopback = host in {"127.0.0.1", "localhost", "::1"}
    if parts.scheme != "https" and not (loopback and parts.scheme == "http"):
        raise ValueError("CIEAV_CLOUD_URL must use HTTPS except for loopback tests")
    if not parts.netloc:
        raise ValueError("CIEAV_CLOUD_URL must include a host")
    path = parts.path.rstrip("/")
    return urlunsplit((parts.scheme, parts.netloc, path, "", ""))


_EMAIL = re.compile(r"\b[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}\b")
_PHONE = re.compile(r"\b(?:\+?\d[\d\s().-]{7,}\d)\b")
_CARD = re.compile(r"\b(?:\d[ -]*?){13,19}\b")
_OTP = re.compile(r"(?<!\d)\d{6}(?!\d)")
_SECRET = re.compile(r"(?:sk|pk|api)[-_][A-Za-z0-9_-]{16,}", re.I)
_BEARER = re.compile(r"\bBearer\s+[A-Za-z0-9._~+/\-]{16,}={0,2}\b", re.I)


def _clean_text(value: Any, limit: int) -> str | None:
    if not isinstance(value, str):
        return None
    value = _EMAIL.sub("[EMAIL]", value)
    value = _PHONE.sub("[PHONE]", value)
    value = _CARD.sub("[POSSIBLE_CARD]", value)
    value = _OTP.sub("[POSSIBLE_OTP]", value)
    value = _SECRET.sub("[POSSIBLE_SECRET]", value)
    value = _BEARER.sub("[POSSIBLE_BEARER]", value)
    return value[:limit]


def _strip_url(value: Any) -> str | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        p = urlsplit(value)
        if p.scheme not in {"http", "https"} or not p.netloc or p.username or p.password:
            return None
        return urlunsplit((p.scheme, p.netloc, p.path, "", ""))[:4096]
    except Exception:
        return None


def _generic_file(value: Any) -> str:
    suffix = Path(str(value or "")).suffix.lower().lstrip(".")
    return f"[selected-file.{suffix[:10]}]" if suffix and suffix.isalnum() else "[selected-file]"


def _privacy_reduce_context(context: dict[str, Any]) -> dict[str, Any]:
    url = _strip_url(context.get("url")) or _strip_url(context.get("origin"))
    if not url:
        raise RuntimeError("CIEAV Cloud context has no safe http/https URL")
    origin_parts = urlsplit(url)
    origin = f"{origin_parts.scheme}://{origin_parts.netloc}"
    element_raw = context.get("element") if isinstance(context.get("element"), dict) else {}
    element: dict[str, Any] = {"tag": _clean_text(element_raw.get("tag"), 50) or "unknown"}
    for key, limit in (("role",80),("text",700),("ariaLabel",300),("name",200),("inputType",80),("method",20),("declaredActionType",160),("declaredSummary",300),("declaredReversibility",40)):
        value = _clean_text(element_raw.get(key), limit)
        if value:
            element[key] = value
    for key in ("href", "action"):
        value = _strip_url(element_raw.get(key))
        if value:
            element[key] = value
    reduced: dict[str, Any] = {
        "requestId": _clean_text(context.get("requestId"), 128) or f"cloud-{uuid.uuid4()}",
        "url": url,
        "origin": origin,
        "element": element,
        "timestamp": context.get("timestamp") if isinstance(context.get("timestamp"), str) else datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "clientVersion": _clean_text(context.get("clientVersion"), 50) or "unknown",
    }
    title = _clean_text(context.get("title"), 300)
    nearby = _clean_text(context.get("nearbyText"), 1800)
    if title: reduced["title"] = title
    if nearby: reduced["nearbyText"] = nearby
    form_raw = context.get("form")
    if isinstance(form_raw, dict):
        form: dict[str, Any] = {"fields": [], "fileNames": []}
        method = _clean_text(form_raw.get("method"), 20)
        action = _strip_url(form_raw.get("action"))
        submitter = _clean_text(form_raw.get("submitterText"), 300)
        if method: form["method"] = method
        if action: form["action"] = action
        if submitter: form["submitterText"] = submitter
        for field in (form_raw.get("fields") if isinstance(form_raw.get("fields"), list) else [])[:100]:
            if not isinstance(field, dict):
                continue
            item: dict[str, Any] = {"name": _clean_text(field.get("name"),160) or "field", "type": _clean_text(field.get("type"),80) or "unknown", "redacted": True}
            label = _clean_text(field.get("label"),220)
            if label: item["label"] = label
            if isinstance(field.get("required"), bool): item["required"] = field["required"]
            if isinstance(field.get("dataCategory"), str): item["dataCategory"] = field["dataCategory"][:40]
            form["fields"].append(item)
        form["fileNames"] = [_generic_file(x) for x in (form_raw.get("fileNames") if isinstance(form_raw.get("fileNames"), list) else [])[:20]]
        reduced["form"] = form
    return reduced


def _privacy_reduce_baseline(base: dict[str, Any]) -> dict[str, Any]:
    return {
        "actionType": str(base.get("actionType") or "web.action")[:160],
        "risk": base.get("risk") if base.get("risk") in {"LOW","MEDIUM","HIGH","CRITICAL"} else "HIGH",
        "reversibility": base.get("reversibility") if base.get("reversibility") in {"REVERSIBLE","DELAYABLE","COMPENSABLE","IRREVERSIBLE","UNKNOWN"} else "UNKNOWN",
        "confidence": max(0.0, min(1.0, float(base.get("confidence") or 0))),
        "dataCategories": [str(x)[:40] for x in (base.get("dataCategories") if isinstance(base.get("dataCategories"), list) else [])[:20]],
    }


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise HTTPError(req.full_url, code, "CIEAV Cloud redirects are not allowed", headers, fp)


_NO_REDIRECT_OPENER = build_opener(_NoRedirect)


@dataclass(frozen=True)
class CloudConfig:
    base_url: str | None
    timeout_seconds: float
    state_dir: Path
    client_version: str

    @classmethod
    def load(cls) -> "CloudConfig":
        url = _validate_cloud_url(_env("CIEAV_CLOUD_URL", "LATCH_CLOUD_URL").rstrip("/") or None)
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
            with _NO_REDIRECT_OPENER.open(request, timeout=timeout or self.config.timeout_seconds) as response:
                raw = response.read(262_145)
                if len(raw) > 262_144:
                    raise RuntimeError("CIEAV Cloud response exceeded size limit")
                value = json.loads(raw.decode("utf-8") or "{}")
                if not isinstance(value, dict):
                    raise RuntimeError("CIEAV Cloud returned a non-object response")
                return value
        except HTTPError as exc:
            raw = exc.read(4096).decode("utf-8", "replace") if getattr(exc, "fp", None) else ""
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
            payload = {"context": _privacy_reduce_context(context), "baseline": _privacy_reduce_baseline(base), "privacy": {"rawFormValuesIncluded": False, "rawSecretsIncluded": False, "fullPageTextIncluded": False, "durableStorageRequested": False}}
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
