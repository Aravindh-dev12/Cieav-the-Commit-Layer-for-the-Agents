from __future__ import annotations

import argparse
import getpass
import json
import os
import shutil
import sys
import webbrowser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from .cloud_provider import CloudSemanticProvider
from .config import Settings
from .gateway import run_gateway
from .hf_provider import HFConfig, HuggingFaceSemanticProvider
from .local_model import LocalSemanticProvider
from .service import install as install_service
from .service import restart as restart_service
from .service import service_status
from .service import start as start_service
from .service import stop as stop_service
from .service import uninstall as uninstall_service


def _gateway_request(settings: Settings, path: str, method: str = "GET") -> dict:
    headers = {"accept": "application/json"}
    if path != "/health": headers["authorization"] = f"Bearer {settings.token()}"
    req = Request(f"http://127.0.0.1:{settings.gateway_port}{path}", headers=headers, method=method)
    try:
        with urlopen(req, timeout=35.0 if path.endswith("/probe") else 3.0) as r:
            return json.loads(r.read().decode("utf-8") or "{}")
    except HTTPError as exc:
        try: detail = json.loads(exc.read().decode("utf-8") or "{}").get("error") or str(exc)
        except Exception: detail = str(exc)
        raise RuntimeError(detail) from exc
    except URLError as exc:
        raise RuntimeError("CIEAV Gateway is offline. Run `cieav gateway install` or `cieav gateway run`.") from exc


def _print(payload) -> None: print(payload if isinstance(payload, str) else json.dumps(payload, indent=2, ensure_ascii=False))
def _open_url(url: str) -> int: webbrowser.open(url); print(url); return 0


def _audit_tail(settings: Settings, limit: int) -> dict:
    n=max(1,min(500,int(limit)))
    paths=[settings.state_dir/"audit-events.previous.jsonl",settings.state_dir/"audit-events.jsonl"]
    events=[]
    for p in paths:
        try: lines=p.read_text("utf-8").splitlines()
        except FileNotFoundError: continue
        for line in lines:
            try:
                value=json.loads(line)
                if isinstance(value,dict): events.append(value)
            except json.JSONDecodeError:
                continue
    return {"ok":True,"localOnly":True,"stateDir":str(settings.state_dir),"events":events[-n:]}


def _router_direct(settings: Settings) -> HuggingFaceSemanticProvider:
    cfg = HFConfig.load()
    if not cfg.token: cfg = HFConfig(settings.read_hf_token(), cfg.model, cfg.provider, cfg.endpoint_url, cfg.timeout_seconds)
    return HuggingFaceSemanticProvider(cfg)


def _node_path(settings: Settings) -> str | None:
    bundled = settings.root / "runtime" / ("node.exe" if os.name == "nt" else "node")
    return str(bundled) if bundled.exists() else shutil.which("node")


def _chromium_path() -> str | None:
    candidates: list[str | None] = [os.environ.get("CIEAV_CHROMIUM") or os.environ.get("LATCH_CHROMIUM"), shutil.which("google-chrome"), shutil.which("google-chrome-stable"), shutil.which("chromium"), shutil.which("chromium-browser")]
    if sys.platform == "darwin": candidates.extend(["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", str(Path.home()/"Applications/Google Chrome.app/Contents/MacOS/Google Chrome")])
    if os.name == "nt":
        for base in [os.environ.get("PROGRAMFILES"), os.environ.get("PROGRAMFILES(X86)"), os.environ.get("LOCALAPPDATA")]:
            if base:
                candidates.extend([str(Path(base)/"Google/Chrome/Application/chrome.exe"), str(Path(base)/"Chromium/Application/chrome.exe")])
    for candidate in candidates:
        if candidate and Path(candidate).exists(): return str(Path(candidate))
    return None


