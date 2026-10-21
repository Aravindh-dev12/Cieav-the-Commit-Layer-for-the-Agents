"""
CIEAV Host Driver Bridge for Reflex.
=============================================================================
Implements the Reflex Real Driver Contract over HTTP:
Reflex POSTs {"step": {...}, "value": "..."} to DRIVER_URL.
CIEAV executes the step across real host applications (CDP Chrome/Edge,
Win32 desktop apps, or sandboxed shell) and replies with:
{"ok": bool, "text": str, "ui": list[str]}
where 'ui' reports the list of currently visible controls on screen/page
(used by the Reflex Autonomous Self-Repair Agent).
"""

from __future__ import annotations
import os
import sys
import json
import time
import logging
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Any, Dict, List, Optional

from commit_layer.reflex.engine import drive_step, get_db
from commit_layer.models import Action, RiskLevel, Status
from commit_layer import receipts

logger = logging.getLogger(__name__)

DEFAULT_BRIDGE_PORT = int(os.environ.get("CIEAV_DRIVER_PORT", "8765"))


class ReflexDriverHandler(BaseHTTPRequestHandler):
    """Handles incoming HTTP driver execution requests from Reflex."""

    def do_POST(self):
        if self.path not in ("/driver", "/api/driver", "/"):
            self.send_response(404)
            self.end_headers()
            return

        try:
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length).decode("utf-8")
            data = json.loads(body) if body else {}

            step = data.get("step", {})
            value = data.get("value")
            if "value" not in step and value is not None:
                step["value"] = value

            # Execute via CIEAV's real drivers
            db_conn = get_db()
            driver_result = drive_step(db_conn, step, {"value": value} if value else {})

            # Two-Phase Commit Audit Receipt
            act = Action(
                tool_name="reflex_driver_actuation",
                args={"step": step, "value": value},
                risk=RiskLevel.LOW if step.get("risk") in ("R0", "R1") else RiskLevel.CRITICAL,
                reasons=[f"Reflex step #{step.get('n', 0)} ({step.get('action')}) dispatched to CIEAV driver"]
            )
            receipts.create_receipt(act, Status.COMMITTED.value, approved_by="reflex_bridge")

            response_payload = {
                "ok": driver_result.get("ok", True),
                "text": driver_result.get("text", ""),
                "ui": driver_result.get("ui", [])
            }

            resp_bytes = json.dumps(response_payload).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(resp_bytes)))
            self.end_headers()
            self.wfile.write(resp_bytes)

        except Exception as e:
            logger.error(f"Error handling Reflex driver call: {e}")
            err_resp = json.dumps({"ok": False, "text": str(e), "ui": []}).encode("utf-8")
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(err_resp)))
            self.end_headers()
            self.wfile.write(err_resp)

    def log_message(self, format, *args):
        # Quiet standard HTTP access logs
        pass


class CIEAVReflexBridgeServer:
    """Manages the background HTTP server for Reflex driver requests."""

    def __init__(self, port: int = DEFAULT_BRIDGE_PORT):
        self.port = port
        self.server: Optional[HTTPServer] = None
        self.thread: Optional[threading.Thread] = None
        self.is_running = False

    def start(self, daemon: bool = True):
        """Start the bridge server in a background thread."""
        if self.is_running:
            return
        self.server = HTTPServer(("127.0.0.1", self.port), ReflexDriverHandler)
        self.is_running = True
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=daemon)
        self.thread.start()
        logger.info(f"[Reflex Driver Bridge] Listening on http://127.0.0.1:{self.port}/driver")

    def stop(self):
        """Stop the bridge server."""
        if self.server and self.is_running:
            self.server.shutdown()
            self.server.server_close()
            self.is_running = False


reflex_bridge_server = CIEAVReflexBridgeServer()


if __name__ == "__main__":
    print(f"Starting CIEAV Reflex Driver Bridge on http://127.0.0.1:{DEFAULT_BRIDGE_PORT}/driver...")
    server = HTTPServer(("127.0.0.1", DEFAULT_BRIDGE_PORT), ReflexDriverHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Reflex Driver Bridge.")
        server.server_close()
