from __future__ import annotations

import os
import secrets
import shutil
import socket
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path

from .verifier import CieavVerifierClient, VerifierError


def _free_loopback_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


@dataclass
class NodeVerifierProcess:
    root: Path
    node_executable: str | None = None
    port: int | None = None
    token: str | None = None
    startup_timeout_seconds: float = 15.0
    process: subprocess.Popen[str] | None = field(default=None, init=False)
    _stdout: str = field(default="", init=False)

    def _node(self) -> str:
        if self.node_executable:
            return self.node_executable
        bundled = self.root / "runtime" / ("node.exe" if os.name == "nt" else "node")
        if bundled.is_file():
            return str(bundled)
        resolved = shutil.which("node")
        if resolved:
            return resolved
        raise VerifierError("Node runtime is required for the canonical CIEAV verifier")

    def start(self) -> CieavVerifierClient:
        if self.process and self.process.poll() is None:
            raise VerifierError("CIEAV verifier process is already running")
        port = self.port or _free_loopback_port()
        token = self.token or secrets.token_urlsafe(48)
        if len(token) < 32:
            raise VerifierError("generated verifier token is unexpectedly weak")
        entry = self.root / "scripts" / "ml-verifier-server.mjs"
        core = self.root / "packages" / "core" / "dist" / "index.js"
        if not entry.is_file():
            raise VerifierError(f"CIEAV Node verifier entrypoint is missing: {entry}")
        if not core.is_file():
            raise VerifierError("CIEAV core is not built; run npm run build -w @cieav/core first")
        env = dict(os.environ)
        for key in ("CIEAV_GATEWAY_TOKEN", "LATCH_GATEWAY_TOKEN", "JWT_SECRET", "RECEIPT_SIGNING_SECRET", "HF_TOKEN", "HUGGING_FACE_HUB_TOKEN", "OPENAI_API_KEY"):
            env.pop(key, None)
        env["CIEAV_ML_VERIFIER_PORT"] = str(port)
        env["CIEAV_ML_VERIFIER_TOKEN"] = token
        self.process = subprocess.Popen(
            [self._node(), str(entry)],
            cwd=self.root,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        self.port, self.token = port, token
        client = CieavVerifierClient(f"http://127.0.0.1:{port}", token, timeout_seconds=2.0)
        deadline = time.monotonic() + self.startup_timeout_seconds
        last_error: Exception | None = None
        while time.monotonic() < deadline:
            if self.process.poll() is not None:
                output = self.process.stdout.read() if self.process.stdout else ""
                raise VerifierError(f"CIEAV Node verifier exited during startup ({self.process.returncode}): {output[-2000:]}")
            try:
                client.health()
                return client
            except Exception as exc:
                last_error = exc
                time.sleep(0.1)
        self.stop()
        raise VerifierError(f"CIEAV Node verifier did not become ready: {last_error}")

    def stop(self) -> None:
        process, self.process = self.process, None
        if not process or process.poll() is not None:
            return
        process.terminate()
        try:
            process.wait(timeout=4)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=2)

    def __enter__(self) -> CieavVerifierClient:
        return self.start()

    def __exit__(self, exc_type, exc, tb) -> None:
        self.stop()
