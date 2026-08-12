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
    """Always-on Python control plane for LATCH.

    Python owns process lifecycle, health, restart policy and local control.
    Node is used only for the compiled semantic service and Chromium surface.
    """

    def __init__(self, settings: Settings):
        self.s = settings
        self.token = settings.token()
        self.stop_event = threading.Event()
        self.paused = False
        self.semantic: subprocess.Popen | None = None
        self.surface: subprocess.Popen | None = None
        self.semantic_started_at: float | None = None
        self.surface_started_at: float | None = None
        self.semantic_restart_count = 0
        self.surface_restart_count = 0
        self.semantic_last_exit: int | None = None
        self.surface_last_exit: int | None = None
        self._lock = threading.RLock()

    @property
    def semantic_entry(self) -> Path:
        return self.s.root / "apps" / "api" / "dist" / "server.js"

    @property
    def browser_entry(self) -> Path:
        return self.s.root / "apps" / "browser" / "main.mjs"

    @property
    def test_lab_file(self) -> Path:
        return self.s.root / "apps" / "browser" / "test-lab.html"

    def _log(self, message: str) -> None:
        self.s.ensure()
        line = f"{time.strftime('%Y-%m-%dT%H:%M:%S%z')} {message}\n"
        with self.s.log_file.open("a", encoding="utf-8") as f:
            f.write(line)
        print(f"LATCH Gateway · {message}", flush=True)

    def _base_env(self) -> dict[str, str]:
        env = dict(os.environ)
        env.setdefault("LATCH_STATE_DIR", str(self.s.state_dir))
        env.setdefault("LATCH_CONTROL_PORT", str(self.s.control_port))
        env.setdefault("LATCH_API_PORT", str(self.s.api_port))
        return env

    def _semantic_env(self) -> dict[str, str]:
        env = self._base_env()
        env["PORT"] = str(self.s.api_port)
        return env

    def _surface_env(self) -> dict[str, str]:
        env = self._base_env()
        env["LATCH_REQUIRE_PRODUCTION_API"] = "1"
        return env

    def _terminate(self, child: subprocess.Popen | None, label: str) -> int | None:
        if not child or child.poll() is not None:
            return None if child is None else child.returncode
        self._log(f"stopping {label} pid={child.pid}")
        child.terminate()
        try:
            child.wait(timeout=6)
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait(timeout=3)
        return child.returncode

    def _wait_semantic(self, timeout: float = 12.0) -> bool:
        deadline = time.time() + timeout
        while time.time() < deadline and not self.stop_event.is_set():
            try:
                if _json(f"http://127.0.0.1:{self.s.api_port}/health", timeout=.7).get("ok", True):
                    return True
            except Exception:
                pass
            with self._lock:
                if self.semantic and self.semantic.poll() is not None:
                    return False
            time.sleep(.12)
        return False

    def start_semantic(self) -> None:
        with self._lock:
            if self.stop_event.is_set():
                return
            if self.semantic and self.semantic.poll() is None:
                return
            if not self.semantic_entry.exists():
                raise RuntimeError("Production semantic API is not built. Run npm run build:api first.")
            self.semantic = subprocess.Popen(
                ["node", str(self.semantic_entry)],
                cwd=self.s.root,
                env=self._semantic_env(),
            )
            self.semantic_started_at = time.time()
            self._log(f"semantic service started pid={self.semantic.pid}")
        if not self._wait_semantic():
            with self._lock:
                child = self.semantic
                self.semantic = None
            code = self._terminate(child, "semantic service")
            self.semantic_last_exit = code
            raise RuntimeError("Production semantic service failed its health check")

    def stop_semantic(self) -> None:
        with self._lock:
            child = self.semantic
            self.semantic = None
        code = self._terminate(child, "semantic service")
        if code is not None:
            self.semantic_last_exit = code

    def start_surface(self) -> None:
        with self._lock:
            if self.paused or self.stop_event.is_set():
                return
            if self.surface and self.surface.poll() is None:
                return
            if not self.browser_entry.exists():
                raise RuntimeError("Browser mediator entry is missing")
        if not self._semantic_health().get("ok"):
            raise RuntimeError("Refusing to start browser surface without a healthy semantic service")
        with self._lock:
            self.surface = subprocess.Popen(
                ["node", str(self.browser_entry)],
                cwd=self.s.root,
                env=self._surface_env(),
            )
            self.surface_started_at = time.time()
            self._log(f"browser surface started pid={self.surface.pid}")
            self._write_runtime()

    def stop_surface(self) -> None:
        with self._lock:
            child = self.surface
            self.surface = None
        code = self._terminate(child, "browser surface")
        if code is not None:
            self.surface_last_exit = code
        self._write_runtime()

    def pause(self) -> None:
        self.paused = True
        self.stop_surface()
        self._log("protection paused by local control")
        self._write_runtime()

    def resume(self) -> None:
        self.paused = False
        if not self._semantic_health().get("ok"):
            self.start_semantic()
        self.start_surface()
        self._log("protection resumed by local control")
        self._write_runtime()

    def restart_surface(self) -> None:
        self.stop_surface()
        if not self.paused:
            self.start_surface()

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
        semantic = self._semantic_health()
        with self._lock:
            surface_running = bool(self.surface and self.surface.poll() is None)
            semantic_running = bool(self.semantic and self.semantic.poll() is None)
            return {
                "ok": True,
                "platform": "LATCH Gateway",
                "gatewayPid": os.getpid(),
                "paused": self.paused,
                "semanticRunning": semantic_running,
                "semanticHealthy": bool(semantic.get("ok")),
                "surfaceRunning": surface_running,
            }

    def status(self) -> dict:
        with self._lock:
            semantic = self.semantic
            surface = self.surface
            semantic_running = bool(semantic and semantic.poll() is None)
            surface_running = bool(surface and surface.poll() is None)
            semantic_uptime = int(time.time() - self.semantic_started_at) if semantic_running and self.semantic_started_at else 0
            surface_uptime = int(time.time() - self.surface_started_at) if surface_running and self.surface_started_at else 0
        browser = self._browser_health() if surface_running else {"ok": False, "browserConnected": False}
        semantic_health = self._semantic_health() if semantic_running else {"ok": False}
        return {
            "ok": True,
            "platform": "LATCH Gateway",
            "runtime": "python",
            "gatewayPid": os.getpid(),
            "paused": self.paused,
            "semanticRunning": semantic_running,
            "semanticHealthy": bool(semantic_health.get("ok")),
            "semanticPid": semantic.pid if semantic_running and semantic else None,
            "semanticUptimeSeconds": semantic_uptime,
            "semanticRestartCount": self.semantic_restart_count,
            "semanticLastExitCode": self.semantic_last_exit,
            "surfaceRunning": surface_running,
            "surfacePid": surface.pid if surface_running and surface else None,
            "surfaceUptimeSeconds": surface_uptime,
            "surfaceRestartCount": self.surface_restart_count,
            "surfaceLastExitCode": self.surface_last_exit,
            "browserConnected": bool(browser.get("browserConnected")),
            "protectedPages": int(browser.get("protectedPages") or 0),
            "modelEnabled": bool(browser.get("modelEnabled") or semantic_health.get("modelEnabled")),
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
        semantic_backoff = 1.0
        surface_backoff = 1.0
        try:
            self.start_semantic()
            if not self.paused:
                self.start_surface()
        except Exception as exc:
            self._log(f"initial runtime start failed: {exc}")

        while not self.stop_event.wait(.5):
            with self._lock:
                semantic = self.semantic
                surface = self.surface

            semantic_alive = bool(semantic and semantic.poll() is None)
            if not semantic_alive:
                if semantic:
                    self.semantic_last_exit = semantic.returncode
                    self.semantic_restart_count += 1
                    self._log(f"semantic service exited code={semantic.returncode}; restart #{self.semantic_restart_count}")
                    with self._lock:
                        if self.semantic is semantic:
                            self.semantic = None
                # Never keep a protected surface alive without its production semantic backend.
                if surface and surface.poll() is None:
                    self.stop_surface()
                if self.stop_event.wait(semantic_backoff):
                    break
                try:
                    self.start_semantic()
                    semantic_backoff = 1.0
                    if not self.paused:
                        self.start_surface()
                except Exception as exc:
                    self._log(f"semantic restart failed: {exc}")
                    semantic_backoff = min(semantic_backoff * 2, 20.0)
                continue

            if self.semantic_started_at and time.time() - self.semantic_started_at > 30:
                semantic_backoff = 1.0

            if self.paused:
                if surface and surface.poll() is None:
                    self.stop_surface()
                surface_backoff = 1.0
                continue

            surface_alive = bool(surface and surface.poll() is None)
            if not surface_alive:
                if surface:
                    self.surface_last_exit = surface.returncode
                    self.surface_restart_count += 1
                    self._log(f"browser surface exited code={surface.returncode}; restart #{self.surface_restart_count}")
                    with self._lock:
                        if self.surface is surface:
                            self.surface = None
                if self.stop_event.wait(surface_backoff):
                    break
                try:
                    self.start_surface()
                    surface_backoff = 1.0
                except Exception as exc:
                    self._log(f"surface restart failed: {exc}")
                    surface_backoff = min(surface_backoff * 2, 20.0)
            elif self.surface_started_at and time.time() - self.surface_started_at > 30:
                surface_backoff = 1.0

    def shutdown(self) -> None:
        self.stop_event.set()
        self.stop_surface()
        self.stop_semantic()
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
            self.gateway.restart_surface()
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
        server.serve_forever(poll_interval=.5)
    finally:
        server.server_close()
        gateway.shutdown()
        thread.join(timeout=8)
    return 0
