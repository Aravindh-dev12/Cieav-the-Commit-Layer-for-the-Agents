#!/usr/bin/env python3
from __future__ import annotations

import os
import tempfile
from pathlib import Path
from unittest.mock import patch

from latch_platform.cli import build_parser
from latch_platform.config import Settings
from latch_platform.gateway import Gateway


def settings_for(root: Path, state: Path) -> Settings:
    return Settings(
        root=root,
        state_dir=state,
        gateway_port=18791,
        control_port=18790,
        api_port=18787,
        token_file=state / "gateway-token",
        runtime_file=state / "gateway-runtime.json",
        log_file=state / "gateway.log",
    )


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
    ]:
        parsed = parser.parse_args(argv)
        assert parsed.command

    with tempfile.TemporaryDirectory(prefix="latch-platform-") as td:
        state = Path(td)
        s = settings_for(root, state)
        token = s.token()
        assert len(token) >= 32
        assert s.token() == token
        if os.name != "nt":
            assert (s.token_file.stat().st_mode & 0o077) == 0

        g = Gateway(s)
        assert g.test_lab_url == "http://127.0.0.1:18791/test-lab"
        health = g.public_health()
        assert health["platform"] == "LATCH Gateway"
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

    print("LATCH Python Gateway smoke test passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
