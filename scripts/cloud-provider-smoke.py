#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from latch_platform.cloud_provider import CloudConfig, CloudSemanticProvider


class Handler(BaseHTTPRequestHandler):
    seen = []

    def log_message(self, *_args):
        return

    def send_json(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        size = int(self.headers.get("content-length", "0"))
        return json.loads(self.rfile.read(size) or b"{}")

    def do_GET(self):
        if self.path == "/health":
            return self.send_json(200, {"ok": True, "model": "granite-test", "privacyMode": "transient-minimized"})
        return self.send_json(404, {"error": "not_found"})

    def do_POST(self):
        payload = self.read_json()
        Handler.seen.append((self.path, dict(self.headers), payload))
        if self.path == "/v1/devices/register":
            assert isinstance(payload.get("installId"), str) and len(payload["installId"]) >= 12
            return self.send_json(200, {"deviceId": "device_test_123456", "token": "t" * 64, "expiresAt": "2099-01-01T00:00:00Z"})
        if self.path == "/v1/inference/analyze":
            assert self.headers.get("authorization") == "Bearer " + "t" * 64
            privacy = payload.get("privacy", {})
            assert privacy == {
                "rawFormValuesIncluded": False,
                "rawSecretsIncluded": False,
                "fullPageTextIncluded": False,
                "durableStorageRequested": False,
            }
            ctx = payload.get("context", {})
            assert "requestId" in ctx and "timestamp" in ctx and "clientVersion" in ctx
            assert "pageText" not in ctx
            assert ctx.get("url") == "https://example.test/checkout"
            assert ctx.get("origin") == "https://example.test"
            assert ctx.get("element", {}).get("href") == "https://example.test/pay"
            assert ctx.get("form", {}).get("action") == "https://example.test/pay"
            assert ctx.get("form", {}).get("fileNames") == ["[selected-file.pdf]"]
            assert ctx.get("form", {}).get("fields", [{}])[0].get("redacted") is True
            raw = json.dumps(payload).lower()
            for forbidden in [
                "password_value",
                "super-secret",
                "otp_value",
                "123456",
                "4111 1111 1111 1111",
                "alice@example.com",
                "real-passport",
                "secret-query",
                "session-secret",
                "abcdefghijklmnopqrstuvwxyz123456",
            ]:
                assert forbidden not in raw, forbidden
            return self.send_json(200, {
                "result": {
                    "actionType": "financial.commit",
                    "risk": "CRITICAL",
                    "reversibility": "IRREVERSIBLE",
                    "confidence": 0.97,
                    "needsDeepReview": True,
                    "promptInjectionSuspected": False,
                    "reasons": ["High-value non-refundable payment"],
                },
                "meta": {"model": "granite-test", "stored": False},
            })
        return self.send_json(404, {"error": "not_found"})


def main() -> None:
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    keys = ("CIEAV_CLOUD_URL", "LATCH_CLOUD_URL", "CIEAV_STATE_DIR", "LATCH_STATE_DIR", "CIEAV_VERSION", "LATCH_VERSION")
    old = {k: os.environ.get(k) for k in keys}
    try:
        with tempfile.TemporaryDirectory() as td:
            os.environ["CIEAV_CLOUD_URL"] = f"http://127.0.0.1:{server.server_address[1]}"
            os.environ["CIEAV_STATE_DIR"] = td
            os.environ["CIEAV_VERSION"] = "0.7.0-test"
            provider = CloudSemanticProvider()
            enrolled = provider.enroll()
            assert enrolled["ok"] and enrolled["tokenStored"]
            assert (Path(td) / "cloud-device-token").exists()

            raw_context = {
                "requestId": "privacy-smoke-12345678",
                "origin": "https://example.test",
                "url": "https://example.test/checkout?token=secret-query#private",
                "title": "Checkout alice@example.com",
                "pageText": "FULL PRIVATE PAGE password_value super-secret",
                "element": {"tag": "button", "text": "Pay 4111 1111 1111 1111", "href": "https://example.test/pay?session=session-secret"},
                "form": {
                    "method": "POST",
                    "action": "https://example.test/pay?csrf=session-secret",
                    "fields": [{"name": "password_value", "type": "password", "label": "OTP 123456", "redacted": False, "value": "super-secret", "dataCategory": "CREDENTIAL"}],
                    "fileNames": ["real-passport.pdf"],
                    "submitterText": "Bearer abcdefghijklmnopqrstuvwxyz123456",
                },
                "nearbyText": "OTP 123456 and secret material",
                "timestamp": "2026-08-12T12:00:00Z",
                "clientVersion": "0.7.0-test",
                "unexpected": {"raw": "otp_value"},
            }
            baseline = {"actionType": "financial.commit", "risk": "CRITICAL", "reversibility": "IRREVERSIBLE", "confidence": 0.99, "dataCategories": ["FINANCIAL"], "rawValue": "super-secret"}
            result = provider.analyze(raw_context, baseline)
            assert result["ok"]

            probe = provider.probe()
            assert probe["ok"] and probe["probePassed"]
            status = provider.status()
            assert status["healthy"] and status["enrolled"] and status["privacyMode"] == "transient-minimized"

            os.environ["CIEAV_CLOUD_URL"] = "http://cloud.example.com"
            try:
                CloudConfig.load()
            except ValueError as exc:
                assert "HTTPS" in str(exc)
            else:
                raise AssertionError("non-loopback HTTP CIEAV Cloud URL must be rejected")
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
        for key, value in old.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
    print("CIEAV Cloud provider privacy smoke passed")


if __name__ == "__main__":
    main()
