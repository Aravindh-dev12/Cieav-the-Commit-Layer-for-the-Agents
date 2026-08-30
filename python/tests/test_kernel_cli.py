from __future__ import annotations

import io
import json
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch

from cieav_platform import cli


class KernelCliTests(unittest.TestCase):
    def test_wrapper_routes_kernel_commands_without_entering_legacy_cli(self) -> None:
        with patch("cieav_platform.cli._kernel_main", return_value=7) as kernel, patch(
            "cieav_platform.cli._legacy_main", return_value=9
        ) as legacy:
            self.assertEqual(cli.main(["kernel", "status"]), 7)
            kernel.assert_called_once_with(["status"])
            legacy.assert_not_called()

    def test_kernel_status_reports_health_and_runtime(self) -> None:
        from cieav_platform import kernel_cli

        responses = {
            "/health": {"ok": True, "service": "cieav-local-api", "localAuthority": True},
            "/v1/agent-kernel/runtime": {"version": "intent-reality-v5", "stats": {}},
        }

        def fake_request(path: str, method: str = "GET", payload=None, *, auth: bool = True):
            self.assertEqual(method, "GET")
            self.assertIsNone(payload)
            return responses[path]

        output = io.StringIO()
        with patch("cieav_platform.kernel_cli._request", side_effect=fake_request), redirect_stdout(output):
            self.assertEqual(kernel_cli.main(["status"]), 0)
        rendered = json.loads(output.getvalue())
        self.assertTrue(rendered["health"]["ok"])
        self.assertTrue(rendered["health"]["localAuthority"])
        self.assertEqual(rendered["kernel"]["version"], "intent-reality-v5")

    def test_dispatch_uses_trusted_execution_router(self) -> None:
        from cieav_platform import kernel_cli

        ticket = "11111111-1111-4111-8111-111111111111"
        captured = {}

        def fake_request(path: str, method: str = "GET", payload=None, *, auth: bool = True):
            captured.update(path=path, method=method, payload=payload, auth=auth)
            return {"ok": True}

        with patch("cieav_platform.kernel_cli._request", side_effect=fake_request):
            self.assertEqual(kernel_cli.main(["dispatch", ticket, "--args-json", '{"path":"README.md"}']), 0)
        self.assertEqual(captured["path"], f"/v1/agent-kernel/execution-router/tickets/{ticket}/dispatch")
        self.assertEqual(captured["method"], "POST")
        self.assertEqual(captured["payload"], {"normalizedArguments": {"path": "README.md"}})
        self.assertTrue(captured["auth"])

    def test_issue_ticket_binds_reality_commit(self) -> None:
        from cieav_platform import kernel_cli

        proposal = "22222222-2222-4222-8222-222222222222"
        commit = "33333333-3333-4333-8333-333333333333"
        captured = {}

        def fake_request(path: str, method: str = "GET", payload=None, *, auth: bool = True):
            captured.update(path=path, method=method, payload=payload)
            return {"ticket": {"id": "ticket"}}

        with patch("cieav_platform.kernel_cli._request", side_effect=fake_request):
            self.assertEqual(kernel_cli.main(["issue-ticket", proposal, commit, "--ttl", "45"]), 0)
        self.assertEqual(captured["path"], f"/v1/agent-kernel/execution-fabric/proposals/{proposal}/ticket")
        self.assertEqual(captured["method"], "POST")
        self.assertEqual(captured["payload"], {"realityBoundCommitId": commit, "ttlSeconds": 45})


if __name__ == "__main__":
    unittest.main()
