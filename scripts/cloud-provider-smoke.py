#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from latch_platform.cloud_provider import CloudSemanticProvider


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
            raw = json.dumps(payload).lower()
            assert "password_value" not in raw and "otp_value" not in raw
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
    old = {k: os.environ.get(k) for k in ("LATCH_CLOUD_URL", "LATCH_STATE_DIR", "LATCH_VERSION")}
    try:
        with tempfile.TemporaryDirectory() as td:
            os.environ["LATCH_CLOUD_URL"] = f"http://127.0.0.1:{server.server_address[1]}"
            os.environ["LATCH_STATE_DIR"] = td
            os.environ["LATCH_VERSION"] = "0.7.0-test"
            provider = CloudSemanticProvider()
            enrolled = provider.enroll()
            assert enrolled["ok"] and enrolled["tokenStored"]
            assert (Path(td) / "cloud-device-token").exists()
            probe = provider.probe()
            assert probe["ok"] and probe["probePassed"]
            status = provider.status()
            assert status["healthy"] and status["enrolled"] and status["privacyMode"] == "transient-minimized"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
        for key, value in old.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
    print("LATCH Cloud provider smoke passed")


if __name__ == "__main__":
    main()
