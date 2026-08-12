#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import tempfile
import threading
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from unittest.mock import patch

from latch_platform.config import Settings
from latch_platform.gateway import ControlHandler, Gateway, _redacted_url


def request(url: str, *, method: str = "GET", token: str | None = None) -> tuple[int, dict]:
    headers = {"accept": "application/json"}
    if token:
        headers["authorization"] = f"Bearer {token}"
    req = Request(url, headers=headers, method=method)
    try:
        with urlopen(req, timeout=2) as r:
            return r.status, json.loads(r.read().decode("utf-8") or "{}")
    except HTTPError as exc:
        return exc.code, json.loads(exc.read().decode("utf-8") or "{}")


def settings_for(root: Path, state: Path) -> Settings:
    return Settings(
        root=root,
        state_dir=state,
        gateway_port=0,
        control_port=18790,
        api_port=18787,
        token_file=state / "gateway-token",
        local_api_secret_file=state / "local-api-signing-secret",
        receipt_signing_secret_file=state / "receipt-signing-secret",
        hf_token_file=state / "hf-token",
        runtime_file=state / "gateway-runtime.json",
        log_file=state / "gateway.log",
    )


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    with tempfile.TemporaryDirectory(prefix="cieav-control-") as td:
        state = Path(td)
        gateway = Gateway(settings_for(root, state))
        ControlHandler.gateway = gateway
        server = ThreadingHTTPServer(("127.0.0.1", 0), ControlHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = f"http://127.0.0.1:{server.server_port}"
        try:
            code, body = request(base + "/health")
            assert code == 200 and body.get("platform") == "CIEAV Gateway"

            code, body = request(base + "/v1/status")
            assert code == 401 and body.get("error") == "unauthorized"

            code, body = request(base + "/v1/status", token="wrong-token")
            assert code == 401 and body.get("error") == "unauthorized"

            code, body = request(base + "/does-not-exist", token=gateway.token)
            assert code == 404 and body.get("error") == "not_found"

            assert _redacted_url("https://example.test/pay?token=secret#private") == "https://example.test/pay"
            assert "secret" not in _redacted_url("https://example.test/pay?token=secret")

            with patch.dict(os.environ,{"CIEAV_BROWSER_CONTROL_TOKEN":"inherited-secret","LATCH_BROWSER_CONTROL_TOKEN":"legacy-secret"},clear=False):
                base_env=gateway._base_env()
                assert "CIEAV_BROWSER_CONTROL_TOKEN" not in base_env
                assert "LATCH_BROWSER_CONTROL_TOKEN" not in base_env

            # The Node mediator receives one dedicated capability, but not Gateway/API/receipt secrets.
            dedicated="B"*64
            surface_env = gateway._surface_env(dedicated)
            for key in ("JWT_SECRET", "RECEIPT_SIGNING_SECRET", "CIEAV_GATEWAY_TOKEN", "LATCH_GATEWAY_TOKEN"):
                assert key not in surface_env
            assert surface_env["CIEAV_BROWSER_CONTROL_TOKEN"] == dedicated
            assert surface_env["CIEAV_BROWSER_CONTROL_TOKEN"] != gateway.token
            assert surface_env["CIEAV_REQUIRE_PRODUCTION_API"] == "1"
            assert surface_env["CIEAV_TEST_AUTO_APPROVE"] == "0"

            semantic_env = gateway._semantic_env()
            assert semantic_env["CIEAV_GATEWAY_TOKEN"] == gateway.token
            assert "CIEAV_BROWSER_CONTROL_TOKEN" not in semantic_env
            assert semantic_env["JWT_SECRET"] != semantic_env["RECEIPT_SIGNING_SECRET"]
            assert len(semantic_env["JWT_SECRET"]) >= 32
            assert len(semantic_env["RECEIPT_SIGNING_SECRET"]) >= 32
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=3)

    print("CIEAV control-plane smoke passed")
    print("CIEAV Gateway/browser control authorities are separated")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