def _doctor(settings: Settings) -> dict:
    checks=[]
    def add(name:str,ok:bool,detail:str): checks.append({"name":name,"ok":ok,"detail":detail})
    add("Python runtime",sys.version_info>=(3,11),sys.version.split()[0])
    node=_node_path(settings); add("Node runtime",bool(node),node or "not found")
    chrome=_chromium_path(); add("Chromium",bool(chrome),chrome or "not found; install Google Chrome/Chromium or set CIEAV_CHROMIUM")
    api_build=settings.root/"apps"/"api"/"dist"/"server.js"; add("Production semantic bridge",api_build.exists(),str(api_build))
    entry=settings.root/"apps"/"browser"/"main.mjs"; add("Browser mediator",entry.exists(),str(entry))
    test_lab=settings.root/"apps"/"browser"/"test-lab.html"; add("Protected Test Lab",test_lab.exists(),str(test_lab))
    router=_router_direct(settings).status(); cloud=router.get("cloud",{})
    add("CIEAV Cloud Intelligence",bool(cloud.get("healthy")),f"configured={cloud.get('configured')} enrolled={cloud.get('enrolled')} model={cloud.get('model')} url={cloud.get('baseUrl')}")
    local=router.get("local",{}); add("Optional local model",bool(local.get("healthy")) if local.get("configured") else True,f"configured={local.get('configured')} healthy={local.get('healthy')}")
    try:
        status=_gateway_request(settings,"/health"); add("Gateway",True,f"pid={status.get('gatewayPid')} paused={status.get('paused')}")
    except Exception as exc: add("Gateway",False,str(exc))
    try:
        service=service_status(settings); add("OS startup service",bool(service.get("installed")),f"{service.get('platform')}: {service.get('detail')}")
    except Exception as exc: add("OS startup service",False,str(exc))
    return {"ok":all(c["ok"] for c in checks[:6]),"brand":"CIEAV","checks":checks}


def build_parser() -> argparse.ArgumentParser:
    p=argparse.ArgumentParser(prog="cieav",description="CIEAV — the commit layer for consequential digital actions")
    sub=p.add_subparsers(dest="command",required=True)
    g=sub.add_parser("gateway",help="Manage the always-on CIEAV Gateway"); gs=g.add_subparsers(dest="gateway_command",required=True)
    for name,help_text in [("run","Run the Gateway in the foreground"),("status","Show live Gateway status"),("install","Install and start the per-user OS service"),("uninstall","Remove the per-user OS service"),("start","Start the installed OS service"),("stop","Stop the installed OS service"),("restart","Restart the installed OS service"),("pause","Pause CIEAV protection while keeping the Gateway alive"),("resume","Resume CIEAV protection"),("restart-surface","Restart only the protected browser surface")]: gs.add_parser(name,help=help_text)
    c=sub.add_parser("cloud",help="Manage CIEAV Cloud Intelligence"); cs=c.add_subparsers(dest="cloud_command",required=True)
    cs.add_parser("status",help="Show CIEAV Cloud connectivity and enrollment status"); cs.add_parser("enroll",help="Enroll this CIEAV installation with the configured cloud endpoint"); cs.add_parser("probe",help="Run the synthetic critical-payment safety probe through CIEAV Cloud")
    m=sub.add_parser("model",help="Manage optional/diagnostic semantic model providers"); ms=m.add_subparsers(dest="model_command",required=True)
    for name,help_text in [("local-status","Check an optional local OpenAI-compatible model server"),("local-probe","Probe the optional local model"),("hf-login","Securely store a direct Hugging Face fallback token"),("hf-logout","Delete the locally stored Hugging Face fallback token"),("hf-status","Show low-level semantic router status"),("hf-probe","Probe the complete semantic router")]: ms.add_parser(name,help=help_text)
    a=sub.add_parser("audit",help="Inspect the local-only CIEAV lifecycle audit log"); ass=a.add_subparsers(dest="audit_command",required=True); at=ass.add_parser("tail",help="Show recent local audit events"); at.add_argument("--limit",type=int,default=25,help="Number of events to show (1-500)")
    sub.add_parser("doctor",help="Check runtime, browser, cloud, Gateway and service health"); sub.add_parser("dashboard",help="Open the local CIEAV Control Center"); sub.add_parser("test-lab",help="Open synthetic scenarios inside the protected CIEAV browser")
    return p


