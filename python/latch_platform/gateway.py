from __future__ import annotations

import json
import os
import signal
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.request import Request, urlopen

from .config import Settings


def _json(url: str, *, timeout: float = 1.5) -> dict:
    with urlopen(Request(url, headers={"accept": "application/json"}), timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8") or "{}")


class Gateway:
    def __init__(self, settings: Settings):
        self.s = settings
        self.token = settings.token()
        self.stop_event = threading.Event()
        self.paused = False
        self.child: subprocess.Popen | None = None
        self.child_started_at: float | None = None
        self.restart_count = 0
        self.last_exit_code: int | None = None
        self._lock = threading.RLock()

    @property
    def production_entry(self) -> Path:
        return self.s.root / "scripts" / "start-production.mjs"

    @property
    def test_lab_file(self) -> Path:
        return self.s.root / "apps" / "browser" / "test-lab.html"

    def _log(self, message: str) -> None:
        self.s.ensure()
        line = f"{time.strftime('%Y-%m-%dT%H:%M:%S%z')} {message}\n"
        with self.s.log_file.open("a", encoding="utf-8") as f:
            f.write(line)
        print(f"LATCH Gateway · {message}", flush=True)

    def _child_env(self) -> dict[str, str]:
        env = dict(os.environ)
        env.setdefault("LATCH_STATE_DIR", str(self.s.state_dir))
        env.setdefault("LATCH_CONTROL_PORT", str(self.s.control_port))
        env.setdefault("LATCH_API_PORT", str(self.s.api_port))
        env["LATCH_REQUIRE_PRODUCTION_API"] = "1"
        return env

    def start_surface(self) -> None:
        with self._lock:
            if self.paused or self.stop_event.is_set():
                return
            if self.child and self.child.poll() is None:
                return
            if not self.production_entry.exists():
                raise RuntimeError("Production entry missing. Run npm run build:api before starting the Gateway.")
            self.child = subprocess.Popen(
                ["node", str(self.production_entry)],
                cwd=self.s.root,
                env=self._child_env(),
            )
            self.child_started_at = time.time()
            self._log(f"browser surface started pid={self.child.pid}")
            self._write_runtime()

    def stop_surface(self) -> None:
        with self._lock:
            child = self.child
            self.child = None
            if not child or child.poll() is not None:
                self._write_runtime()
                return
            self._log(f"stopping browser surface pid={child.pid}")
            child.terminate()
            try:
                child.wait(timeout=6)
            except subprocess.TimeoutExpired:
                child.kill()
            self.last_exit_code = child.returncode
            self._write_runtime()

    def pause(self) -> None:
        self.paused = True
        self.stop_surface()
        self._log("protection paused by local control")
        self._write_runtime()

    def resume(self) -> None:
        self.paused = False
        self._log("protection resumed by local control")
        self.start_surface()
        self._write_runtime()

    def _browser_health(self) -> dict:
        try:
            return _json(f"http://127.0.0.1:{self.s.control_port}/api/status")
        except Exception:
            return {"ok": False, "browserConnected": False}

    def _semantic_health(self) -> dict:
        try:
            return _json(f"http://127.0.0.1:{self.s.api_port}/health")
        except Exception:
            return {"ok": False}

    def public_health(self) -> dict:
        with self._lock:
            running = bool(self.child and self.child.poll() is None)
            return {
                "ok": True,
                "platform": "LATCH Gateway",
                "gatewayPid": os.getpid(),
                "paused": self.paused,
                "surfaceRunning": running,
            }

    def status(self) -> dict:
        with self._lock:
            child = self.child
            running = bool(child and child.poll() is None)
            uptime = int(time.time() - self.child_started_at) if running and self.child_started_at else 0
            browser = self._browser_health() if running else {"ok": False, "browserConnected": False}
            semantic = self._semantic_health() if running else {"ok": False}
            return {
                "ok": True,
                "platform": "LATCH Gateway",
                "gatewayPid": os.getpid(),
                "paused": self.paused,
                "surfaceRunning": running,
                "surfacePid": child.pid if running and child else None,
                "surfaceUptimeSeconds": uptime,
                "restartCount": self.restart_count,
                "lastExitCode": self.last_exit_code,
                "browserConnected": bool(browser.get("browserConnected")),
                "protectedPages": int(browser.get("protectedPages") or 0),
                "modelEnabled": bool(browser.get("modelEnabled") or semantic.get("modelEnabled")),
                "attention": browser.get("attention", {}),
                "controlUrl": f"http://127.0.0.1:{self.s.control_port}",
                "testLabUrl": f"http://127.0.0.1:{self.s.gateway_port}/test-lab",
            }

    def _write_runtime(self) -> None:
        try:
            self.s.write_runtime(self.status())
        except Exception as exc:
            self._log(f"runtime-state write failed: {exc}")

    def supervise(self) -> None:
        backoff = 1.0
        self.start_surface()
        while not self.stop_event.wait(0.5):
            with self._lock:
                child = self.child
            if self.paused:
                backoff = 1.0
                continue
            if child and child.poll() is None:
                if self.child_started_at and time.time() - self.child_started_at > 30:
                    backoff = 1.0
                continue
            if child:
                self.last_exit_code = child.returncode
                self.restart_count += 1
                self._log(f"browser surface exited code={child.returncode}; restart #{self.restart_count}")
                with self._lock:
                    if self.child is child:
                        self.child = None
            if self.stop_event.wait(backoff):
                break
            try:
                self.start_surface()
            except Exception as exc:
                self._log(f"surface restart failed: {exc}")
            backoff = min(backoff * 2, 20)

    def shutdown(self) -> None:
        self.stop_event.set()
        self.stop_surface()
        self._log("gateway stopped")


class ControlHandler(BaseHTTPRequestHandler):
    gateway: Gateway

    def log_message(self, fmt: str, *args) -> None:
        return

    def _headers(self, content_type: str) -> None:
        self.send_header("content-type", content_type)
        self.send_header("cache-control", "no-store")
        self.send_header("x-content-type-options", "nosniff")
        self.send_header("referrer-policy", "no-referrer")
        self.send_header("content-security-policy", "default-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'")

    def _send(self, code: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self._headers("application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(body)

    def _send_html(self, code: int, body: str) -> None:
        self.send_response(code)
        self._headers("text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(body.encode("utf-8"))

    def _authorized(self) -> bool:
        return self.headers.get("authorization") == f"Bearer {self.gateway.token}"

    def do_GET(self) -> None:
        path = self.path.split("?", 1)[0]
        if path == "/health":
            self._send(200, self.gateway.public_health())
            return
        if path == "/test-lab":
            try:
                body = self.gateway.test_lab_file.read_text("utf-8")
            except FileNotFoundError:
                self._send(404, {"error": "test_lab_not_found"})
                return
            self._send_html(200, body)
            return
        if not self._authorized():
            self._send(401, {"error": "unauthorized"})
            return
        if path == "/v1/status":
            self._send(200, self.gateway.status())
            return
        self._send(404, {"error": "not_found"})

    def do_POST(self) -> None:
        if not self._authorized():
            self._send(401, {"error": "unauthorized"})
            return
        if self.path == "/v1/pause":
            self.gateway.pause()
            self._send(200, self.gateway.status())
            return
        if self.path == "/v1/resume":
            self.gateway.resume()
            self._send(200, self.gateway.status())
            return
        if self.path == "/v1/restart-surface":
            self.gateway.stop_surface()
            self.gateway.start_surface()
            self._send(200, self.gateway.status())
            return
        self._send(404, {"error": "not_found"})


def run_gateway(settings: Settings | None = None) -> int:
    s = settings or Settings.load()
    s.ensure()
    gateway = Gateway(s)
    ControlHandler.gateway = gateway
    server = ThreadingHTTPServer(("127.0.0.1", s.gateway_port), ControlHandler)
    thread = threading.Thread(target=gateway.supervise, name="latch-supervisor", daemon=True)

    def stop(*_args):
        gateway.stop_event.set()
        threading.Thread(target=server.shutdown, daemon=True).start()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            signal.signal(sig, stop)
        except (ValueError, OSError):
            pass

    gateway._log(f"listening on 127.0.0.1:{s.gateway_port}")
    thread.start()
    try:
        server.serve_forever(poll_interval=0.5)
    finally:
        server.server_close()
        gateway.shutdown()
        thread.join(timeout=8)
    return 0
