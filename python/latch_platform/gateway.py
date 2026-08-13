from __future__ import annotations

import json
import os
import secrets
import shutil
import signal
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler

from .config import Settings
from .hf_provider import HFConfig, HuggingFaceSemanticProvider


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _request_json(url: str, *, method: str = "GET", payload: dict | None = None, timeout: float = 1.5, token: str | None = None) -> dict:
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {"accept": "application/json"}
    if body is not None:
        headers["content-type"] = "application/json"
    if token:
        headers["authorization"] = f"Bearer {token}"
    opener=build_opener(_NoRedirect)
    with opener.open(Request(url, data=body, headers=headers, method=method), timeout=timeout) as r:
        raw=r.read(262_145)
        if len(raw)>262_144: raise RuntimeError("CIEAV local control response exceeded size limit")
        value=json.loads(raw.decode("utf-8") or "{}")
        if not isinstance(value,dict): raise RuntimeError("CIEAV local control returned a non-object response")
        return value


def _redacted_url(url: str) -> str:
    try:
        parts = urlsplit(url)
        return urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))
    except Exception:
        return "[invalid-url]"


class Gateway:
    """Always-on local control plane for CIEAV.

    The Gateway owns process lifecycle, local signing secrets, semantic routing,
    health, and privileged local control. Chromium never receives provider tokens,
    the Gateway bearer token, receipt/API signing keys, or the browser-control
    capability used between the Gateway and the Node mediator.
    """

    def __init__(self, settings: Settings):
        self.s = settings
        self.token = settings.token()
        hf_cfg = HFConfig.load()
        if not hf_cfg.token:
            hf_cfg = HFConfig(token=settings.read_hf_token(), model=hf_cfg.model, provider=hf_cfg.provider, endpoint_url=hf_cfg.endpoint_url, timeout_seconds=hf_cfg.timeout_seconds)
        self.hf = HuggingFaceSemanticProvider(hf_cfg)
        self.stop_event = threading.Event()
        self.paused = False
        self.semantic: subprocess.Popen | None = None
        self.surface: subprocess.Popen | None = None
        self.surface_control_token: str | None = None
        self.semantic_started_at: float | None = None
        self.surface_started_at: float | None = None
        self.semantic_restart_count = 0
        self.surface_restart_count = 0
        self.semantic_last_exit: int | None = None
        self.surface_last_exit: int | None = None
        self._lock = threading.RLock()

    @property
    def semantic_entry(self) -> Path: return self.s.root / "apps" / "api" / "dist" / "server.js"
    @property
    def browser_entry(self) -> Path: return self.s.root / "apps" / "browser" / "main.mjs"
    @property
    def test_lab_file(self) -> Path: return self.s.root / "apps" / "browser" / "test-lab.html"
    @property
    def test_lab_url(self) -> str: return f"http://127.0.0.1:{self.s.gateway_port}/test-lab"

    def node_executable(self) -> str:
        bundled = self.s.root / "runtime" / ("node.exe" if os.name == "nt" else "node")
        if bundled.exists(): return str(bundled)
        system = shutil.which("node")
        if system: return system
        raise RuntimeError("CIEAV Node runtime is missing")

    def _log(self, message: str) -> None:
        self.s.ensure()
        line = f"{time.strftime('%Y-%m-%dT%H:%M:%S%z')} {message}\n"
        with self.s.log_file.open("a", encoding="utf-8") as f: f.write(line)
        print(f"CIEAV Gateway · {message}", flush=True)

    def _base_env(self) -> dict[str, str]:
        env = dict(os.environ)
        for key in (
            "HF_TOKEN","HUGGING_FACE_HUB_TOKEN","JWT_SECRET","RECEIPT_SIGNING_SECRET",
            "CIEAV_GATEWAY_TOKEN","LATCH_GATEWAY_TOKEN","CIEAV_TEST_AUTO_APPROVE","LATCH_TEST_AUTO_APPROVE",
            "CIEAV_BROWSER_CONTROL_TOKEN","LATCH_BROWSER_CONTROL_TOKEN"
        ):
            env.pop(key, None)
        env["CIEAV_STATE_DIR"] = str(self.s.state_dir)
        env["CIEAV_CONTROL_PORT"] = str(self.s.control_port)
        env["CIEAV_API_PORT"] = str(self.s.api_port)
        env["CIEAV_GATEWAY_PORT"] = str(self.s.gateway_port)
        return env

    def _semantic_env(self) -> dict[str, str]:
        env = self._base_env()
        env["PORT"] = str(self.s.api_port)
        env["JWT_SECRET"] = self.s.local_api_secret()
        env["RECEIPT_SIGNING_SECRET"] = self.s.receipt_signing_secret()
        env["CIEAV_GATEWAY_URL"] = f"http://127.0.0.1:{self.s.gateway_port}"
        env["CIEAV_GATEWAY_TOKEN"] = self.token
        env["CIEAV_HF_ENABLED"] = "1" if self.hf.configured else "0"
        return env

    def _surface_env(self, control_token: str | None = None) -> dict[str, str]:
        env = self._base_env()
        for key in ("JWT_SECRET","RECEIPT_SIGNING_SECRET","CIEAV_GATEWAY_TOKEN","LATCH_GATEWAY_TOKEN"):
            env.pop(key, None)
        token=control_token or secrets.token_urlsafe(48)
        if len(token)<43: raise RuntimeError("Browser control token is too weak")
        env["CIEAV_BROWSER_CONTROL_TOKEN"] = token
        env["CIEAV_REQUIRE_PRODUCTION_API"] = "1"
        env["CIEAV_TEST_AUTO_APPROVE"] = "0"
        return env

    def _terminate(self, child: subprocess.Popen | None, label: str) -> int | None:
        if not child or child.poll() is not None: return None if child is None else child.returncode
        self._log(f"stopping {label} pid={child.pid}")
        child.terminate()
        try: child.wait(timeout=6)
        except subprocess.TimeoutExpired:
            child.kill(); child.wait(timeout=3)
        return child.returncode

    def _wait_semantic(self, timeout: float = 12.0) -> bool:
        deadline = time.time() + timeout
        while time.time() < deadline and not self.stop_event.is_set():
            try:
                health = _request_json(f"http://127.0.0.1:{self.s.api_port}/health", timeout=.7)
                if health.get("ok") and health.get("service") == "cieav-local-api": return True
            except Exception: pass
            with self._lock:
                if self.semantic and self.semantic.poll() is not None: return False
            time.sleep(.12)
        return False

    def start_semantic(self) -> None:
        with self._lock:
            if self.stop_event.is_set() or (self.semantic and self.semantic.poll() is None): return
            if not self.semantic_entry.exists(): raise RuntimeError("Production semantic API is not built. Run npm run build:api first.")
            self.semantic = subprocess.Popen([self.node_executable(), str(self.semantic_entry)], cwd=self.s.root, env=self._semantic_env())
            self.semantic_started_at = time.time(); self._log(f"semantic service started pid={self.semantic.pid}")
        if not self._wait_semantic():
            with self._lock: child=self.semantic; self.semantic=None
            self.semantic_last_exit=self._terminate(child,"semantic service")
            raise RuntimeError("Production semantic service failed its managed health check")

    def stop_semantic(self) -> None:
        with self._lock: child=self.semantic; self.semantic=None
        code=self._terminate(child,"semantic service")
        if code is not None: self.semantic_last_exit=code

    def _browser_request(self, path: str, *, method: str="GET", payload: dict | None=None, timeout: float=3.0) -> dict:
        with self._lock: token=self.surface_control_token
        if not token: raise RuntimeError("Browser control capability is unavailable")
        return _request_json(f"http://127.0.0.1:{self.s.control_port}{path}",method=method,payload=payload,timeout=timeout,token=token)

    def start_surface(self) -> None:
        with self._lock:
            if self.paused or self.stop_event.is_set() or (self.surface and self.surface.poll() is None): return
            if not self.browser_entry.exists(): raise RuntimeError("Browser mediator entry is missing")
        health=self._semantic_health()
        if not health.get("ok") or health.get("service")!="cieav-local-api": raise RuntimeError("Refusing protected surface without the managed CIEAV local API")
        control_token=secrets.token_urlsafe(48)
        with self._lock:
            self.surface_control_token=control_token
            self.surface=subprocess.Popen([self.node_executable(),str(self.browser_entry)],cwd=self.s.root,env=self._surface_env(control_token))
            self.surface_started_at=time.time(); self._log(f"browser surface started pid={self.surface.pid}")
        self._write_runtime()

    def stop_surface(self) -> None:
        with self._lock: child=self.surface; self.surface=None
        code=self._terminate(child,"browser surface")
        with self._lock: self.surface_control_token=None
        if code is not None: self.surface_last_exit=code
        self._write_runtime()

    def pause(self) -> None:
        self.paused=True; self.stop_surface(); self._log("protection paused by local control"); self._write_runtime()

    def resume(self) -> None:
        self.paused=False
        if not self._semantic_health().get("ok"): self.start_semantic()
        self.start_surface(); self._log("protection resumed by local control"); self._write_runtime()

    def restart_surface(self) -> None:
        self.stop_surface()
        if not self.paused: self.start_surface()

    def open_surface_url(self, url: str) -> dict:
        if self.paused: raise RuntimeError("CIEAV protection is paused")
        try: parts=urlsplit(url)
        except Exception: raise RuntimeError("Invalid protected URL")
        if parts.scheme not in {"http","https"} or not parts.netloc or parts.username or parts.password: raise RuntimeError("Only credential-free http/https URLs can be opened in the protected surface")
        browser=self._browser_health()
        if not browser.get("ok"): raise RuntimeError("Protected browser surface is not ready")
        result=self._browser_request("/api/open",method="POST",payload={"url":url},timeout=3.0)
        self._log(f"opened protected surface URL {_redacted_url(url)}")
        return {"ok":True,"url":_redacted_url(url),"surface":result}

    def dashboard_url(self) -> str:
        result=self._browser_request("/api/bootstrap",timeout=2.0)
        url=result.get("url")
        if not isinstance(url,str): raise RuntimeError("Browser did not issue a dashboard bootstrap URL")
        parts=urlsplit(url)
        if parts.scheme!="http" or parts.hostname!="127.0.0.1" or parts.port!=self.s.control_port or parts.path!="/": raise RuntimeError("Browser returned an invalid dashboard bootstrap URL")
        return url

    def open_test_lab(self) -> dict: return self.open_surface_url(self.test_lab_url)
    def _browser_health(self) -> dict:
        try: return self._browser_request("/api/status",timeout=1.5)
        except Exception: return {"ok":False,"browserConnected":False}
    def _semantic_health(self) -> dict:
        try: return _request_json(f"http://127.0.0.1:{self.s.api_port}/health")
        except Exception: return {"ok":False}

    def public_health(self) -> dict:
        semantic=self._semantic_health()
        with self._lock:
            return {"ok":True,"platform":"CIEAV Gateway","gatewayPid":os.getpid(),"paused":self.paused,"semanticRunning":bool(self.semantic and self.semantic.poll() is None),"semanticHealthy":bool(semantic.get("ok") and semantic.get("service")=="cieav-local-api"),"surfaceRunning":bool(self.surface and self.surface.poll() is None)}

    def status(self) -> dict:
        with self._lock:
            semantic=self.semantic; surface=self.surface
            semantic_running=bool(semantic and semantic.poll() is None); surface_running=bool(surface and surface.poll() is None)
            semantic_uptime=int(time.time()-self.semantic_started_at) if semantic_running and self.semantic_started_at else 0
            surface_uptime=int(time.time()-self.surface_started_at) if surface_running and self.surface_started_at else 0
        browser=self._browser_health() if surface_running else {"ok":False,"browserConnected":False}; semantic_health=self._semantic_health() if semantic_running else {"ok":False}
        return {"ok":True,"platform":"CIEAV Gateway","runtime":"python","gatewayPid":os.getpid(),"paused":self.paused,"nodeRuntime":self.node_executable(),"semanticRunning":semantic_running,"semanticHealthy":bool(semantic_health.get("ok") and semantic_health.get("service")=="cieav-local-api"),"semanticService":semantic_health.get("service"),"semanticPid":semantic.pid if semantic_running and semantic else None,"semanticUptimeSeconds":semantic_uptime,"semanticRestartCount":self.semantic_restart_count,"semanticLastExitCode":self.semantic_last_exit,"surfaceRunning":surface_running,"surfacePid":surface.pid if surface_running and surface else None,"surfaceUptimeSeconds":surface_uptime,"surfaceRestartCount":self.surface_restart_count,"surfaceLastExitCode":self.surface_last_exit,"browserConnected":bool(browser.get("browserConnected")),"protectedPages":int(browser.get("protectedPages") or 0),"productionApiRequired":bool(browser.get("productionApiRequired",True)),"modelEnabled":bool(self.hf.configured or browser.get("modelEnabled") or semantic_health.get("modelEnabled")),"huggingFace":self.hf.status(),"attention":browser.get("attention",{}),"controlUrl":f"http://127.0.0.1:{self.s.control_port}","testLabUrl":self.test_lab_url,"browserControlAuthenticated":surface_running}

    def _write_runtime(self) -> None:
        try: self.s.write_runtime(self.status())
        except Exception as exc: self._log(f"runtime-state write failed: {exc}")

    def supervise(self) -> None:
        semantic_backoff=1.0; surface_backoff=1.0
        try:
            self.start_semantic()
            if not self.paused: self.start_surface()
        except Exception as exc: self._log(f"initial runtime start failed: {exc}")
        while not self.stop_event.wait(.5):
            with self._lock: semantic=self.semantic; surface=self.surface
            semantic_alive=bool(semantic and semantic.poll() is None)
            if not semantic_alive:
                if semantic:
                    self.semantic_last_exit=semantic.returncode; self.semantic_restart_count+=1; self._log(f"semantic service exited code={semantic.returncode}; restart #{self.semantic_restart_count}")
                    with self._lock:
                        if self.semantic is semantic: self.semantic=None
                if surface and surface.poll() is None: self.stop_surface()
                if self.stop_event.wait(semantic_backoff): break
                try:
                    self.start_semantic(); semantic_backoff=1.0
                    if not self.paused: self.start_surface()
                except Exception as exc: self._log(f"semantic restart failed: {exc}"); semantic_backoff=min(semantic_backoff*2,20.0)
                continue
            if self.semantic_started_at and time.time()-self.semantic_started_at>30: semantic_backoff=1.0
            if self.paused:
                if surface and surface.poll() is None: self.stop_surface()
                surface_backoff=1.0; continue
            surface_alive=bool(surface and surface.poll() is None)
            if not surface_alive:
                if surface:
                    self.surface_last_exit=surface.returncode; self.surface_restart_count+=1; self._log(f"browser surface exited code={surface.returncode}; restart #{self.surface_restart_count}")
                    with self._lock:
                        if self.surface is surface: self.surface=None
                    with self._lock: self.surface_control_token=None
                if self.stop_event.wait(surface_backoff): break
                try: self.start_surface(); surface_backoff=1.0
                except Exception as exc: self._log(f"surface restart failed: {exc}"); surface_backoff=min(surface_backoff*2,20.0)
            elif self.surface_started_at and time.time()-self.surface_started_at>30: surface_backoff=1.0

    def shutdown(self) -> None:
        self.stop_event.set(); self.stop_surface(); self.stop_semantic(); self._log("gateway stopped")


