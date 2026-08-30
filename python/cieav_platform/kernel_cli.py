from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from typing import Any

DEFAULT_API_URL = "http://127.0.0.1:8787"


def _json(value: str) -> Any:
    try:
        return json.loads(value)
    except json.JSONDecodeError as exc:
        raise argparse.ArgumentTypeError(f"invalid JSON: {exc.msg}") from exc


def _base_url() -> str:
    return str(os.environ.get("CIEAV_API_URL", DEFAULT_API_URL)).rstrip("/")


def _gateway_token() -> str | None:
    value = os.environ.get("CIEAV_GATEWAY_TOKEN") or os.environ.get("LATCH_GATEWAY_TOKEN")
    return value.strip() if value and value.strip() else None


def _request(path: str, method: str = "GET", payload: Any | None = None, *, auth: bool = True) -> Any:
    headers = {"accept": "application/json"}
    if payload is not None:
        headers["content-type"] = "application/json"
    if auth:
        token = _gateway_token()
        if not token:
            raise RuntimeError("CIEAV_GATEWAY_TOKEN is required for local authority commands")
        headers["authorization"] = f"Bearer {token}"
    body = None if payload is None else json.dumps(payload, separators=(",", ":")).encode("utf-8")
    request = urllib.request.Request(f"{_base_url()}{path}", data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=15) as response:  # noqa: S310 - local endpoint is operator-configured
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(detail) if detail else {}
            message = parsed.get("error") or parsed
        except json.JSONDecodeError:
            message = detail or exc.reason
        raise RuntimeError(f"CIEAV API {exc.code}: {message}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"CIEAV local API unavailable at {_base_url()}: {exc.reason}") from exc


def _print(value: Any) -> None:
    print(json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="cieav kernel",
        description="Operate the local CIEAV Autonomous Systems Integrity Kernel.",
    )
    sub = parser.add_subparsers(dest="kernel_command", required=True)
    sub.add_parser("status", help="Show local API health and Integrity Kernel runtime status")
    sub.add_parser("tools", help="List registered execution-fabric tools")
    sub.add_parser("tickets", help="List execution authority tickets")
    sub.add_parser("audit", help="Show tamper-evident Execution Fabric audit records")
    sub.add_parser("quarantines", help="List unresolved semantic-effect quarantines")

    issue = sub.add_parser("issue-ticket", help="Issue a one-use ticket for an already authorized proposal")
    issue.add_argument("proposal_id")
    issue.add_argument("reality_bound_commit_id")
    issue.add_argument("--ttl", type=int, default=30)

    dispatch = sub.add_parser("dispatch", help="Dispatch a ticket through the trusted Execution Router")
    dispatch.add_argument("ticket_id")
    dispatch.add_argument("--args-json", type=_json, default={}, help="Normalized adapter arguments as JSON")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.kernel_command == "status":
            health = _request("/health", auth=False)
            runtime: Any
            try:
                runtime = _request("/v1/agent-kernel/runtime")
            except RuntimeError as exc:
                runtime = {"available": False, "error": str(exc)}
            _print({"api": _base_url(), "health": health, "kernel": runtime})
            return 0 if bool(health.get("ok")) else 1
        if args.kernel_command == "tools":
            _print(_request("/v1/agent-kernel/execution-fabric/tools"))
            return 0
        if args.kernel_command == "tickets":
            _print(_request("/v1/agent-kernel/execution-fabric/tickets"))
            return 0
        if args.kernel_command == "audit":
            _print(_request("/v1/agent-kernel/execution-fabric/audit"))
            return 0
        if args.kernel_command == "quarantines":
            _print(_request("/v1/agent-kernel/quarantines"))
            return 0
        if args.kernel_command == "issue-ticket":
            if args.ttl < 1 or args.ttl > 3600:
                raise RuntimeError("ticket TTL must be between 1 and 3600 seconds")
            _print(
                _request(
                    f"/v1/agent-kernel/execution-fabric/proposals/{args.proposal_id}/ticket",
                    "POST",
                    {"realityBoundCommitId": args.reality_bound_commit_id, "ttlSeconds": args.ttl},
                )
            )
            return 0
        if args.kernel_command == "dispatch":
            if not isinstance(args.args_json, dict):
                raise RuntimeError("--args-json must decode to a JSON object")
            _print(
                _request(
                    f"/v1/agent-kernel/execution-router/tickets/{args.ticket_id}/dispatch",
                    "POST",
                    {"normalizedArguments": args.args_json},
                )
            )
            return 0
    except KeyboardInterrupt:
        return 130
    except Exception as exc:
        print(f"CIEAV kernel error: {exc}", file=sys.stderr)
        return 1
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
