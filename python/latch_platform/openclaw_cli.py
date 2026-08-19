from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from .config import Settings
from .mcp_launcher import _install_id, main as mcp_main

_RISK = ("LOW", "MEDIUM", "HIGH", "CRITICAL")
_DEFAULT_ACTIONS = ["*"]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _state_file(settings: Settings) -> Path:
    return settings.state_dir / "openclaw-integration.json"


def _save_state(settings: Settings, value: dict) -> None:
    settings.ensure()
    path = _state_file(settings)
    tmp = path.with_name(f"{path.name}.{os.getpid()}.tmp")
    tmp.write_text(json.dumps(value, indent=2) + "\n", "utf-8")
    try:
        os.chmod(tmp, 0o600)
    except OSError:
        pass
    os.replace(tmp, path)


def _load_state(settings: Settings) -> dict | None:
    try:
        value = json.loads(_state_file(settings).read_text("utf-8"))
        return value if isinstance(value, dict) else None
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def _openclaw() -> str:
    override = os.environ.get("CIEAV_OPENCLAW")
    if override and Path(override).exists():
        return str(Path(override).resolve())
    found = shutil.which("openclaw")
    if found:
        return found
    raise RuntimeError("OpenClaw is not installed or is not on PATH")


def _cieav_executable() -> str:
    candidate = Path(sys.executable).resolve()
    if candidate.name.lower() in {"cieav", "cieav.exe"}:
        return str(candidate)
    found = shutil.which("cieav")
    if found:
        return found
    return str(candidate)


def _device(settings: Settings) -> str:
    req = Request(
        f"http://127.0.0.1:{settings.api_port}/v1/devices/register",
        data=json.dumps({"installId": _install_id(settings), "deviceName": "CIEAV OpenClaw Integration"}).encode("utf-8"),
        headers={"content-type": "application/json", "accept": "application/json"},
        method="POST",
    )
    try:
        with urlopen(req, timeout=5) as response:
            value = json.loads(response.read().decode("utf-8") or "{}")
    except URLError as exc:
        raise RuntimeError("CIEAV Gateway is offline; run `cieav gateway install` first") from exc
    token = value.get("token")
    if not isinstance(token, str) or len(token) < 40:
        raise RuntimeError("CIEAV device registration failed")
    return token


def _request(settings: Settings, token: str, path: str, method: str = "GET", payload: dict | None = None) -> dict:
    req = Request(
        f"http://127.0.0.1:{settings.api_port}{path}",
        data=json.dumps(payload).encode("utf-8") if payload is not None else None,
        headers={"content-type": "application/json", "accept": "application/json", "authorization": f"Bearer {token}"},
        method=method,
    )
    try:
        with urlopen(req, timeout=6) as response:
            return json.loads(response.read().decode("utf-8") or "{}")
    except HTTPError as exc:
        try:
            detail = json.loads(exc.read().decode("utf-8") or "{}").get("error") or str(exc)
        except Exception:
            detail = str(exc)
        raise RuntimeError(f"CIEAV local authority rejected OpenClaw integration: {detail}") from exc
    except URLError as exc:
        raise RuntimeError("CIEAV Gateway is offline") from exc


def _ensure_intent(settings: Settings, *, max_risk: str, approval_at: str) -> dict:
    token = _device(settings)
    state = _load_state(settings)
    if state and isinstance(state.get("intentId"), str):
        try:
            existing = _request(settings, token, f"/v1/intents/{state['intentId']}").get("intent")
            if isinstance(existing, dict) and existing.get("status") == "ACTIVE":
                return existing
        except Exception:
            pass
    payload = {
        "owner": {"id": "local-human", "kind": "HUMAN", "displayName": "Local CIEAV owner"},
        "goal": "Allow OpenClaw to perform useful work while CIEAV governs consequential actions and independently verifies outcomes.",
        "constraints": {
            "allowedActionTypes": ["*"],
            "deniedActionTypes": [],
            "allowedTargets": [],
            "deniedTargets": [],
            "maxRisk": max_risk,
            "humanApprovalAtOrAbove": approval_at,
            "allowedDataCategories": ["NONE", "ACCOUNT", "CONTACT", "LOCATION", "IDENTITY", "FINANCIAL", "FILE", "MESSAGE", "WORK", "OTHER"],
            "allowExternalRecipients": True,
            "maxDelegationDepth": 2,
            "requireIndependentVerification": True,
        },
        "completionCriteria": [
            "The requested OpenClaw goal is completed or safely stopped.",
            "Consequential actions are settled from CIEAV evidence rather than agent self-report.",
        ],
        "contextLabels": {"integration": "openclaw", "managedBy": "cieav"},
    }
    intent = _request(settings, token, "/v1/intents", "POST", payload).get("intent")
    if not isinstance(intent, dict) or not isinstance(intent.get("id"), str):
        raise RuntimeError("CIEAV could not create the OpenClaw Intent Contract")
    return intent


