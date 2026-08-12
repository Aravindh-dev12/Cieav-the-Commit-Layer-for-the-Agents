from __future__ import annotations

import json
import os
import secrets
from dataclasses import dataclass
from pathlib import Path


def _repo_root() -> Path:
    configured = os.environ.get("LATCH_HOME")
    if configured:
        return Path(configured).expanduser().resolve()
    candidates = [Path.cwd(), Path(__file__).resolve()]
    for start in candidates:
        for p in [start, *start.parents]:
            if (p / "package.json").exists() and (p / "apps" / "browser" / "main.mjs").exists():
                return p
    raise RuntimeError("Cannot locate LATCH repository. Set LATCH_HOME to the repository/install root.")


def _state_dir() -> Path:
    configured = os.environ.get("LATCH_STATE_DIR")
    if configured:
        return Path(configured).expanduser().resolve()
    return (Path.home() / ".latch").resolve()


@dataclass(frozen=True)
class Settings:
    root: Path
    state_dir: Path
    gateway_port: int
    control_port: int
    api_port: int
    token_file: Path
    runtime_file: Path
    log_file: Path

    @classmethod
    def load(cls) -> "Settings":
        state = _state_dir()
        return cls(
            root=_repo_root(),
            state_dir=state,
            gateway_port=int(os.environ.get("LATCH_GATEWAY_PORT", "8791")),
            control_port=int(os.environ.get("LATCH_CONTROL_PORT", "8790")),
            api_port=int(os.environ.get("LATCH_API_PORT", "8787")),
            token_file=state / "gateway-token",
            runtime_file=state / "gateway-runtime.json",
            log_file=state / "gateway.log",
        )

    def ensure(self) -> None:
        self.state_dir.mkdir(parents=True, exist_ok=True)
        try:
            os.chmod(self.state_dir, 0o700)
        except OSError:
            pass

    def token(self) -> str:
        self.ensure()
        try:
            value = self.token_file.read_text("utf-8").strip()
            if len(value) >= 32:
                return value
        except FileNotFoundError:
            pass
        value = secrets.token_urlsafe(32)
        self.token_file.write_text(value, "utf-8")
        try:
            os.chmod(self.token_file, 0o600)
        except OSError:
            pass
        return value

    def write_runtime(self, payload: dict) -> None:
        self.ensure()
        self.runtime_file.write_text(json.dumps(payload, indent=2), "utf-8")
        try:
            os.chmod(self.runtime_file, 0o600)
        except OSError:
            pass
