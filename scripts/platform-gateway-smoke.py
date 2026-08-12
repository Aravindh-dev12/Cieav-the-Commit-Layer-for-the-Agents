#!/usr/bin/env python3
from __future__ import annotations

import os
import tempfile
from pathlib import Path
from unittest.mock import patch

from latch_platform.cli import build_parser
from latch_platform.config import Settings
from latch_platform.gateway import Gateway


def settings_for(root: Path, state: Path, offset: int = 0) -> Settings:
    return Settings(
        root=root,
        state_dir=state,
        gateway_port=18791 + offset,
        control_port=18790 + offset,
        api_port=18787 + offset,
        token_file=state / "gateway-token",
        local_api_secret_file=state / "local-api-signing-secret",
        receipt_signing_secret_file=state / "receipt-signing-secret",
        hf_token_file=state / "hf-token",
        runtime_file=state / "gateway-runtime.json",
        log_file=state / "gateway.log",
    )


def assert_private(path: Path) -> None:
    if os.name != "nt":
        assert (path.stat().st_mode & 0o077) == 0, f"{path} must not be group/world accessible"


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    assert (root / "apps/browser/main.mjs").exists()
    assert (root / "apps/browser/test-lab.html").exists()
    assert (root / "apps/api").exists()

    parser = build_parser()
    for argv in [
        ["gateway", "run"],
        ["gateway", "install"],
        ["gateway", "start"],
        ["gateway", "stop"],
        ["gateway", "restart"],
        ["gateway", "status"],
        ["gateway", "pause"],
        ["gateway", "resume"],
        ["gateway", "restart-surface"],
        ["doctor"],
        ["dashboard"],
        ["test-lab"],
        ["audit", "tail"],
    ]:
        parsed = parser.parse_args(argv)
        assert parsed.command

    with tempfile.TemporaryDirectory(prefix="cieav-platform-") as td:
        base = Path(td)
        a = settings_for(root, base / "user-a", 0)
        b = settings_for(root, base / "user-b", 20)

        a_token = a.token()
        a_api = a.local_api_secret()
        a_receipt = a.receipt_signing_secret()
        b_token = b.token()
        b_api = b.local_api_secret()
        b_receipt = b.receipt_signing_secret()

        assert len(a_token) >= 32
        assert len(a_api) >= 32
        assert len(a_receipt) >= 32
        assert a.token() == a_token
        assert a.local_api_secret() == a_api
        assert a.receipt_signing_secret() == a_receipt

        # Each local user/install owns independent authority.
        assert a.state_dir != b.state_dir
        assert a_token != b_token
        assert a_api != b_api
        assert a_receipt != b_receipt
        assert a_api != a_receipt
        assert b_api != b_receipt

        for s in (a, b):
            assert_private(s.state_dir)
            assert_private(s.token_file)
            assert_private(s.local_api_secret_file)
            assert_private(s.receipt_signing_secret_file)

        g = Gateway(a)
        assert g.test_lab_url == "http://127.0.0.1:18791/test-lab"
        health = g.public_health()
        assert health["platform"] in {"CIEAV Gateway", "LATCH Gateway"}
        assert health["paused"] is False
        assert health["surfaceRunning"] is False

        with patch.object(g, "open_surface_url", return_value={"ok": True, "url": g.test_lab_url}) as open_url:
            result = g.open_test_lab()
            assert result["ok"] is True
            open_url.assert_called_once_with(g.test_lab_url)

        g.paused = True
        with patch.object(g, "_browser_health", return_value={"ok": True}):
            try:
                g.open_surface_url("https://example.com")
            except RuntimeError as exc:
                assert "paused" in str(exc).lower()
            else:
                raise AssertionError("paused Gateway must not open protected URLs")

    print("CIEAV Python Gateway smoke test passed")
    print("CIEAV per-user local authority isolation passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
