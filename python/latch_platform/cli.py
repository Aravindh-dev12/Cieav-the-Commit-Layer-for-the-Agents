from __future__ import annotations

import argparse
import getpass
import json
import os
import shutil
import sys
import webbrowser
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from .config import Settings
from .gateway import run_gateway
from .hf_provider import HFConfig, HuggingFaceSemanticProvider
from .service import install as install_service
from .service import restart as restart_service
from .service import service_status
from .service import start as start_service
from .service import stop as stop_service
from .service import uninstall as uninstall_service


def _gateway_request(settings: Settings, path: str, method: str = "GET") -> dict:
    headers = {"accept": "application/json"}
    if path != "/health":
        headers["authorization"] = f"Bearer {settings.token()}"
    req = Request(f"http://127.0.0.1:{settings.gateway_port}{path}", headers=headers, method=method)
    try:
        with urlopen(req, timeout=35.0 if path.endswith("/probe") else 3.0) as r:
            return json.loads(r.read().decode("utf-8") or "{}")
    except HTTPError as exc:
        try:
            payload = json.loads(exc.read().decode("utf-8") or "{}")
            detail = payload.get("error") or str(exc)
        except Exception:
            detail = str(exc)
        raise RuntimeError(detail) from exc
    except URLError as exc:
        raise RuntimeError("LATCH Gateway is offline. Run `latch gateway install` or `latch gateway run`.") from exc


def _print(payload) -> None:
    print(payload if isinstance(payload, str) else json.dumps(payload, indent=2, ensure_ascii=False))


def _open_url(url: str) -> int:
    webbrowser.open(url)
    print(url)
    return 0


def _hf_direct(settings: Settings) -> HuggingFaceSemanticProvider:
    cfg = HFConfig.load()
    if not cfg.token:
        cfg = HFConfig(settings.read_hf_token(), cfg.model, cfg.provider, cfg.endpoint_url, cfg.timeout_seconds)
    return HuggingFaceSemanticProvider(cfg)


