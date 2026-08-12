from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import webbrowser
from urllib.request import Request, urlopen

from .config import Settings
from .gateway import run_gateway
from .service import install as install_service
from .service import service_status, uninstall as uninstall_service


def _gateway_request(settings: Settings, path: str, method: str = "GET") -> dict:
    headers = {"accept": "application/json"}
    if path != "/health":
        headers["authorization"] = f"Bearer {settings.token()}"
    req = Request(f"http://127.0.0.1:{settings.gateway_port}{path}", headers=headers, method=method)
    with urlopen(req, timeout=2.5) as r:
        return json.loads(r.read().decode("utf-8") or "{}")


def _print(payload) -> None:
    if isinstance(payload, str):
        print(payload)
    else:
        print(json.dumps(payload, indent=2, ensure_ascii=False))


def _open_url(url: str) -> int:
    webbrowser.open(url)
    print(url)
    return 0


def _doctor(settings: Settings) -> dict:
    checks = []

    def add(name: str, ok: bool, detail: str):
        checks.append({"name": name, "ok": ok, "detail": detail})

    add("Python", sys.version_info >= (3, 11), sys.version.split()[0])
    node = shutil.which("node")
    add("Node", bool(node), node or "not found")
    chrome = os.environ.get("LATCH_CHROMIUM") or next((p for p in [
        shutil.which("google-chrome"), shutil.which("google-chrome-stable"), shutil.which("chromium"), shutil.which("chromium-browser")
    ] if p), None)
    add("Chromium", bool(chrome), chrome or "not found; set LATCH_CHROMIUM if installed elsewhere")
    api_build = settings.root / "apps" / "api" / "dist" / "server.js"
    add("Production semantic API build", api_build.exists(), str(api_build))
    entry = settings.root / "scripts" / "start-production.mjs"
    add("Browser mediator entry", entry.exists(), str(entry))
    try:
        status = _gateway_request(settings, "/health")
        add("Gateway", True, f"pid={status.get('gatewayPid')} paused={status.get('paused')}")
    except Exception as exc:
        add("Gateway", False, str(exc))
    try:
        service = service_status(settings)
        add("OS startup service", bool(service.get("installed")), f"{service.get('platform')}: {service.get('detail')}")
    except Exception as exc:
        add("OS startup service", False, str(exc))
    return {"ok": all(c["ok"] for c in checks[:5]), "checks": checks}


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="latch", description="LATCH always-on commit platform")
    sub = p.add_subparsers(dest="command", required=True)

    g = sub.add_parser("gateway", help="Manage the always-on Gateway")
    gs = g.add_subparsers(dest="gateway_command", required=True)
    gs.add_parser("run", help="Run the Gateway in the foreground")
    gs.add_parser("status", help="Show live Gateway status")
    gs.add_parser("install", help="Install and start the per-user OS service")
    gs.add_parser("uninstall", help="Remove the per-user OS service")
    gs.add_parser("pause", help="Pause LATCH protection locally")
    gs.add_parser("resume", help="Resume LATCH protection locally")
    gs.add_parser("restart-surface", help="Restart the protected browser surface")

    sub.add_parser("doctor", help="Check runtime, browser, build, Gateway and service health")
    sub.add_parser("dashboard", help="Open the local LATCH Control Center")
    sub.add_parser("test-lab", help="Open synthetic consequential-action scenarios")
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        settings = Settings.load()
        if args.command == "gateway":
            cmd = args.gateway_command
            if cmd == "run":
                return run_gateway(settings)
            if cmd == "install":
                _print(install_service(settings))
                return 0
            if cmd == "uninstall":
                _print(uninstall_service(settings))
                return 0
            if cmd == "status":
                try:
                    payload = _gateway_request(settings, "/v1/status")
                except Exception:
                    payload = {"gateway": "offline", "service": service_status(settings)}
                _print(payload)
                return 0
            if cmd == "pause":
                _print(_gateway_request(settings, "/v1/pause", "POST"))
                return 0
            if cmd == "resume":
                _print(_gateway_request(settings, "/v1/resume", "POST"))
                return 0
            if cmd == "restart-surface":
                _print(_gateway_request(settings, "/v1/restart-surface", "POST"))
                return 0
        if args.command == "doctor":
            report = _doctor(settings)
            _print(report)
            return 0 if report["ok"] else 1
        if args.command == "dashboard":
            return _open_url(f"http://127.0.0.1:{settings.control_port}")
        if args.command == "test-lab":
            return _open_url(f"http://127.0.0.1:{settings.gateway_port}/test-lab")
    except KeyboardInterrupt:
        return 130
    except Exception as exc:
        print(f"LATCH error: {exc}", file=sys.stderr)
        return 1
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