def _run_openclaw(args: list[str], *, capture: bool = False) -> subprocess.CompletedProcess[str]:
    cmd = [_openclaw(), *args]
    result = subprocess.run(cmd, text=True, capture_output=capture, check=False)
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "OpenClaw command failed").strip()
        raise RuntimeError(detail)
    return result


def _connect(settings: Settings, *, max_risk: str, approval_at: str, probe: bool) -> dict:
    intent = _ensure_intent(settings, max_risk=max_risk, approval_at=approval_at)
    cieav = _cieav_executable()
    config = {
        "command": cieav,
        "args": ["openclaw", "serve", "--intent", intent["id"], "--max-risk", max_risk],
        "supportsParallelToolCalls": False,
    }
    _run_openclaw(["mcp", "set", "cieav", json.dumps(config, separators=(",", ":"))])
    _run_openclaw(["mcp", "doctor", "cieav"])
    if probe:
        _run_openclaw(["mcp", "probe", "cieav", "--json"])
    state = {
        "version": 1,
        "connectedAt": _now(),
        "intentId": intent["id"],
        "maxRisk": max_risk,
        "approvalAt": approval_at,
        "openclawCommand": _openclaw(),
        "cieavCommand": cieav,
        "serverName": "cieav",
    }
    _save_state(settings, state)
    return {"ok": True, "connected": True, "intent": intent, "mcpServer": "cieav", "consumerDependencies": []}


def _status(settings: Settings) -> dict:
    state = _load_state(settings)
    openclaw = shutil.which("openclaw") or os.environ.get("CIEAV_OPENCLAW")
    try:
        result = _run_openclaw(["mcp", "show", "cieav", "--json"], capture=True) if openclaw else None
        server = json.loads(result.stdout) if result and result.stdout.strip() else None
    except Exception as exc:
        server = {"error": str(exc)}
    try:
        token = _device(settings)
        intent = _request(settings, token, f"/v1/intents/{state['intentId']}").get("intent") if state and state.get("intentId") else None
    except Exception as exc:
        intent = {"error": str(exc)}
    return {"ok": bool(openclaw and state), "openclaw": openclaw, "state": state, "server": server, "intent": intent}


def _disconnect(settings: Settings) -> dict:
    try:
        _run_openclaw(["mcp", "unset", "cieav"])
    except Exception as exc:
        if "does not exist" not in str(exc).lower() and "not found" not in str(exc).lower():
            raise
    path = _state_file(settings)
    try:
        path.unlink()
    except FileNotFoundError:
        pass
    return {"ok": True, "connected": False}


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="cieav openclaw", description="Connect CIEAV to OpenClaw without npm, npx, Python, or source checkout requirements")
    sub = p.add_subparsers(dest="command", required=True)
    c = sub.add_parser("connect", help="Register the installed CIEAV runtime as OpenClaw's governed MCP boundary")
    c.add_argument("--max-risk", choices=_RISK, default="HIGH")
    c.add_argument("--approval-at", choices=_RISK, default="HIGH")
    c.add_argument("--no-probe", action="store_true", help="Save and validate config without opening a live MCP probe")
    sub.add_parser("status", help="Show OpenClaw/CIEAV integration status")
    sub.add_parser("doctor", help="Validate the saved OpenClaw MCP definition and live CIEAV bridge")
    sub.add_parser("disconnect", help="Remove only the CIEAV MCP registration from OpenClaw")
    s = sub.add_parser("serve", help="Run the CIEAV stdio MCP server for OpenClaw using a fresh short-lived local agent session")
    s.add_argument("--intent", required=True)
    s.add_argument("--max-risk", choices=_RISK, default="HIGH")
    return p


def main(argv: list[str] | None = None) -> int:
    try:
        args = build_parser().parse_args(argv)
        settings = Settings.load()
        if args.command == "connect":
            print(json.dumps(_connect(settings, max_risk=args.max_risk, approval_at=args.approval_at, probe=not args.no_probe), indent=2))
            return 0
        if args.command == "status":
            value = _status(settings)
            print(json.dumps(value, indent=2))
            return 0 if value.get("ok") else 2
        if args.command == "doctor":
            _run_openclaw(["mcp", "doctor", "cieav", "--probe"])
            print(json.dumps({"ok": True, "mcpServer": "cieav", "liveProbe": True}, indent=2))
            return 0
        if args.command == "disconnect":
            print(json.dumps(_disconnect(settings), indent=2))
            return 0
        if args.command == "serve":
            return mcp_main([
                "--agent-id", "openclaw",
                "--agent-name", "OpenClaw",
                "--provider", "openclaw",
                "--intent", args.intent,
                "--action", "*",
                "--max-risk", args.max_risk,
                "--ttl", "900",
            ])
    except KeyboardInterrupt:
        return 130
    except Exception as exc:
        print(f"CIEAV OpenClaw error: {exc}", file=sys.stderr, flush=True)
        return 1
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