def _doctor(settings: Settings) -> dict:
    checks = []
    def add(name: str, ok: bool, detail: str): checks.append({"name": name, "ok": ok, "detail": detail})
    add("Python", sys.version_info >= (3, 11), sys.version.split()[0])
    node = shutil.which("node"); add("Node", bool(node), node or "not found")
    chrome = os.environ.get("LATCH_CHROMIUM") or next((p for p in [shutil.which("google-chrome"),shutil.which("google-chrome-stable"),shutil.which("chromium"),shutil.which("chromium-browser")] if p),None)
    add("Chromium", bool(chrome), chrome or "not found; set LATCH_CHROMIUM if installed elsewhere")
    api_build = settings.root / "apps" / "api" / "dist" / "server.js"; add("Production semantic API build", api_build.exists(), str(api_build))
    entry = settings.root / "apps" / "browser" / "main.mjs"; add("Browser mediator entry", entry.exists(), str(entry))
    test_lab = settings.root / "apps" / "browser" / "test-lab.html"; add("Protected Test Lab", test_lab.exists(), str(test_lab))
    hf=_hf_direct(settings); hfs=hf.status(); add("Hugging Face credential", bool(hfs.get("tokenPresent")), f"model={hfs.get('model')} mode={hfs.get('mode')}")
    try:
        status = _gateway_request(settings, "/health"); add("Gateway", True, f"pid={status.get('gatewayPid')} paused={status.get('paused')} hf={status.get('huggingFaceConfigured')}")
    except Exception as exc: add("Gateway", False, str(exc))
    try:
        service = service_status(settings); add("OS startup service", bool(service.get("installed")), f"{service.get('platform')}: {service.get('detail')}")
    except Exception as exc: add("OS startup service", False, str(exc))
    return {"ok": all(c["ok"] for c in checks[:6]), "checks": checks}


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="latch", description="LATCH always-on commit platform")
    sub = p.add_subparsers(dest="command", required=True)
    g = sub.add_parser("gateway", help="Manage the always-on Gateway"); gs = g.add_subparsers(dest="gateway_command", required=True)
    for name,help_text in [("run","Run the Gateway in the foreground"),("status","Show live Gateway status"),("install","Install and start the per-user OS service"),("uninstall","Remove the per-user OS service"),("start","Start the installed OS service"),("stop","Stop the installed OS service"),("restart","Restart the installed OS service"),("pause","Pause LATCH protection while keeping the Gateway alive"),("resume","Resume LATCH protection"),("restart-surface","Restart only the protected browser surface")]: gs.add_parser(name,help=help_text)
    m=sub.add_parser("model",help="Manage LATCH semantic model providers"); ms=m.add_subparsers(dest="model_command",required=True)
    ms.add_parser("hf-login",help="Securely store a Hugging Face token in local LATCH state")
    ms.add_parser("hf-logout",help="Delete the locally stored Hugging Face token")
    ms.add_parser("hf-status",help="Show Hugging Face configuration without exposing credentials")
    ms.add_parser("hf-probe",help="Run a live synthetic safety classification against Hugging Face")
    sub.add_parser("doctor", help="Check runtime, browser, models, Gateway and service health")
    sub.add_parser("dashboard", help="Open the local LATCH Control Center")
    sub.add_parser("test-lab", help="Open synthetic scenarios inside the protected LATCH browser")
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        settings = Settings.load()
        if args.command == "gateway":
            cmd = args.gateway_command
            if cmd == "run": return run_gateway(settings)
            if cmd == "install": _print(install_service(settings)); return 0
            if cmd == "uninstall": _print(uninstall_service(settings)); return 0
            if cmd == "start": _print(start_service(settings)); return 0
            if cmd == "stop": _print(stop_service(settings)); return 0
            if cmd == "restart": _print(restart_service(settings)); return 0
            if cmd == "status":
                try: payload = _gateway_request(settings, "/v1/status"); payload["service"] = service_status(settings)
                except Exception: payload = {"gateway": "offline", "service": service_status(settings)}
                _print(payload); return 0
            if cmd == "pause": _print(_gateway_request(settings, "/v1/pause", "POST")); return 0
            if cmd == "resume": _print(_gateway_request(settings, "/v1/resume", "POST")); return 0
            if cmd == "restart-surface": _print(_gateway_request(settings, "/v1/restart-surface", "POST")); return 0
        if args.command == "model":
            cmd=args.model_command
            if cmd=="hf-login":
                token=getpass.getpass("Hugging Face token (input hidden): ").strip(); settings.write_hf_token(token); print("Hugging Face token stored locally with restricted permissions. Restart the Gateway to activate it."); return 0
            if cmd=="hf-logout":
                removed=settings.delete_hf_token(); print("Removed local Hugging Face token." if removed else "No local Hugging Face token was stored."); return 0
            if cmd=="hf-status":
                try: _print(_gateway_request(settings,"/v1/hf/status"))
                except Exception: _print({"ok":True,"gateway":"offline","huggingFace":_hf_direct(settings).status()})
                return 0
            if cmd=="hf-probe":
                try: result=_gateway_request(settings,"/v1/hf/probe","POST")
                except Exception: result=_hf_direct(settings).probe()
                _print(result); return 0 if result.get("probePassed") else 2
        if args.command == "doctor": report = _doctor(settings); _print(report); return 0 if report["ok"] else 1
        if args.command == "dashboard": return _open_url(f"http://127.0.0.1:{settings.control_port}")
        if args.command == "test-lab":
            result = _gateway_request(settings, "/v1/open-test-lab", "POST"); print("Opened LATCH Test Lab inside the protected browser surface."); _print(result); return 0
    except KeyboardInterrupt: return 130
    except Exception as exc: print(f"LATCH error: {exc}", file=sys.stderr); return 1
    return 2

if __name__ == "__main__": raise SystemExit(main())