class ControlHandler(BaseHTTPRequestHandler):
    gateway: Gateway
    def log_message(self, fmt: str, *args) -> None: return
    def _headers(self, content_type: str) -> None:
        self.send_header("content-type",content_type); self.send_header("cache-control","no-store"); self.send_header("x-content-type-options","nosniff"); self.send_header("referrer-policy","no-referrer"); self.send_header("content-security-policy","default-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'")
    def _send(self, code:int, payload:dict)->None:
        body=json.dumps(payload).encode("utf-8"); self.send_response(code); self._headers("application/json; charset=utf-8"); self.end_headers(); self.wfile.write(body)
    def _send_html(self, code:int, body:str)->None:
        self.send_response(code); self._headers("text/html; charset=utf-8"); self.end_headers(); self.wfile.write(body.encode("utf-8"))
    def _authorized(self)->bool: return self.headers.get("authorization")==f"Bearer {self.gateway.token}"
    def _read_json(self)->dict:
        try: length=int(self.headers.get("content-length","0"))
        except ValueError: raise ValueError("invalid content-length")
        if length<0 or length>262_144: raise ValueError("request body too large")
        raw=self.rfile.read(length) if length else b"{}"; value=json.loads(raw.decode("utf-8") or "{}")
        if not isinstance(value,dict): raise ValueError("JSON body must be an object")
        return value
    def do_GET(self)->None:
        path=self.path.split("?",1)[0]
        if path=="/health": self._send(200,self.gateway.public_health()); return
        if path=="/test-lab":
            try: body=self.gateway.test_lab_file.read_text("utf-8")
            except FileNotFoundError: self._send(404,{"error":"test_lab_not_found"}); return
            self._send_html(200,body); return
        if not self._authorized(): self._send(401,{"error":"unauthorized"}); return
        if path=="/v1/status": self._send(200,self.gateway.status()); return
        if path=="/v1/hf/status": self._send(200,{"ok":True,"huggingFace":self.gateway.hf.status()}); return
        self._send(404,{"error":"not_found"})
    def do_POST(self)->None:
        if not self._authorized(): self._send(401,{"error":"unauthorized"}); return
        path=self.path.split("?",1)[0]
        try:
            if path=="/v1/pause": self.gateway.pause(); self._send(200,self.gateway.status()); return
            if path=="/v1/resume": self.gateway.resume(); self._send(200,self.gateway.status()); return
            if path=="/v1/restart-surface": self.gateway.restart_surface(); self._send(200,self.gateway.status()); return
            if path=="/v1/dashboard": self._send(200,{"ok":True,"url":self.gateway.dashboard_url()}); return
            if path=="/v1/open-test-lab": self._send(200,self.gateway.open_test_lab()); return
            if path=="/v1/hf/probe": self._send(200,self.gateway.hf.probe()); return
            if path=="/v1/hf/analyze":
                body=self._read_json(); context=body.get("context"); base=body.get("base")
                if not isinstance(context,dict) or not isinstance(base,dict): self._send(400,{"ok":False,"error":"context_and_base_required"}); return
                self._send(200,self.gateway.hf.analyze(context,base)); return
        except (RuntimeError,ValueError) as exc: self._send(409,{"error":str(exc)}); return
        self._send(404,{"error":"not_found"})


def run_gateway(settings: Settings | None = None) -> int:
    s=settings or Settings.load(); s.ensure(); gateway=Gateway(s); ControlHandler.gateway=gateway
    server=ThreadingHTTPServer(("127.0.0.1",s.gateway_port),ControlHandler); thread=threading.Thread(target=gateway.supervise,name="cieav-supervisor",daemon=True)
    def stop(*_args): gateway.stop_event.set(); threading.Thread(target=server.shutdown,daemon=True).start()
    for sig in (signal.SIGINT,signal.SIGTERM):
        try: signal.signal(sig,stop)
        except (ValueError,OSError): pass
    gateway._log(f"listening on 127.0.0.1:{s.gateway_port} · semantic router configured={gateway.hf.configured}"); thread.start()
    try: server.serve_forever(poll_interval=.5)
    finally: server.server_close(); gateway.shutdown(); thread.join(timeout=8)
    return 0