def main(argv:list[str]|None=None)->int:
    args=build_parser().parse_args(argv)
    try:
        settings=Settings.load()
        if args.command=="gateway":
            cmd=args.gateway_command
            if cmd=="run": return run_gateway(settings)
            if cmd=="install": _print(install_service(settings)); return 0
            if cmd=="uninstall": _print(uninstall_service(settings)); return 0
            if cmd=="start": _print(start_service(settings)); return 0
            if cmd=="stop": _print(stop_service(settings)); return 0
            if cmd=="restart": _print(restart_service(settings)); return 0
            if cmd=="status":
                try: payload=_gateway_request(settings,"/v1/status"); payload["service"]=service_status(settings)
                except Exception: payload={"gateway":"offline","service":service_status(settings)}
                _print(payload); return 0
            if cmd=="pause": _print(_gateway_request(settings,"/v1/pause","POST")); return 0
            if cmd=="resume": _print(_gateway_request(settings,"/v1/resume","POST")); return 0
            if cmd=="restart-surface": _print(_gateway_request(settings,"/v1/restart-surface","POST")); return 0
        if args.command=="cloud":
            cloud=CloudSemanticProvider()
            if args.cloud_command=="status": status=cloud.status(); _print({"ok":bool(status.get("healthy")),"cloud":status}); return 0 if status.get("healthy") else 2
            if args.cloud_command=="enroll": result=cloud.enroll(force=True); _print(result); return 0 if result.get("ok") else 2
            if args.cloud_command=="probe": result=cloud.probe(); _print(result); return 0 if result.get("probePassed") else 2
        if args.command=="model":
            cmd=args.model_command
            if cmd=="local-status": status=LocalSemanticProvider().status(); _print({"ok":bool(status.get("healthy")),"localModel":status}); return 0 if status.get("healthy") else 2
            if cmd=="local-probe": result=LocalSemanticProvider().probe(); _print(result); return 0 if result.get("probePassed") else 2
            if cmd=="hf-login": token=getpass.getpass("Hugging Face token (input hidden): ").strip(); settings.write_hf_token(token); print("Hugging Face fallback token stored locally. Restart the Gateway to activate it."); return 0
            if cmd=="hf-logout": removed=settings.delete_hf_token(); print("Removed local Hugging Face token." if removed else "No local Hugging Face token was stored."); return 0
            if cmd=="hf-status":
                try: _print(_gateway_request(settings,"/v1/hf/status"))
                except Exception: _print({"ok":True,"gateway":"offline","semanticRouter":_router_direct(settings).status()})
                return 0
            if cmd=="hf-probe":
                try: result=_gateway_request(settings,"/v1/hf/probe","POST")
                except Exception: result=_router_direct(settings).probe()
                _print(result); return 0 if result.get("probePassed") else 2
        if args.command=="audit":
            if args.audit_command=="tail": _print(_audit_tail(settings,args.limit)); return 0
        if args.command=="doctor": report=_doctor(settings); _print(report); return 0 if report["ok"] else 1
        if args.command=="dashboard": return _open_url(f"http://127.0.0.1:{settings.control_port}")
        if args.command=="test-lab": result=_gateway_request(settings,"/v1/open-test-lab","POST"); print("Opened CIEAV Test Lab inside the protected browser surface."); _print(result); return 0
    except KeyboardInterrupt: return 130
    except Exception as exc: print(f"CIEAV error: {exc}",file=sys.stderr); return 1
    return 2


if __name__=="__main__": raise SystemExit(main())
